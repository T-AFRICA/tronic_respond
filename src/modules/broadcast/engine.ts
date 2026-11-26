import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { isLiveBroadcastingEnabled } from "@/lib/config";
import {
  getContactByPhone,
  createOrUpdateContact,
  sendTemplateMessage,
  RespondIoError,
} from "@/integrations/respondio/client";

/**
 * Campaign execution engine — consumed by the BullMQ `campaign-send` worker.
 *
 * SAFETY MODEL (fail closed):
 *  - dry_run  → never calls the provider. Counts/validates eligible recipients.
 *  - test     → sends ONLY to numbers on the system_settings test allowlist.
 *  - live     → requires ALL of: env ENABLE_LIVE_BROADCASTING=true,
 *               system_settings.live_broadcasting_approved=true, an approved
 *               template, and an approved campaign. One live job per campaign,
 *               ever (DB unique index).
 *
 * IDEMPOTENCY / DUPLICATE PREVENTION:
 *  - campaign_recipients are unique per (campaign, customer).
 *  - a recipient is "claimed" by moving status queued→unknown before the API
 *    call; the outcome then settles it to sent/failed. A crash leaves it at
 *    'unknown' — resumed jobs NEVER resend 'unknown' recipients.
 *  - pause/cancel are honored between batches.
 */

