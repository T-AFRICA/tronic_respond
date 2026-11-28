"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getMessageStatus } from "@/integrations/respondio/client";

/**
 * Poll Respond.io for the WhatsApp delivery status of this campaign's sent
 * messages and settle each recipient into delivered / read / failed.
 * Caps the number of API lookups per click so the action stays responsive —
 * repeat clicks continue where the last one left off (already-read rows are
 * final and never re-polled).
 */
const REFRESH_CAP = 150;
const CONCURRENCY = 5;

export async function refreshDeliveryStatus(campaignId: string) {
  await requirePermission("campaigns.write");
  const admin = createSupabaseAdminClient();

  // 'sent' rows first (still unconfirmed), then 'delivered' (may upgrade to read).
  const { data: rows } = await admin
    .from("campaign_recipients")
    .select(
      "id, status, respondio_message_id, customers(respondio_contact_id)",
    )
    .eq("campaign_id", campaignId)
    .in("status", ["sent", "delivered"])
    .not("respondio_message_id", "is", null)
    .order("status", { ascending: false }) // 'sent' before 'delivered'
    .order("id")
    .limit(REFRESH_CAP);

  let checked = 0;
  let changed = 0;

  const pending = rows ?? [];
  for (let i = 0; i < pending.length; i += CONCURRENCY) {
    const chunk = pending.slice(i, i + CONCURRENCY);
    await Promise.all(
      chunk.map(async (r) => {
        const customer = Array.isArray(r.customers) ? r.customers[0] : r.customers;
        const contactId = customer?.respondio_contact_id;
        if (!contactId || !r.respondio_message_id) return;
        try {
          const st = await getMessageStatus(contactId, r.respondio_message_id);
          checked++;
          const entries = st.status ?? [];
          const at = (v: string) => {
            const e = entries.find((s) => s.value === v);
            return e?.timestamp
              ? new Date(e.timestamp * 1000).toISOString()
              : null;
          };
          const failedEntry = entries.find((s) => s.value === "failed");
          const readAt = at("read");
          const deliveredAt = at("delivered") ?? readAt;

          if (failedEntry) {
            await admin
              .from("campaign_recipients")
              .update({
                status: "failed",
                error: failedEntry.message ?? "provider failure",
              })
              .eq("id", r.id);
            changed++;
          } else if (readAt) {
            if (r.status !== "read") {
              await admin
                .from("campaign_recipients")
                .update({ status: "read", read_at: readAt, delivered_at: deliveredAt })
                .eq("id", r.id);
              changed++;
            }
          } else if (deliveredAt && r.status !== "delivered") {
            await admin
              .from("campaign_recipients")
              .update({ status: "delivered", delivered_at: deliveredAt })
              .eq("id", r.id);
            changed++;
          }
        } catch {
          // Status endpoint hiccup — leave the row as-is; next refresh retries.
        }
      }),
    );
  }

  revalidatePath(`/dashboard/broadcasting/${campaignId}`);
  redirect(
    `/dashboard/broadcasting/${campaignId}?delivery_refreshed=${checked}&delivery_changed=${changed}`,
  );
}

/**
 * Create a follow-up campaign containing ONLY this campaign's undelivered
 * recipients (failed — plus, optionally, sent-but-unconfirmed), pre-approved
 * so it can be executed straight away. The original campaign is untouched;
 * its one-live-job-ever guarantee stays intact.
 */
export async function createResendCampaign(
  campaignId: string,
  formData: FormData,
) {
  const profile = await requirePermission("campaigns.approve");
  const includePending = formData.get("include_pending") === "on";

  const admin = createSupabaseAdminClient();

  const { data: orig } = await admin
    .from("campaigns")
    .select("id, name, campaign_type, template_name, message_body, segment_id")
    .eq("id", campaignId)
    .single();
  if (!orig) redirect(`/dashboard/broadcasting/${campaignId}?resend_error=notfound`);

  // ----- Collect undelivered customers (paginated) -----
  const statuses = includePending ? ["failed", "sent"] : ["failed"];
  const customerIds: string[] = [];
  for (let fromIdx = 0; ; fromIdx += 1000) {
    const { data: recs } = await admin
      .from("campaign_recipients")
      .select("customer_id, status, delivered_at, read_at")
      .eq("campaign_id", campaignId)
      .eq("suppressed", false)
      .in("status", statuses)
      .order("id")
      .range(fromIdx, fromIdx + 999);
    for (const r of recs ?? []) {
      // 'sent' only counts as undelivered while no delivery/read is confirmed.
      if (r.status === "sent" && (r.delivered_at || r.read_at)) continue;
      customerIds.push(r.customer_id);
    }
    if (!recs || recs.length < 1000) break;
  }

  if (customerIds.length === 0) {
    redirect(`/dashboard/broadcasting/${campaignId}?resend_error=empty`);
  }

  // ----- Re-apply consent/blocked suppression at creation time -----
  const suppressedSet = new Set<string>();
  for (let i = 0; i < customerIds.length; i += 500) {
    const chunk = customerIds.slice(i, i + 500);
    const [{ data: blocked }, { data: revoked }] = await Promise.all([
      admin.from("customers").select("id").in("id", chunk).eq("is_blocked", true),
      admin
        .from("current_customer_consents")
        .select("customer_id")
        .in("customer_id", chunk)
        .eq("channel", "whatsapp_marketing")
        .eq("status", "revoked"),
    ]);
    for (const b of blocked ?? []) suppressedSet.add(b.id);
    for (const r of revoked ?? []) suppressedSet.add(r.customer_id);
  }

  // ----- Create the pre-approved resend campaign -----
  const now = new Date();
  const { data: resend, error } = await admin
    .from("campaigns")
    .insert({
      name: `${orig.name} — resend ${now.toISOString().slice(0, 10)}`,
      campaign_type: orig.campaign_type,
      template_name: orig.template_name,
      message_body: orig.message_body,
      segment_id: orig.segment_id,
      status: "approved",
      approved_by: profile.id,
      approved_at: now.toISOString(),
      created_by: profile.id,
    })
    .select("id")
    .single();
  if (error || !resend) {
    redirect(`/dashboard/broadcasting/${campaignId}?resend_error=create`);
  }

  const { data: prods } = await admin
    .from("campaign_products")
    .select("product_id, sort_order")
    .eq("campaign_id", campaignId);
  if (prods?.length) {
    await admin.from("campaign_products").insert(
      prods.map((p) => ({
        campaign_id: resend.id,
        product_id: p.product_id,
        sort_order: p.sort_order,
      })),
    );
  }

  const rows = customerIds.map((cid) => ({
    campaign_id: resend.id,
    customer_id: cid,
    suppressed: suppressedSet.has(cid),
    suppressed_reason: suppressedSet.has(cid) ? "opted_out_or_blocked" : "",
  }));
  for (let i = 0; i < rows.length; i += 1000) {
    await admin.from("campaign_recipients").upsert(rows.slice(i, i + 1000), {
      onConflict: "campaign_id,customer_id",
      ignoreDuplicates: true,
    });
  }

  await admin.from("audit_logs").insert({
    actor_id: profile.id,
    action: "campaigns.create_resend",
    entity_type: "campaign",
    entity_id: resend.id,
    after: {
      source_campaign_id: campaignId,
      recipients: customerIds.length,
      include_pending: includePending,
    },
  });

  revalidatePath("/dashboard/broadcasting");
  redirect(`/dashboard/broadcasting/${resend.id}?resent_from=${campaignId}`);
}
