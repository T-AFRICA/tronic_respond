"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Customer segments — named audience lists used by Broadcasting campaigns.
 * All mutations require customers.write (RLS enforces the same server-side).
 */

const PAGE = 1000; // PostgREST caps responses at 1000 rows

const segmentSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).default(""),
});

export async function createSegment(formData: FormData) {
  const profile = await requirePermission("customers.write");
  const parsed = segmentSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") ?? "",
  });
  if (!parsed.success) {
    redirect("/dashboard/segments?error=invalid");
  }

  const supabase = await createSupabaseServerClient();
  const { data: segment, error } = await supabase
    .from("customer_segments")
    .insert({
      name: parsed.data.name,
      description: parsed.data.description,
      created_by: profile.id,
    })
    .select("id")
    .single();

  if (error || !segment) {
    redirect(
      `/dashboard/segments?error=${encodeURIComponent(
        error?.code === "23505" ? "duplicate" : error?.message ?? "failed",
      )}`,
    );
  }
  revalidatePath("/dashboard/segments");
  redirect(`/dashboard/segments/${segment.id}`);
}

export async function deleteSegment(formData: FormData) {
  await requirePermission("customers.write");
  const segmentId = String(formData.get("segment_id") ?? "");
  if (!segmentId) redirect("/dashboard/segments");

  const supabase = await createSupabaseServerClient();

  // Campaigns keep a FK to the segment — block deletion while referenced.
  const { count } = await supabase
    .from("campaigns")
    .select("id", { count: "exact", head: true })
    .eq("segment_id", segmentId);
  if ((count ?? 0) > 0) {
    redirect(`/dashboard/segments/${segmentId}?error=inuse`);
  }

  await supabase.from("customer_segments").delete().eq("id", segmentId);
  revalidatePath("/dashboard/segments");
  redirect("/dashboard/segments");
}

// ---------- Filter-based bulk add ----------

const filterSchema = z.object({
  segmentId: z.string().uuid(),
  /** 0 = every customer regardless of last contact */
  activeDays: z.number().int().min(0).max(3650),
  tag: z.string().trim().max(60).default(""),
  countOnly: z.boolean().default(false),
});

export async function addMembersByFilter(payload: unknown) {
  await requirePermission("customers.write");
  const parsed = filterSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false as const, error: "Invalid filter." };
  }
  const { segmentId, activeDays, tag, countOnly } = parsed.data;
  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from("customers")
    .select("id", { count: "exact", head: countOnly })
    .eq("is_blocked", false);
  if (activeDays > 0) {
    const cutoff = new Date(Date.now() - activeDays * 86400_000).toISOString();
    query = query.gte("last_contact_at", cutoff);
  }
  if (tag) {
    query = query.contains("tags", [tag]);
  }

  if (countOnly) {
    const { count, error } = await query;
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, matched: count ?? 0, added: 0 };
  }

  // Collect all matching ids (paginated), then insert memberships in chunks.
  const ids: string[] = [];
  for (let from = 0; ; from += PAGE) {
    let pageQuery = supabase
      .from("customers")
      .select("id")
      .eq("is_blocked", false)
      .order("id")
      .range(from, from + PAGE - 1);
    if (activeDays > 0) {
      const cutoff = new Date(Date.now() - activeDays * 86400_000).toISOString();
      pageQuery = pageQuery.gte("last_contact_at", cutoff);
    }
    if (tag) pageQuery = pageQuery.contains("tags", [tag]);

    const { data, error } = await pageQuery;
    if (error) return { ok: false as const, error: error.message };
    ids.push(...(data ?? []).map((r) => r.id));
    if (!data || data.length < PAGE) break;
  }

  const added = await insertMembers(segmentId, ids);
  if (added.error) return { ok: false as const, error: added.error };

  revalidatePath(`/dashboard/segments/${segmentId}`);
  return { ok: true as const, matched: ids.length, added: added.inserted };
}

// ---------- Paste phone numbers ----------

const phonesSchema = z.object({
  segmentId: z.string().uuid(),
  text: z.string().max(100_000),
  /** Create customer records for numbers not in the system yet. */
  createMissing: z.boolean().default(true),
});

/** Normalize a pasted number to E.164-ish for matching (TZ default for 0-prefixed). */
function normalizePhone(raw: string): string | null {
  let s = raw.replace(/[\s\-().]/g, "");
  if (!s) return null;
  if (s.startsWith("00")) s = `+${s.slice(2)}`;
  if (/^0\d{9}$/.test(s)) s = `+255${s.slice(1)}`; // local TZ format 0XXXXXXXXX
  if (/^[67]\d{8}$/.test(s)) s = `+255${s}`; // Excel drops the leading 0 from 07XX/06XX
  if (/^\d+$/.test(s)) s = `+${s}`;
  return /^\+[1-9]\d{6,14}$/.test(s) ? s : null;
}

