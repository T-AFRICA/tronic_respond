"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth/session";
import {
  createSupabaseServerClient,
  createSupabaseAdminClient,
} from "@/lib/supabase/server";
import { getCampaignSendQueue, isQueueConfigured } from "@/lib/queue";
import { isLiveBroadcastingEnabled } from "@/lib/config";

const E164 = /^\+[1-9]\d{6,14}$/;

function back(campaignId: string, flag: string): never {
  redirect(`/dashboard/broadcasting/${campaignId}?${flag}`);
}

/**
 * Start a campaign execution job (dry_run / test / live).
 * Server-side validation fails fast; the worker re-validates everything
 * (defense in depth, fail closed).
 */
export async function startCampaignExecution(
  campaignId: string,
  formData: FormData,
) {
  const kind = String(formData.get("kind") ?? "");
  if (!["dry_run", "test", "live"].includes(kind)) back(campaignId, "exec_error=kind");

  const profile = await requirePermission(
    kind === "live" ? "campaigns.approve" : "campaigns.write",
  );

  if (!isQueueConfigured()) back(campaignId, "exec_error=redis");

  const supabase = await createSupabaseServerClient();
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id, status, template_name, scheduled_at")
    .eq("id", campaignId)
    .single();
  if (!campaign) back(campaignId, "exec_error=notfound");

  const admin = createSupabaseAdminClient();

  if (kind !== "dry_run") {
    if (!campaign.template_name) back(campaignId, "exec_error=template_missing");
    const { data: templates } = await admin
      .from("message_templates")
      .select("status")
      .eq("name", campaign.template_name)
      .limit(1);
    if (!templates?.length || templates[0].status !== "approved") {
      back(campaignId, "exec_error=template_unapproved");
    }
  }

  let testNumbers: string[] = [];
  if (kind === "test") {
    const { data: setting } = await admin
      .from("system_settings")
      .select("value")
      .eq("key", "test_whatsapp_allowlist")
      .single();
    const allowlist = Array.isArray(setting?.value)
      ? (setting.value as unknown[]).map(String)
      : [];
    if (allowlist.length === 0) back(campaignId, "exec_error=allowlist_empty");

    const raw = String(formData.get("test_numbers") ?? "").trim();
    testNumbers = raw
      ? raw.split(/[\s,;]+/).map((n) => n.trim()).filter(Boolean)
      : allowlist;
    const offList = testNumbers.filter((n) => !allowlist.includes(n));
    if (offList.length > 0) back(campaignId, "exec_error=not_allowlisted");
  }

  if (kind === "live") {
    if (!isLiveBroadcastingEnabled()) back(campaignId, "exec_error=env_flag");
    const { data: approved } = await admin
      .from("system_settings")
      .select("value")
      .eq("key", "live_broadcasting_approved")
      .single();
    if (approved?.value !== true) back(campaignId, "exec_error=not_approved_setting");
    if (!["approved", "scheduled"].includes(campaign.status)) {
      back(campaignId, "exec_error=state");
    }
    if (campaign.scheduled_at && new Date(campaign.scheduled_at) > new Date()) {
      back(campaignId, "exec_error=too_early");
    }
  }

  const batchSize = Math.min(
    200,
    Math.max(1, Number(formData.get("batch_size") ?? 20) || 20),
  );

  const { data: job, error } = await supabase
    .from("campaign_jobs")
    .insert({
      campaign_id: campaignId,
      kind,
      batch_size: batchSize,
      params:
        kind === "test"
          ? { test_numbers: testNumbers }
          : // Default: customers who already received this template are
            // skipped. The operator must tick "allow resend" to override.
            { allow_resend: formData.get("allow_resend") === "on" },
      requested_by: profile.id,
    })
    .select("id")
    .single();
  if (error || !job) {
    // unique index: one unfinished job / one live job per campaign
    back(campaignId, "exec_error=job_exists");
  }

  try {
    await getCampaignSendQueue().add("send", { campaignJobId: job.id });
  } catch {
    await admin
      .from("campaign_jobs")
      .update({ status: "failed", error: "Could not reach Redis queue" })
      .eq("id", job.id);
    back(campaignId, "exec_error=redis");
  }

  if (kind === "live") {
    await supabase
      .from("campaigns")
      .update({ status: "running", started_at: new Date().toISOString() })
      .eq("id", campaignId)
      .in("status", ["approved", "scheduled"]);
  }

  await admin.from("audit_logs").insert({
    actor_id: profile.id,
    action: `campaigns.execute_${kind}`,
    entity_type: "campaign",
    entity_id: campaignId,
    after: {
      job_id: job.id,
      batch_size: batchSize,
      test_numbers: testNumbers,
      allow_resend: formData.get("allow_resend") === "on",
    },
  });

  revalidatePath(`/dashboard/broadcasting/${campaignId}`);
  redirect(`/dashboard/broadcasting/${campaignId}?exec_started=${kind}`);
}

