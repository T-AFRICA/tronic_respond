"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import {
  createSupabaseServerClient,
  createSupabaseAdminClient,
} from "@/lib/supabase/server";

/** Product search for the campaign composer (campaigns.write). */
export async function searchCampaignProducts(term: string) {
  await requirePermission("campaigns.write");
  const supabase = await createSupabaseServerClient();
  const clean = term.trim().toLowerCase();
  if (!clean) return { ok: false as const, error: "Enter a search term." };

  const { data } = await supabase
    .from("products")
    .select("id, sku, name, brand")
    .eq("visibility", "published")
    .ilike("search_text", `%${clean}%`)
    .limit(10);

  if (!data || data.length === 0) {
    return { ok: false as const, error: "No published products match." };
  }
  return { ok: true as const, products: data };
}

const campaignSchema = z.object({
  name: z.string().trim().min(3).max(200),
  campaign_type: z.enum([
    "single_product",
    "multi_product",
    "full_catalog",
    "promotional",
    "new_arrivals",
  ]),
  template_name: z.string().trim().max(200).default(""),
  message_body: z.string().trim().max(2000).default(""),
  segment_id: z.string().uuid().nullable(),
  scheduled_at: z.string().nullable(),
  product_ids: z.array(z.string().uuid()).max(30),
});

export async function createCampaign(payload: unknown) {
  const profile = await requirePermission("campaigns.write");
  const parsed = campaignSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues.map((i) => i.message).join("; "),
    };
  }
  const data = parsed.data;

  if (data.campaign_type === "single_product" && data.product_ids.length !== 1) {
    return { ok: false as const, error: "Single-product campaigns need exactly one product." };
  }
  if (data.campaign_type === "multi_product" && data.product_ids.length < 2) {
    return { ok: false as const, error: "Multi-product campaigns need at least two products (max 30)." };
  }
  if (!data.template_name && !data.message_body) {
    return { ok: false as const, error: "Provide an approved template name or a message body." };
  }

  const supabase = await createSupabaseServerClient();
  const { data: campaign, error } = await supabase
    .from("campaigns")
    .insert({
      name: data.name,
      campaign_type: data.campaign_type,
      template_name: data.template_name,
      message_body: data.message_body,
      segment_id: data.segment_id,
      scheduled_at: data.scheduled_at,
      created_by: profile.id,
    })
    .select("id")
    .single();

  if (error || !campaign) {
    return { ok: false as const, error: error?.message ?? "Create failed." };
  }

  if (data.product_ids.length > 0) {
    const { error: prodError } = await supabase.from("campaign_products").insert(
      data.product_ids.map((pid, idx) => ({
        campaign_id: campaign.id,
        product_id: pid,
        sort_order: idx,
      })),
    );
    if (prodError) {
      return { ok: false as const, error: prodError.message };
    }
  }

  revalidatePath("/dashboard/broadcasting");
  return { ok: true as const, id: campaign.id };
}

export async function submitCampaignForApproval(campaignId: string) {
  const profile = await requirePermission("campaigns.write");
  const supabase = await createSupabaseServerClient();

  const { data: campaign } = await supabase
    .from("campaigns")
    .select("status, name")
    .eq("id", campaignId)
    .single();
  if (!campaign || campaign.status !== "draft") {
    redirect(`/dashboard/broadcasting/${campaignId}?error=state`);
  }

  await supabase
    .from("campaigns")
    .update({ status: "pending_approval" })
    .eq("id", campaignId);

  const admin = createSupabaseAdminClient();
  const { data: approvers } = await admin
    .from("profiles")
    .select("id, roles!inner(key)")
    .in("roles.key", ["sales_manager", "super_admin"])
    .eq("is_active", true);

  if (approvers?.length) {
    await admin.from("notifications").insert(
      approvers.map((a) => ({
        user_id: a.id,
        kind: "campaign_approval_requested",
        title: `Campaign approval: ${campaign.name}`,
        body: `Requested by ${profile.full_name}`,
        link: `/dashboard/broadcasting/${campaignId}`,
      })),
    );
  }

  revalidatePath(`/dashboard/broadcasting/${campaignId}`);
  redirect(`/dashboard/broadcasting/${campaignId}?requested=1`);
}

