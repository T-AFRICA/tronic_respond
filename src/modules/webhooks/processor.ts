import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { createRfqFromCart, type CartPayload } from "@/modules/rfq/create-from-cart";

/**
 * Processes a stored webhook event. Idempotent: safe to re-run on retry.
 * Supported events (Phase 1B):
 *  - incoming message containing a WhatsApp order/cart  → RFQ creation
 *  - other incoming messages                             → message log only
 */
export async function processWebhookEvent(eventId: string): Promise<void> {
  const admin = createSupabaseAdminClient();

  const { data: event } = await admin
    .from("webhook_events")
    .select("*")
    .eq("id", eventId)
    .single();

  if (!event) return;
  if (event.status === "processed" || event.status === "ignored") return;

  await admin
    .from("webhook_events")
    .update({ status: "processing" })
    .eq("id", eventId);

  try {
    const payload = event.payload as Record<string, unknown>;
    const cart = extractCartPayload(payload);

    if (cart) {
      // Verify the payload actually carries products + quantities before
      // enabling automatic RFQ creation (spec §5). Otherwise staff use the
      // manual RFQ fallback.
      if (cart.items.length === 0) {
        await markEvent(eventId, "ignored", "Order payload without items");
        return;
      }
      await createRfqFromCart(cart, event.dedupe_key);
      await markEvent(eventId, "processed");
      return;
    }

    // Not a cart — log inbound message if it carries a contact.
    await logInboundMessage(payload);
    await processOptOutKeywords(payload);
    await markEvent(eventId, "processed");
  } catch (e) {
    await markEvent(
      eventId,
      "failed",
      e instanceof Error ? e.message : String(e),
    );
    throw e;
  }
}

async function markEvent(eventId: string, status: string, error?: string) {
  const admin = createSupabaseAdminClient();
  await admin
    .from("webhook_events")
    .update({
      status,
      error: error ?? null,
      processed_at: new Date().toISOString(),
    })
    .eq("id", eventId);
}

/**
 * Pulls a WhatsApp order/cart out of a Respond.io message payload.
 * Payload shapes differ by plan/version, so this is defensive: it accepts
 * `message.message.order`, `message.order` or an `order`-typed message, and
 * returns null when no order-like structure with items is present.
 */
function extractCartPayload(payload: Record<string, unknown>): CartPayload | null {
  const contact = payload.contact as { id?: unknown; phone?: unknown; firstName?: unknown; lastName?: unknown } | undefined;
  const messageWrapper = payload.message as Record<string, unknown> | undefined;
  const inner =
    (messageWrapper?.message as Record<string, unknown> | undefined) ??
    messageWrapper ??
    payload;

  const order =
    (inner.order as Record<string, unknown> | undefined) ??
    ((inner.type === "order" || inner.type === "whatsapp_order")
      ? (inner.payload as Record<string, unknown> | undefined)
      : undefined);

  if (!order) return null;

  const rawItems =
    (order.product_items as unknown[] | undefined) ??
    (order.productItems as unknown[] | undefined) ??
    (order.items as unknown[] | undefined) ??
    [];

  const items = rawItems
    .map((raw) => {
      const it = raw as Record<string, unknown>;
      const retailerId =
        it.product_retailer_id ?? it.retailer_id ?? it.productRetailerId ?? it.sku;
      const quantity = Number(it.quantity ?? it.qty ?? 0);
      const metaProductId = it.product_id ?? it.productId ?? null;
      if (!retailerId && !metaProductId) return null;
      if (!quantity || quantity <= 0) return null;
      return {
        retailerId: retailerId ? String(retailerId) : null,
        metaProductId: metaProductId ? String(metaProductId) : null,
        quantity,
        raw: it,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  return {
    respondioContactId: contact?.id !== undefined ? String(contact.id) : null,
    phone: contact?.phone ? String(contact.phone) : null,
    customerName: [contact?.firstName, contact?.lastName]
      .filter(Boolean)
      .join(" "),
    noteText: typeof order.text === "string" ? order.text : "",
    items,
  };
}

/** Keywords that record a marketing opt-out (EN + Swahili). */
const OPT_OUT_KEYWORDS = ["stop", "unsubscribe", "acha", "sitaki", "optout", "opt out"];
const OPT_IN_KEYWORDS = ["start", "subscribe", "anza", "nataka", "optin", "opt in"];

/**
 * Inbound "STOP"-style messages record an opt-out consent row
 * (append-only; latest wins). "START" re-grants. Broadcast suppression
 * reads the latest row at send time.
 */
async function processOptOutKeywords(payload: Record<string, unknown>) {
  const contact = payload.contact as { id?: unknown } | undefined;
  if (contact?.id === undefined) return;

  const messageWrapper = payload.message as Record<string, unknown> | undefined;
  const inner =
    (messageWrapper?.message as Record<string, unknown> | undefined) ??
    messageWrapper;
  const text =
    typeof inner?.text === "string"
      ? inner.text
      : typeof messageWrapper?.text === "string"
        ? messageWrapper.text
        : "";
  const normalized = text.trim().toLowerCase();
  if (!normalized || normalized.length > 30) return;

  const optOut = OPT_OUT_KEYWORDS.includes(normalized);
  const optIn = !optOut && OPT_IN_KEYWORDS.includes(normalized);
  if (!optOut && !optIn) return;

  const admin = createSupabaseAdminClient();
  const { data: customer } = await admin
    .from("customers")
    .select("id")
    .eq("respondio_contact_id", String(contact.id))
    .maybeSingle();
  if (!customer) return;

  await admin.from("customer_consents").insert({
    customer_id: customer.id,
    channel: "whatsapp_marketing",
    status: optOut ? "revoked" : "granted",
    source: optOut ? "keyword_stop" : "keyword_start",
  });
}

async function logInboundMessage(payload: Record<string, unknown>) {
  const contact = payload.contact as { id?: unknown } | undefined;
  if (contact?.id === undefined) return;

  const admin = createSupabaseAdminClient();
  const { data: customer } = await admin
    .from("customers")
    .select("id")
    .eq("respondio_contact_id", String(contact.id))
    .maybeSingle();

  const messageWrapper = payload.message as Record<string, unknown> | undefined;
  const messageId = messageWrapper?.messageId ?? messageWrapper?.id;
  const text =
    typeof messageWrapper?.text === "string"
      ? messageWrapper.text
      : typeof (messageWrapper?.message as Record<string, unknown> | undefined)?.text === "string"
        ? String((messageWrapper?.message as Record<string, unknown>).text)
        : "";

  await admin.from("message_logs").upsert(
    {
      customer_id: customer?.id ?? null,
      respondio_contact_id: String(contact.id),
      respondio_message_id: messageId ? String(messageId) : null,
      direction: "inbound",
      kind: "text",
      status: "delivered",
      body_preview: text.slice(0, 200),
      payload,
      occurred_at: new Date().toISOString(),
    },
    { onConflict: "respondio_message_id", ignoreDuplicates: true },
  );
}
