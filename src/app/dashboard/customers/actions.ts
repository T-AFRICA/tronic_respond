"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth/session";
import {
  createSupabaseServerClient,
  createSupabaseAdminClient,
} from "@/lib/supabase/server";
import { listContacts } from "@/integrations/respondio/client";
import { respondIoConfig } from "@/lib/config";

/**
 * Pulls contacts from Respond.io and upserts them into public.customers.
 * - Match order: respondio_contact_id → whatsapp_phone (backfills the id).
 * - Never deletes; existing names are only filled when empty locally
 *   (staff edits win over sync).
 * - Caps at 20 pages × 100 contacts per run; re-run to continue.
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

  let cursor: string | undefined;
  let created = 0;
  let updated = 0;
  let skipped = 0;

  try {
    for (let page = 0; page < 20; page++) {
      const res = await listContacts(cursor);
      const contacts = res.items ?? [];
      if (contacts.length === 0) break;

      for (const contact of contacts) {
        const contactId = String(contact.id);
        const phone = contact.phone?.trim() || null;
        const name = [contact.firstName, contact.lastName]
          .filter(Boolean)
          .join(" ")
          .trim();

        if (!phone && !contactId) {
          skipped++;
          continue;
        }

        const { data: byId } = await admin
          .from("customers")
          .select("id, full_name, email")
          .eq("respondio_contact_id", contactId)
          .maybeSingle();

        if (byId) {
          await admin
            .from("customers")
            .update({
              full_name: byId.full_name || name,
              email: byId.email || contact.email || null,
              tags: contact.tags ?? undefined,
            })
            .eq("id", byId.id);
          updated++;
          continue;
        }

        if (phone) {
          const { data: byPhone } = await admin
            .from("customers")
            .select("id, full_name, email")
            .eq("whatsapp_phone", phone)
            .maybeSingle();
          if (byPhone) {
            await admin
              .from("customers")
              .update({
                respondio_contact_id: contactId,
                full_name: byPhone.full_name || name,
                email: byPhone.email || contact.email || null,
                tags: contact.tags ?? undefined,
              })
              .eq("id", byPhone.id);
            updated++;
            continue;
          }
        }

        if (!phone) {
          skipped++; // cannot create a customer without a WhatsApp number
          continue;
        }

        const { error } = await admin.from("customers").insert({
          respondio_contact_id: contactId,
          whatsapp_phone: phone,
          full_name: name,
          email: contact.email ?? null,
          tags: contact.tags ?? [],
          country_id: country!.id,
        });
        if (error) skipped++;
        else created++;
      }

      cursor = res.pagination?.next;
      if (!cursor) break;
    }
  } catch {
    redirect(
      `/dashboard/customers?error=syncfailed&created=${created}&updated=${updated}`,
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
