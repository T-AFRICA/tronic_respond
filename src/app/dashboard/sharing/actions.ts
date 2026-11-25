"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import {
  createSupabaseServerClient,
  createSupabaseAdminClient,
} from "@/lib/supabase/server";
import {
  sendTextMessage,
  sendImageMessage,
} from "@/integrations/respondio/client";
import { signCatalogToken } from "@/lib/catalog/links";

/** Product search for the share composer (returns public data + image). */
export async function searchShareProducts(term: string) {
  await requirePermission("sharing.send");
  const supabase = await createSupabaseServerClient();
  const clean = term.trim().toLowerCase();
  if (!clean) return { ok: false as const, error: "Enter a search term." };

  const { data: products } = await supabase
    .from("products")
    .select("id, sku, name, brand, description, currency, product_images(public_url, is_primary)")
    .eq("visibility", "published")
    .ilike("search_text", `%${clean}%`)
    .limit(10);

  if (!products || products.length === 0) {
    return { ok: false as const, error: "No published products match." };
  }

  const ids = products.map((p) => p.id);
  const { data: prices } = await supabase
    .from("current_product_prices")
    .select("product_id, amount, currency")
    .eq("price_type", "retail")
    .in("product_id", ids);

  return {
    ok: true as const,
    products: products.map((p) => {
      const images = (p.product_images ?? []) as {
        public_url: string;
        is_primary: boolean;
      }[];
      return {
        id: p.id,
        sku: p.sku,
        name: p.name,
        brand: p.brand,
        description: p.description,
        image_url: images.find((i) => i.is_primary)?.public_url ?? images[0]?.public_url ?? null,
        retail_price: prices?.find((x) => x.product_id === p.id)?.amount ?? null,
        currency: prices?.find((x) => x.product_id === p.id)?.currency ?? p.currency,
      };
    }),
  };
}

/** Customer search for the share composer. */
export async function searchShareCustomers(term: string) {
  await requirePermission("sharing.send");
  const supabase = await createSupabaseServerClient();
  const clean = term.trim();
  if (!clean) return { ok: false as const, error: "Enter a search term." };

  const { data } = await supabase
    .from("customers")
    .select("id, full_name, company_name, whatsapp_phone, respondio_contact_id")
    .or(
      `full_name.ilike.%${clean}%,company_name.ilike.%${clean}%,whatsapp_phone.ilike.%${clean}%`,
    )
    .eq("is_blocked", false)
    .limit(10);

  if (!data || data.length === 0) {
    return { ok: false as const, error: "No matching customer." };
  }
  return { ok: true as const, customers: data };
}

const shareSchema = z.object({
  customer_id: z.string().uuid(),
  product_ids: z.array(z.string().uuid()).min(1).max(10),
  share_kind: z.enum(["image_description", "catalog_link"]),
  note: z.string().max(500).default(""),
});

/**
 * Sends the selected products to one customer via Respond.io
 * (image + description per product, or a catalog link), and records the
 * share in product_shares + message_logs.
 * Max 10 products per share to stay inside sane messaging volume.
 */
