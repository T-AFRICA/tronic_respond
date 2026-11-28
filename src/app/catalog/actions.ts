"use server";

import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { verifyCatalogToken } from "@/lib/catalog/links";

/**
 * PUBLIC action: submit a quotation request from the external catalog.
 * No authentication — hardened instead with:
 *  - zod validation + strict size caps
 *  - honeypot field (bots fill it, humans never see it)
 *  - E.164-ish phone validation
 *  - optional signed personalized token to attach a known customer
 *  - random idempotency key (each submit is intentionally a new RFQ)
 */

const submitSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(7).max(20),
  company: z.string().trim().max(160).default(""),
  address: z.string().trim().max(300).default(""),
  notes: z.string().trim().max(1000).default(""),
  token: z.string().max(500).optional(),
  website: z.string().max(0).optional(), // honeypot — must stay empty
  items: z
    .array(
      z.object({
        sku: z.string().trim().min(1).max(64),
        qty: z.coerce.number().positive().max(100000),
      }),
    )
    .min(1)
    .max(50),
});

function normalizePhone(raw: string): string | null {
  const cleaned = raw.replace(/[\s()-]/g, "");
  if (/^\+[1-9]\d{6,14}$/.test(cleaned)) return cleaned;
  // Local Tanzanian format 0XXXXXXXXX → +255XXXXXXXXX
  if (/^0\d{8,9}$/.test(cleaned)) return `+255${cleaned.slice(1)}`;
  return null;
}

export async function submitCatalogRfq(payload: unknown): Promise<
  | { ok: true; reference: string }
  | { ok: false; error: "validation" | "phone" | "failed" }
> {
  const parsed = submitSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: "validation" };
  const data = parsed.data;

  // Honeypot filled → silently pretend success (don't tip off the bot).
  if (data.website && data.website.length > 0) {
    return { ok: true, reference: "RFQ-RECEIVED" };
  }

  const phone = normalizePhone(data.phone);
  if (!phone) return { ok: false, error: "phone" };

  const admin = createSupabaseAdminClient();

  // ----- Resolve customer: signed token → phone → create -----
  let customerId: string | null = null;
  if (data.token) {
    const tokenCustomerId = verifyCatalogToken(data.token);
    if (tokenCustomerId) {
      const { data: c } = await admin
        .from("customers")
        .select("id")
        .eq("id", tokenCustomerId)
        .maybeSingle();
      customerId = c?.id ?? null;
    }
  }
  if (!customerId) {
    const { data: byPhone } = await admin
      .from("customers")
      .select("id, full_name, company_name")
      .eq("whatsapp_phone", phone)
      .maybeSingle();
    if (byPhone) {
      customerId = byPhone.id;
      await admin
        .from("customers")
        .update({
          full_name: byPhone.full_name || data.name,
          company_name: byPhone.company_name || data.company,
          last_contact_at: new Date().toISOString(),
        })
        .eq("id", byPhone.id);
    }
  }
  if (!customerId) {
    const { data: country } = await admin
      .from("countries")
      .select("id")
      .eq("is_active", true)
      .limit(1)
      .single();
    const { data: created, error } = await admin
      .from("customers")
      .insert({
        whatsapp_phone: phone,
        full_name: data.name,
        company_name: data.company,
        country_id: country!.id,
        last_contact_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error || !created) return { ok: false, error: "failed" };
    customerId = created.id;
  }

  // ----- Map SKUs to products -----
  const skus = [...new Set(data.items.map((i) => i.sku))];
  const { data: products } = await admin
    .from("products")
    .select("id, sku, name")
    .in("sku", skus)
    .eq("visibility", "published");
  const productMap = new Map((products ?? []).map((p) => [p.sku, p]));

  // ----- Create RFQ -----
  // The customers table has no address column, so the delivery address is
  // kept on the RFQ itself where sales reads it.
  const customerNotes = [
    data.address ? `Address: ${data.address}` : "",
    data.notes,
  ]
    .filter(Boolean)
    .join("\n");
  const { data: rfq, error: rfqError } = await admin
    .from("rfqs")
    .insert({
      customer_id: customerId,
      source: "external_catalog",
      status: "new",
      customer_notes: customerNotes,
      idempotency_key: `catalog:${crypto.randomUUID()}`,
    })
    .select("id, reference")
    .single();
  if (rfqError || !rfq) return { ok: false, error: "failed" };

  await admin.from("rfq_items").insert(
    data.items.map((item) => {
      const product = productMap.get(item.sku);
      return {
        rfq_id: rfq.id,
        product_id: product?.id ?? null,
        sku: item.sku,
        product_name: product?.name ?? item.sku,
        quantity: item.qty,
        mapping_status: product ? "mapped" : "unmapped",
      };
    }),
  );

  // ----- Notify managers -----
  const { data: managers } = await admin
    .from("profiles")
    .select("id, roles!inner(key)")
    .in("roles.key", ["sales_manager", "super_admin"])
    .eq("is_active", true);
  if (managers?.length) {
    await admin.from("notifications").insert(
      managers.map((m) => ({
        user_id: m.id,
        kind: "rfq_created",
        title: `New quotation request ${rfq.reference}`,
        body: `${data.items.length} item(s) from ${data.name} via the online catalog`,
        link: `/dashboard/rfqs/${rfq.id}`,
      })),
    );
  }

  return { ok: true, reference: rfq.reference };
}