/**
 * Manager decision. Approval materializes the recipient list with consent
 * suppression: blocked customers and customers whose latest
 * whatsapp_marketing consent is 'revoked' are stored as suppressed and are
 * never part of the export.
 */
export async function decideCampaign(campaignId: string, formData: FormData) {
  const profile = await requirePermission("campaigns.approve");
  const decision = String(formData.get("decision") ?? "");
  const reason = String(formData.get("reason") ?? "");
  if (!["approved", "rejected"].includes(decision)) return;

  const supabase = await createSupabaseServerClient();
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("status, segment_id, scheduled_at")
    .eq("id", campaignId)
    .single();
  if (!campaign || campaign.status !== "pending_approval") {
    redirect(`/dashboard/broadcasting/${campaignId}?error=state`);
  }

  if (decision === "rejected") {
    await supabase
      .from("campaigns")
      .update({ status: "rejected", rejected_reason: reason })
      .eq("id", campaignId);
    revalidatePath(`/dashboard/broadcasting/${campaignId}`);
    return;
  }

  const admin = createSupabaseAdminClient();

  // ----- Resolve audience -----
  let customerIds: string[] = [];
  if (campaign.segment_id) {
    const { data: members } = await admin
      .from("customer_segment_members")
      .select("customer_id")
      .eq("segment_id", campaign.segment_id);
    customerIds = (members ?? []).map((m) => m.customer_id);
  } else {
    const { data: all } = await admin.from("customers").select("id").limit(50000);
    customerIds = (all ?? []).map((c) => c.id);
  }

  // ----- Suppression: blocked + revoked consent -----
  const { data: blocked } = await admin
    .from("customers")
    .select("id")
    .eq("is_blocked", true)
    .in("id", customerIds.slice(0, 50000));
  const { data: revoked } = await admin
    .from("current_customer_consents")
    .select("customer_id")
    .eq("channel", "whatsapp_marketing")
    .eq("status", "revoked")
    .in("customer_id", customerIds.slice(0, 50000));

  const suppressedSet = new Set([
    ...(blocked ?? []).map((b) => b.id),
    ...(revoked ?? []).map((r) => r.customer_id),
  ]);

  // ----- Materialize recipients (unique per campaign+customer) -----
  const rows = customerIds.map((cid) => ({
    campaign_id: campaignId,
    customer_id: cid,
    suppressed: suppressedSet.has(cid),
    suppressed_reason: suppressedSet.has(cid) ? "opted_out_or_blocked" : "",
  }));
  for (let i = 0; i < rows.length; i += 1000) {
    await admin
      .from("campaign_recipients")
      .upsert(rows.slice(i, i + 1000), {
        onConflict: "campaign_id,customer_id",
        ignoreDuplicates: true,
      });
  }

  await supabase
    .from("campaigns")
    .update({
      status: campaign.scheduled_at ? "scheduled" : "approved",
      approved_by: profile.id,
      approved_at: new Date().toISOString(),
    })
    .eq("id", campaignId);

  revalidatePath(`/dashboard/broadcasting/${campaignId}`);
}

/** Execution bookkeeping — the broadcast itself runs in Respond.io's native module. */
export async function setCampaignStatus(
  campaignId: string,
  to: "running" | "completed" | "cancelled",
) {
  await requirePermission("campaigns.write");
  const supabase = await createSupabaseServerClient();
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("status")
    .eq("id", campaignId)
    .single();

  const allowed: Record<string, string[]> = {
    running: ["approved", "scheduled"],
    completed: ["running"],
    cancelled: ["draft", "pending_approval", "approved", "scheduled", "running"],
  };
  if (!campaign || !allowed[to].includes(campaign.status)) {
    redirect(`/dashboard/broadcasting/${campaignId}?error=state`);
  }

  await supabase
    .from("campaigns")
    .update({
      status: to,
      ...(to === "running" ? { started_at: new Date().toISOString() } : {}),
      ...(to === "completed" ? { finished_at: new Date().toISOString() } : {}),
    })
    .eq("id", campaignId);

  revalidatePath(`/dashboard/broadcasting/${campaignId}`);
  revalidatePath("/dashboard/broadcasting");
}
