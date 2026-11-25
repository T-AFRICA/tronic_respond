import { createSupabaseAdminClient } from "@/lib/supabase/server";

/**
 * WhatsApp cart → RFQ pipeline (spec §5 steps 8–12).
 *
 * - Idempotent: the webhook dedupe_key doubles as the RFQ idempotency_key,
 *   so a redelivered webhook can never create a second RFQ.
 * - Maps Meta retailer_id (our SKU) and/or Meta product id to internal products.
 *   Unmapped items are kept with mapping_status='unmapped' for staff review.
 * - Finds or creates the customer record from the Respond.io contact.
 * - Notifies all sales managers + unassigned pool (notification rows).
 * - A cart is a QUOTATION REQUEST — never a confirmed purchase.
 */

export type CartItem = {
  retailerId: string | null; // Meta retailer_id == internal SKU
  metaProductId: string | null;
  quantity: number;
  raw: Record<string, unknown>;
};

export type CartPayload = {
  respondioContactId: string | null;
  phone: string | null;
  customerName: string;
  noteText: string;
  items: CartItem[];
};

export async function createRfqFromCart(
  cart: CartPayload,
  idempotencyKey: string,
): Promise<string | null> {
  const admin = createSupabaseAdminClient();

  // Idempotency check
  const { data: existing } = await admin
    .from("rfqs")
    .select("id")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (existing) return existing.id;

  // ----- Find or create customer -----
  let customerId: string | null = null;

  if (cart.respondioContactId) {
    const { data } = await admin
      .from("customers")
      .select("id")
      .eq("respondio_contact_id", cart.respondioContactId)
      .maybeSingle();
    customerId = data?.id ?? null;
  }
  if (!customerId && cart.phone) {
    const { data } = await admin
      .from("customers")
      .select("id")
      .eq("whatsapp_phone", cart.phone)
      .maybeSingle();
    customerId = data?.id ?? null;
    // Backfill the Respond.io contact id mapping
    if (customerId && cart.respondioContactId) {
      await admin
        .from("customers")
        .update({ respondio_contact_id: cart.respondioContactId })
        .eq("id", customerId);
    }
  }
  if (!customerId) {
    if (!cart.phone && !cart.respondioContactId) {
      throw new Error("Cart payload has no contact identifier");
    }
    const { data: country } = await admin
      .from("countries")
      .select("id")
      .eq("is_active", true)
      .limit(1)
      .single();
    const { data: inserted, error } = await admin
      .from("customers")
      .insert({
        respondio_contact_id: cart.respondioContactId,
        whatsapp_phone: cart.phone ?? `unknown:${cart.respondioContactId}`,
        full_name: cart.customerName,
        country_id: country!.id,
        last_contact_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error || !inserted) {
      throw new Error(`Customer creation failed: ${error?.message}`);
    }
    customerId = inserted.id;
  }

  // ----- Map items to internal products -----
  const skus = cart.items
    .map((i) => i.retailerId)
    .filter((s): s is string => !!s);
  const metaIds = cart.items
    .map((i) => i.metaProductId)
    .filter((s): s is string => !!s);

  const { data: bySku } = skus.length
    ? await admin.from("products").select("id, sku, name").in("sku", skus)
    : { data: [] as { id: string; sku: string; name: string }[] };
  const { data: byMetaId } = metaIds.length
    ? await admin
        .from("products")
        .select("id, sku, name, meta_product_id")
        .in("meta_product_id", metaIds)
    : { data: [] as { id: string; sku: string; name: string; meta_product_id: string }[] };

  const skuMap = new Map((bySku ?? []).map((p) => [p.sku, p]));
  const metaMap = new Map((byMetaId ?? []).map((p) => [p.meta_product_id, p]));

  // ----- Create RFQ + items -----
  const { data: rfq, error: rfqError } = await admin
    .from("rfqs")
    .insert({
      customer_id: customerId,
      respondio_contact_id: cart.respondioContactId,
      source: "whatsapp_cart",
      status: "new",
      customer_notes: cart.noteText,
      idempotency_key: idempotencyKey,
    })
    .select("id, reference")
    .single();

  if (rfqError || !rfq) {
    // Unique violation on idempotency_key = concurrent duplicate; fetch winner.
    if (rfqError?.code === "23505") {
      const { data } = await admin
        .from("rfqs")
        .select("id")
        .eq("idempotency_key", idempotencyKey)
        .single();
      return data?.id ?? null;
    }
    throw new Error(`RFQ creation failed: ${rfqError?.message}`);
  }

  const itemRows = cart.items.map((item) => {
    const product =
      (item.retailerId ? skuMap.get(item.retailerId) : undefined) ??
      (item.metaProductId ? metaMap.get(item.metaProductId) : undefined);
    return {
      rfq_id: rfq.id,
      product_id: product?.id ?? null,
      sku: product?.sku ?? item.retailerId ?? "UNMAPPED",
      product_name: product?.name ?? "Unmapped product",
      quantity: item.quantity,
      meta_product_id: item.metaProductId,
      raw_item: item.raw,
      mapping_status: product ? "mapped" : "unmapped",
    };
  });

  const { error: itemsError } = await admin.from("rfq_items").insert(itemRows);
  if (itemsError) {
    throw new Error(`RFQ items failed: ${itemsError.message}`);
  }

  // ----- Notify staff (managers + super admins) -----
  const { data: managers } = await admin
    .from("profiles")
    .select("id, roles!inner(key)")
    .in("roles.key", ["sales_manager", "super_admin"])
    .eq("is_active", true);

  if (managers && managers.length > 0) {
    await admin.from("notifications").insert(
      managers.map((m) => ({
        user_id: m.id,
        kind: "rfq_created",
        title: `New quotation request ${rfq.reference}`,
        body: `${itemRows.length} item(s) from ${cart.customerName || cart.phone || "customer"} via WhatsApp cart`,
        link: `/dashboard/rfqs/${rfq.id}`,
      })),
    );
  }

  await admin
    .from("customers")
    .update({ last_contact_at: new Date().toISOString() })
    .eq("id", customerId);

  return rfq.id;
}
