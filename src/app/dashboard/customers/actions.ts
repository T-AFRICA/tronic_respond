"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth/session";
import {
  createSupabaseServerClient,
  createSupabaseAdminClient,
} from "@/lib/supabase/server";
import { listContacts, RespondIoError } from "@/integrations/respondio/client";
import { respondIoConfig } from "@/lib/config";

const PAGES_PER_RUN = 40; // 40 × 100 contacts per run (serverless time budget)
const CHUNK = 500;

function chunk<T>(arr: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
    arr.slice(i * size, i * size + size),
  );
}

/**
 * Pulls contacts from Respond.io and upserts them into public.customers.
 * BULK implementation (a per-contact version timed out on serverless):
 *  1. fetch up to PAGES_PER_RUN × 100 contacts,
 *  2. dedupe by phone, load existing rows in chunks,
 *  3. merged upserts — staff edits win, never deletes.
 * Safe to repeat; reruns update the same contacts quickly.
 */
export async function syncCustomersFromRespondio() {
  await requirePermission("customers.write");

  if (!respondIoConfig.token()) {
    redirect("/dashboard/customers?error=norespondio");
  }

  const admin = createSupabaseAdminClient();
  const { data: country } = await admin
    .from("countries")
    .select("id")
    .eq("is_active", true)
    .limit(1)
    .single();

  let created = 0;
  let updated = 0;
  let skipped = 0;

  try {
    // ---- 1. Fetch contacts ----
    type Incoming = {
      contactId: string;
      phone: string;
      name: string;
      email: string | null;
      tags: string[];
      createdAt: string | null;
    };
    const incoming: Incoming[] = [];
    const seenPhones = new Set<string>();
    let cursor: string | undefined;

    for (let page = 0; page < PAGES_PER_RUN; page++) {
      const res = await listContacts(cursor);
      const contacts = res.items ?? [];
      if (contacts.length === 0) break;

      for (const contact of contacts) {
        const phone = contact.phone?.trim() ?? "";
        if (!phone) {
          skipped++; // cannot create a customer without a WhatsApp number
          continue;
        }
        if (seenPhones.has(phone)) continue;
        seenPhones.add(phone);
        incoming.push({
          contactId: String(contact.id),
          phone,
          name: [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim(),
          email: contact.email ?? null,
          createdAt: contact.created_at
            ? new Date(contact.created_at * 1000).toISOString()
            : null,
          tags: Array.isArray(contact.tags)
            ? contact.tags
                .map((t) => (typeof t === "string" ? t : (t as { name?: string })?.name))
                .filter((t): t is string => Boolean(t))
            : [],
        });
      }

      cursor = res.pagination?.next;
      if (!cursor) break;
    }

    // ---- 2. Load existing rows for merge ----
    type Existing = {
      id: string;
      respondio_contact_id: string | null;
      whatsapp_phone: string;
      full_name: string;
      company_name: string;
      email: string | null;
      tags: string[];
      country_id: number;
      is_blocked: boolean;
      last_contact_at: string | null;
    };
    const SELECT =
      "id, respondio_contact_id, whatsapp_phone, full_name, company_name, email, tags, country_id, is_blocked, last_contact_at";
    const byContact = new Map<string, Existing>();
    const byPhone = new Map<string, Existing>();

    for (const ids of chunk(incoming.map((r) => r.contactId), CHUNK)) {
      const { data } = await admin
        .from("customers")
        .select(SELECT)
        .in("respondio_contact_id", ids);
      for (const c of (data ?? []) as Existing[]) {
        if (c.respondio_contact_id) byContact.set(c.respondio_contact_id, c);
      }
    }
    for (const phones of chunk(incoming.map((r) => r.phone), CHUNK)) {
      const { data } = await admin
        .from("customers")
        .select(SELECT)
        .in("whatsapp_phone", phones);
      for (const c of (data ?? []) as Existing[]) byPhone.set(c.whatsapp_phone, c);
    }

    // ---- 3. Merge (staff edits win) ----
    const updates: Record<string, unknown>[] = [];
    const inserts: Record<string, unknown>[] = [];
    for (const r of incoming) {
      const existing = byContact.get(r.contactId) ?? byPhone.get(r.phone);
      if (existing) {
        updates.push({
          id: existing.id,
          respondio_contact_id: existing.respondio_contact_id ?? r.contactId,
          whatsapp_phone: existing.whatsapp_phone,
          full_name: existing.full_name || r.name,
          company_name: existing.company_name,
          email: existing.email || r.email,
          tags: r.tags.length > 0 ? r.tags : existing.tags,
          country_id: existing.country_id,
          is_blocked: existing.is_blocked,
          last_contact_at: existing.last_contact_at ?? r.createdAt,
        });
      } else {
        inserts.push({
          respondio_contact_id: r.contactId,
          whatsapp_phone: r.phone,
          full_name: r.name,
          email: r.email,
          tags: r.tags,
          country_id: country!.id,
          last_contact_at: r.createdAt,
        });
      }
    }

    // ---- 4. Bulk write ----
    for (const batch of chunk(updates, CHUNK)) {
      const { error } = await admin
        .from("customers")
        .upsert(batch, { onConflict: "id" });
      if (error) throw new Error(`update batch failed: ${error.message}`);
      updated += batch.length;
    }
    for (const batch of chunk(inserts, CHUNK)) {
      const { data, error } = await admin
        .from("customers")
        .upsert(batch, { onConflict: "whatsapp_phone", ignoreDuplicates: true })
        .select("id");
      if (error) throw new Error(`insert batch failed: ${error.message}`);
      created += data?.length ?? 0;
    }
  } catch (e) {
    // Surface the provider's actual failure (status + short message, no secrets)
    let detail = "unknown error";
    if (e instanceof RespondIoError) {
      const body =
        typeof e.body === "string" ? e.body : JSON.stringify(e.body ?? "");
      detail = `HTTP ${e.status}: ${body.slice(0, 180)}`;
    } else if (e instanceof Error) {
      detail = e.message.slice(0, 180);
    }
    console.error("customer sync failed:", detail);
    redirect(
      `/dashboard/customers?error=syncfailed&created=${created}&updated=${updated}&detail=${encodeURIComponent(detail)}`,
    );
  }

  revalidatePath("/dashboard/customers");
  redirect(
    `/dashboard/customers?synced=1&created=${created}&updated=${updated}&skipped=${skipped}`,
  );
}

/** Update editable customer fields (staff edits win over future syncs). */
export async function updateCustomer(customerId: string, formData: FormData) {
  await requirePermission("customers.write");
  const supabase = await createSupabaseServerClient();

  const assigned = String(formData.get("assigned_staff_id") ?? "");
  const { error } = await supabase
    .from("customers")
    .update({
      full_name: String(formData.get("full_name") ?? "").trim(),
      company_name: String(formData.get("company_name") ?? "").trim(),
      email: String(formData.get("email") ?? "").trim() || null,
      respondio_contact_id:
        String(formData.get("respondio_contact_id") ?? "").trim() || null,
      assigned_staff_id: assigned || null,
      notes: String(formData.get("notes") ?? ""),
      is_blocked: formData.get("is_blocked") === "on",
    })
    .eq("id", customerId);

  revalidatePath(`/dashboard/customers/${customerId}`);
  revalidatePath("/dashboard/customers");
  redirect(
    `/dashboard/customers/${customerId}?${error ? "error=save" : "saved=1"}`,
  );
}

/** Record a consent change (append-only; latest row wins). */
export async function setConsent(customerId: string, formData: FormData) {
  const profile = await requirePermission("customers.write");
  const status = String(formData.get("status") ?? "");
  if (!["granted", "revoked"].includes(status)) return;

  const supabase = await createSupabaseServerClient();
  await supabase.from("customer_consents").insert({
    customer_id: customerId,
    channel: "whatsapp_marketing",
    status,
    source: "staff",
    recorded_by: profile.id,
  });

  revalidatePath(`/dashboard/customers/${customerId}`);
}