export async function shareProducts(payload: unknown) {
  const profile = await requirePermission("sharing.send");

  const parsed = shareSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false as const, error: "Invalid share request." };
  }
  const { customer_id, product_ids, share_kind, note } = parsed.data;

  if (!process.env.RESPONDIO_API_TOKEN) {
    return {
      ok: false as const,
      error:
        "Respond.io is not configured. Use Respond.io's native product-sharing interface for now.",
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data: customer } = await supabase
    .from("customers")
    .select("id, respondio_contact_id, full_name, is_blocked")
    .eq("id", customer_id)
    .single();

  if (!customer || customer.is_blocked) {
    return { ok: false as const, error: "Customer unavailable." };
  }
  if (!customer.respondio_contact_id) {
    return {
      ok: false as const,
      error:
        "This customer has no Respond.io contact ID. Run customer sync, or link the contact on the customer record.",
    };
  }

  const { data: products } = await supabase
    .from("products")
    .select("id, sku, name, brand, description, currency, product_images(public_url, is_primary)")
    .in("id", product_ids);

  if (!products || products.length === 0) {
    return { ok: false as const, error: "Products not found." };
  }

  const ids = products.map((p) => p.id);
  const { data: prices } = await supabase
    .from("current_product_prices")
    .select("product_id, amount, currency")
    .eq("price_type", "retail")
    .in("product_id", ids);

  const admin = createSupabaseAdminClient();
  const contactId = customer.respondio_contact_id;
  const sentMessageIds: string[] = [];

  try {
    if (share_kind === "catalog_link") {
      const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
      const skus = products.map((p) => p.sku).join(",");
      // Expiring personalized token so a catalog RFQ attaches to this customer.
      const token = signCatalogToken(customer.id);
      const link = `${base}/catalog?skus=${encodeURIComponent(skus)}${token ? `&t=${token}` : ""}`;
      const lines = [
        note || `Hello${customer.full_name ? ` ${customer.full_name}` : ""}, here are products we think you'll like:`,
        ...products.map((p) => `• ${p.name} (${p.sku})`),
        "",
        `View details and request a quotation: ${link}`,
      ];
      const res = await sendTextMessage(contactId, lines.join("\n"));
      if (res?.messageId) sentMessageIds.push(String(res.messageId));
    } else {
      if (note) {
        const res = await sendTextMessage(contactId, note);
        if (res?.messageId) sentMessageIds.push(String(res.messageId));
      }
      for (const p of products) {
        const images = (p.product_images ?? []) as {
          public_url: string;
          is_primary: boolean;
        }[];
        const imageUrl =
          images.find((i) => i.is_primary)?.public_url ?? images[0]?.public_url;
        const price = prices?.find((x) => x.product_id === p.id);

        if (imageUrl) {
          const res = await sendImageMessage(contactId, imageUrl);
          if (res?.messageId) sentMessageIds.push(String(res.messageId));
        }
        const details = [
          `*${p.name}*`,
          p.brand ? `Brand: ${p.brand}` : null,
          `SKU: ${p.sku}`,
          price ? `Price: ${Number(price.amount).toLocaleString()} ${price.currency} (subject to quotation)` : null,
          p.description ? p.description.slice(0, 600) : null,
          "Reply here to request a quotation.",
        ]
          .filter(Boolean)
          .join("\n");
        const res = await sendTextMessage(contactId, details);
        if (res?.messageId) sentMessageIds.push(String(res.messageId));
      }
    }
  } catch (e) {
    return {
      ok: false as const,
      error: `Respond.io send failed${sentMessageIds.length ? " partway" : ""}: ${
        e instanceof Error ? e.message : "unknown error"
      }. You can finish manually from the Respond.io inbox.`,
    };
  }

  // Record history
  const { data: logRow } = await admin
    .from("message_logs")
    .insert({
      customer_id: customer.id,
      respondio_contact_id: contactId,
      respondio_message_id: sentMessageIds[0] ?? null,
      direction: "outbound",
      kind: share_kind === "catalog_link" ? "catalog_link" : "product",
      status: "sent",
      body_preview: `Shared ${products.length} product(s): ${products
        .map((p) => p.sku)
        .join(", ")
        .slice(0, 180)}`,
      sent_by: profile.id,
    })
    .select("id")
    .single();

  await admin.from("product_shares").insert({
    customer_id: customer.id,
    shared_by: profile.id,
    share_kind,
    product_ids: ids,
    message_log_id: logRow?.id ?? null,
  });

  await admin
    .from("customers")
    .update({ last_contact_at: new Date().toISOString() })
    .eq("id", customer.id);

  revalidatePath("/dashboard/sharing");
  return { ok: true as const, sent: products.length };
}