type Job = {
  id: string;
  campaign_id: string;
  kind: "dry_run" | "test" | "live";
  status: string;
  batch_size: number;
  batch_delay_ms: number;
  params: { test_numbers?: string[] } | null;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function failJob(admin: SupabaseClient, jobId: string, error: string) {
  await admin
    .from("campaign_jobs")
    .update({ status: "failed", error, finished_at: new Date().toISOString() })
    .eq("id", jobId);
}

async function getAllowlist(admin: SupabaseClient): Promise<string[]> {
  const { data } = await admin
    .from("system_settings")
    .select("value")
    .eq("key", "test_whatsapp_allowlist")
    .single();
  return Array.isArray(data?.value)
    ? (data.value as unknown[]).map(String).filter(Boolean)
    : [];
}

export async function runCampaignSendJob(campaignJobId: string): Promise<void> {
  const admin = createSupabaseAdminClient();

  const { data: job } = (await admin
    .from("campaign_jobs")
    .select("*")
    .eq("id", campaignJobId)
    .single()) as { data: Job | null };
  if (!job) throw new Error(`campaign_job ${campaignJobId} not found`);
  if (!["queued", "running"].includes(job.status)) return; // paused/cancelled

  const { data: campaign } = await admin
    .from("campaigns")
    .select("*")
    .eq("id", job.campaign_id)
    .single();
  if (!campaign) {
    await failJob(admin, job.id, "Campaign not found");
    return;
  }

  // ---------- Gates ----------
  if (job.kind !== "dry_run") {
    if (!campaign.template_name) {
      await failJob(
        admin,
        job.id,
        "Campaign has no WhatsApp template — marketing messages outside the 24h window require an approved template.",
      );
      return;
    }
    const { data: templates } = await admin
      .from("message_templates")
      .select("status")
      .eq("name", campaign.template_name)
      .limit(1);
    if (!templates?.length || templates[0].status !== "approved") {
      await failJob(
        admin,
        job.id,
        `Template "${campaign.template_name}" is not verified as approved. Verify its Meta approval and mark it approved under the campaign's Execution panel first.`,
      );
      return;
    }
  }

  const allowlist = await getAllowlist(admin);

  if (job.kind === "test" && allowlist.length === 0) {
    await failJob(
      admin,
      job.id,
      "The internal test allowlist is empty — add internal WhatsApp numbers before test sends.",
    );
    return;
  }

  if (job.kind === "live") {
    if (!isLiveBroadcastingEnabled()) {
      await failJob(
        admin,
        job.id,
        "ENABLE_LIVE_BROADCASTING is not 'true' on the server — live sends are disabled (fail closed).",
      );
      return;
    }
    const { data: approvedSetting } = await admin
      .from("system_settings")
      .select("value")
      .eq("key", "live_broadcasting_approved")
      .single();
    if (approvedSetting?.value !== true) {
      await failJob(
        admin,
        job.id,
        "live_broadcasting_approved is off in system settings — a Super Admin must switch it on (fail closed).",
      );
      return;
    }
    if (!["approved", "scheduled", "running"].includes(campaign.status)) {
      await failJob(admin, job.id, `Campaign status is '${campaign.status}' — live sends need an approved campaign.`);
      return;
    }
    if (campaign.scheduled_at && new Date(campaign.scheduled_at) > new Date()) {
      await failJob(
        admin,
        job.id,
        `Campaign is scheduled for ${campaign.scheduled_at} — start it at/after the scheduled time.`,
      );
      return;
    }
  }

  await admin
    .from("campaign_jobs")
    .update({ status: "running", started_at: new Date().toISOString(), error: null })
    .eq("id", job.id);

  // ---------- TEST: allowlisted internal numbers only ----------
  if (job.kind === "test") {
    const requested = (job.params?.test_numbers ?? []).map(String);
    // Defense in depth: the worker intersects with the allowlist again.
    const numbers = (requested.length > 0 ? requested : allowlist).filter((n) =>
      allowlist.includes(n),
    );
    let sent = 0;
    let failed = 0;
    await admin
      .from("campaign_jobs")
      .update({ total_recipients: numbers.length })
      .eq("id", job.id);

    for (const phone of numbers) {
      try {
        // Allowlisted staff numbers may never have messaged the business —
        // create the contact on first test send instead of failing on 404.
        let contact;
        try {
          contact = await getContactByPhone(phone);
        } catch (e) {
          if (e instanceof RespondIoError && e.status === 404) {
            contact = await createOrUpdateContact(phone);
          } else {
            throw e;
          }
        }
        const res = await sendTemplateMessage(
          contact.id,
          campaign.template_name,
          "en",
        );
        sent++;
        await admin.from("message_logs").insert({
          respondio_contact_id: String(contact.id),
          respondio_message_id: res?.messageId ? String(res.messageId) : null,
          direction: "outbound",
          kind: "template",
          status: "sent",
          body_preview: `[TEST] template:${campaign.template_name}`,
          campaign_id: campaign.id,
        });
      } catch (e) {
        failed++;
        await admin.from("message_logs").insert({
          direction: "outbound",
          kind: "template",
          status: "failed",
          body_preview: `[TEST→${phone}] ${e instanceof Error ? e.message : "send failed"}`,
          campaign_id: campaign.id,
          payload:
            e instanceof RespondIoError ? { status: e.status, body: e.body } : null,
        });
      }
      await admin
        .from("campaign_jobs")
        .update({ processed: sent + failed, sent, failed })
        .eq("id", job.id);
      await sleep(Math.max(job.batch_delay_ms, 500));
    }

    await admin
      .from("campaign_jobs")
      .update({ status: "completed", finished_at: new Date().toISOString() })
      .eq("id", job.id);
    return;
  }

  // ---------- DRY RUN / LIVE: campaign recipients ----------
  const { count: total } = await admin
    .from("campaign_recipients")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaign.id)
    .eq("suppressed", false)
    .eq("status", "queued");
  await admin
    .from("campaign_jobs")
    .update({ total_recipients: total ?? 0 })
    .eq("id", job.id);

  let processed = 0;
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let lastId: string | null = null; // keyset cursor for dry_run (statuses unchanged)

  for (;;) {
    // Honor pause/cancel between batches
    const { data: fresh } = await admin
      .from("campaign_jobs")
      .select("status")
      .eq("id", job.id)
      .single();
    if (!fresh || ["paused", "cancelled"].includes(fresh.status)) return;

    let batchQuery = admin
      .from("campaign_recipients")
      .select("id, customer_id, status")
      .eq("campaign_id", campaign.id)
      .eq("suppressed", false)
      .eq("status", "queued")
      .order("id")
      .limit(job.batch_size);
    if (job.kind === "dry_run" && lastId) batchQuery = batchQuery.gt("id", lastId);
    const { data: batch } = await batchQuery;
    if (!batch || batch.length === 0) break;
    lastId = batch[batch.length - 1].id;

    const { data: customers } = await admin
      .from("customers")
      .select("id, whatsapp_phone, respondio_contact_id, is_blocked")
      .in("id", batch.map((b) => b.customer_id));
    const customerOf = new Map((customers ?? []).map((c) => [c.id, c]));

    for (const recipient of batch) {
      processed++;
      const customer = customerOf.get(recipient.customer_id);
      const contactRef = customer?.respondio_contact_id
        ? customer.respondio_contact_id
        : customer?.whatsapp_phone
          ? `phone:${customer.whatsapp_phone}`
          : null;

      if (!customer || customer.is_blocked || !contactRef) {
        skipped++;
        if (job.kind === "live") {
          await admin
            .from("campaign_recipients")
            .update({
              status: "failed",
              error: !customer
                ? "customer missing"
                : customer.is_blocked
                  ? "blocked"
                  : "no phone / contact id",
            })
            .eq("id", recipient.id)
            .eq("status", "queued");
        }
        continue;
      }

      if (job.kind === "dry_run") {
        sent++; // would-send counter — nothing is transmitted
        continue;
      }

      // LIVE — claim the recipient (queued → unknown) so a crash never double-sends
      const { data: claimed } = await admin
        .from("campaign_recipients")
        .update({
          status: "unknown",
          attempts: 1,
          last_attempt_at: new Date().toISOString(),
        })
        .eq("id", recipient.id)
        .eq("status", "queued")
        .select("id");
      if (!claimed || claimed.length === 0) continue; // already handled elsewhere

      try {
        const res = await sendTemplateMessage(
          contactRef,
          campaign.template_name,
          "en",
        );
        sent++;
        await admin
          .from("campaign_recipients")
          .update({
            status: "sent",
            sent_at: new Date().toISOString(),
            respondio_message_id: res?.messageId ? String(res.messageId) : null,
            error: null,
          })
          .eq("id", recipient.id);
        await admin.from("message_logs").insert({
          customer_id: customer.id,
          respondio_contact_id: String(customer.respondio_contact_id ?? ""),
          respondio_message_id: res?.messageId ? String(res.messageId) : null,
          direction: "outbound",
          kind: "template",
          status: "sent",
          body_preview: `template:${campaign.template_name}`,
          campaign_id: campaign.id,
        });
      } catch (e) {
        failed++;
        await admin
          .from("campaign_recipients")
          .update({
            status: "failed",
            error: e instanceof Error ? e.message.slice(0, 500) : "send failed",
          })
          .eq("id", recipient.id);
      }
    }

    await admin
      .from("campaign_jobs")
      .update({ processed, sent, failed, skipped })
      .eq("id", job.id);

    if (job.batch_delay_ms > 0) await sleep(job.batch_delay_ms);
  }

  await admin
    .from("campaign_jobs")
    .update({
      status: "completed",
      processed,
      sent,
      failed,
      skipped,
      finished_at: new Date().toISOString(),
    })
    .eq("id", job.id);

  if (job.kind === "live") {
    await admin
      .from("campaigns")
      .update({ status: "completed", finished_at: new Date().toISOString() })
      .eq("id", campaign.id)
      .in("status", ["running", "approved", "scheduled"]);
  }
}