export async function pauseCampaignExecution(campaignId: string, jobId: string) {
  await requirePermission("campaigns.write");
  const supabase = await createSupabaseServerClient();
  await supabase
    .from("campaign_jobs")
    .update({ status: "paused" })
    .eq("id", jobId)
    .in("status", ["queued", "running"]);
  revalidatePath(`/dashboard/broadcasting/${campaignId}`);
}

export async function resumeCampaignExecution(campaignId: string, jobId: string) {
  await requirePermission("campaigns.write");
  const supabase = await createSupabaseServerClient();
  const { data: updated } = await supabase
    .from("campaign_jobs")
    .update({ status: "queued" })
    .eq("id", jobId)
    .eq("status", "paused")
    .select("id");
  if (updated?.length) {
    if (!isQueueConfigured()) back(campaignId, "exec_error=redis");
    await getCampaignSendQueue().add("send", { campaignJobId: jobId });
  }
  revalidatePath(`/dashboard/broadcasting/${campaignId}`);
}

export async function cancelCampaignExecution(campaignId: string, jobId: string) {
  await requirePermission("campaigns.write");
  const supabase = await createSupabaseServerClient();
  await supabase
    .from("campaign_jobs")
    .update({ status: "cancelled", finished_at: new Date().toISOString() })
    .eq("id", jobId)
    .in("status", ["queued", "running", "paused"]);
  revalidatePath(`/dashboard/broadcasting/${campaignId}`);
}

/** Super Admin: manage the internal test allowlist (E.164 numbers). */
export async function updateTestAllowlist(campaignId: string, formData: FormData) {
  const profile = await requirePermission("settings.manage");
  const raw = String(formData.get("numbers") ?? "");
  const numbers = Array.from(
    new Set(raw.split(/[\s,;]+/).map((n) => n.trim()).filter(Boolean)),
  );
  const invalid = numbers.filter((n) => !E164.test(n));
  if (invalid.length > 0) back(campaignId, "exec_error=invalid_numbers");

  const supabase = await createSupabaseServerClient();
  await supabase
    .from("system_settings")
    .update({ value: numbers, updated_by: profile.id, updated_at: new Date().toISOString() })
    .eq("key", "test_whatsapp_allowlist");
  revalidatePath(`/dashboard/broadcasting/${campaignId}`);
}

/** Record the template's verified approval status (checked manually in Meta/Respond.io). */
export async function setTemplateStatus(
  campaignId: string,
  templateName: string,
  formData: FormData,
) {
  const profile = await requirePermission("integrations.manage");
  const status = String(formData.get("status") ?? "");
  if (!["unknown", "pending", "approved", "rejected"].includes(status)) {
    back(campaignId, "exec_error=template_status");
  }
  // Template format decides the send payload: catalog templates must NOT
  // receive the image-header component (they cannot have a media header).
  const format = String(formData.get("format") ?? "standard");
  const category = format === "catalog" ? "catalog" : "marketing";
  const supabase = await createSupabaseServerClient();
  await supabase
    .from("message_templates")
    .upsert(
      {
        name: templateName,
        language_code: "en",
        status,
        category,
        last_checked_at: new Date().toISOString(),
        updated_by: profile.id,
      },
      { onConflict: "name,language_code" },
    );
  revalidatePath(`/dashboard/broadcasting/${campaignId}`);
}

/** Super Admin: secondary in-app live-broadcast switch (env flag also required). */
export async function setLiveBroadcastApproved(
  campaignId: string,
  formData: FormData,
) {
  const profile = await requirePermission("settings.manage");
  const on = String(formData.get("approved")) === "true";
  const supabase = await createSupabaseServerClient();
  await supabase
    .from("system_settings")
    .update({ value: on, updated_by: profile.id, updated_at: new Date().toISOString() })
    .eq("key", "live_broadcasting_approved");

  const admin = createSupabaseAdminClient();
  await admin.from("audit_logs").insert({
    actor_id: profile.id,
    action: on ? "broadcast.live_approved" : "broadcast.live_revoked",
    entity_type: "system_setting",
    entity_id: "live_broadcasting_approved",
  });
  revalidatePath(`/dashboard/broadcasting/${campaignId}`);
}