export async function addMembersByPhones(payload: unknown) {
  await requirePermission("customers.write");
  const parsed = phonesSchema.safeParse(payload);
  if (!parsed.success) return { ok: false as const, error: "Invalid input." };
  const { segmentId, text, createMissing } = parsed.data;

  const tokens = text.split(/[\n,;]+/).map((t) => t.trim()).filter(Boolean);
  if (tokens.length === 0) {
    return { ok: false as const, error: "Paste at least one phone number." };
  }
  if (tokens.length > 10_000) {
    return { ok: false as const, error: "Too many numbers at once (max 10,000)." };
  }

  const invalid: string[] = [];
  const phones = new Set<string>();
  for (const t of tokens) {
    const p = normalizePhone(t);
    if (p) phones.add(p);
    else invalid.push(t);
  }

  const supabase = await createSupabaseServerClient();
  const phoneList = [...phones];
  const found = new Map<string, string>(); // phone -> customer id
  for (let i = 0; i < phoneList.length; i += 500) {
    const chunk = phoneList.slice(i, i + 500);
    const { data, error } = await supabase
      .from("customers")
      .select("id, whatsapp_phone")
      .in("whatsapp_phone", chunk);
    if (error) return { ok: false as const, error: error.message };
    for (const c of data ?? []) found.set(c.whatsapp_phone, c.id);
  }

  let notFound = phoneList.filter((p) => !found.has(p));
  let created = 0;

  // Numbers not in the system yet: create them as customers right here so
  // an imported list is immediately broadcastable (no Respond.io sync needed —
  // the broadcast engine creates the Respond.io contact on first send).
  if (createMissing && notFound.length > 0) {
    const { data: country } = await supabase
      .from("countries")
      .select("id")
      .eq("is_active", true)
      .order("id")
      .limit(1)
      .single();
    if (!country) {
      return { ok: false as const, error: "No active country configured." };
    }

    for (let i = 0; i < notFound.length; i += 500) {
      const chunk = notFound.slice(i, i + 500).map((whatsapp_phone) => ({
        whatsapp_phone,
        country_id: country.id,
        tags: ["imported"],
      }));
      const { error } = await supabase
        .from("customers")
        .upsert(chunk, { onConflict: "whatsapp_phone", ignoreDuplicates: true });
      if (error) return { ok: false as const, error: error.message };
    }

    // Re-select to pick up the new ids (and any concurrent winners).
    for (let i = 0; i < notFound.length; i += 500) {
      const chunk = notFound.slice(i, i + 500);
      const { data } = await supabase
        .from("customers")
        .select("id, whatsapp_phone")
        .in("whatsapp_phone", chunk);
      for (const c of data ?? []) {
        if (!found.has(c.whatsapp_phone)) created++;
        found.set(c.whatsapp_phone, c.id);
      }
    }
    notFound = phoneList.filter((p) => !found.has(p));
  }

  const added = await insertMembers(segmentId, [...found.values()]);
  if (added.error) return { ok: false as const, error: added.error };

  revalidatePath(`/dashboard/segments/${segmentId}`);
  return {
    ok: true as const,
    parsed: phoneList.length,
    matched: found.size - created,
    created,
    added: added.inserted,
    notFound: notFound.slice(0, 30),
    notFoundTotal: notFound.length,
    invalid: invalid.slice(0, 30),
    invalidTotal: invalid.length,
  };
}

// ---------- Single add / remove ----------

export async function addMemberById(payload: unknown) {
  await requirePermission("customers.write");
  const parsed = z
    .object({ segmentId: z.string().uuid(), customerId: z.string().uuid() })
    .safeParse(payload);
  if (!parsed.success) return { ok: false as const, error: "Invalid input." };

  const added = await insertMembers(parsed.data.segmentId, [parsed.data.customerId]);
  if (added.error) return { ok: false as const, error: added.error };
  revalidatePath(`/dashboard/segments/${parsed.data.segmentId}`);
  return { ok: true as const, added: added.inserted };
}

export async function removeMember(formData: FormData) {
  await requirePermission("customers.write");
  const segmentId = String(formData.get("segment_id") ?? "");
  const customerId = String(formData.get("customer_id") ?? "");
  if (!segmentId || !customerId) return;

  const supabase = await createSupabaseServerClient();
  await supabase
    .from("customer_segment_members")
    .delete()
    .eq("segment_id", segmentId)
    .eq("customer_id", customerId);
  revalidatePath(`/dashboard/segments/${segmentId}`);
}

// ---------- Shared ----------

async function insertMembers(
  segmentId: string,
  customerIds: string[],
): Promise<{ inserted: number; error?: string }> {
  if (customerIds.length === 0) return { inserted: 0 };
  const supabase = await createSupabaseServerClient();

  const { count: before } = await supabase
    .from("customer_segment_members")
    .select("customer_id", { count: "exact", head: true })
    .eq("segment_id", segmentId);

  for (let i = 0; i < customerIds.length; i += 500) {
    const chunk = customerIds.slice(i, i + 500).map((customer_id) => ({
      segment_id: segmentId,
      customer_id,
    }));
    const { error } = await supabase
      .from("customer_segment_members")
      .upsert(chunk, {
        onConflict: "segment_id,customer_id",
        ignoreDuplicates: true,
      });
    if (error) return { inserted: 0, error: error.message };
  }

  const { count: after } = await supabase
    .from("customer_segment_members")
    .select("customer_id", { count: "exact", head: true })
    .eq("segment_id", segmentId);

  return { inserted: Math.max(0, (after ?? 0) - (before ?? 0)) };
}
