"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import * as XLSX from "xlsx";
import { requirePermission } from "@/lib/auth/session";
import {
  createSupabaseServerClient,
  createSupabaseAdminClient,
} from "@/lib/supabase/server";
import {
  importPilotProductsAsOffer,
  sweepOfferStatuses,
} from "@/modules/offers/service";

const BATCH = 500;
const MAX_OFFER_PRODUCTS = 5000;

/** Product search for the offer composer (with current retail price). */
export async function searchOfferProducts(term: string) {
  await requirePermission("offers.write");
  const supabase = await createSupabaseServerClient();
  const clean = term.trim().toLowerCase();
  if (!clean) return { ok: false as const, error: "Enter a search term." };

  const { data: products } = await supabase
    .from("products")
    .select("id, sku, name")
    .ilike("search_text", `%${clean}%`)
    .limit(15);
  if (!products || products.length === 0) {
    return { ok: false as const, error: "No products match." };
  }

  const { data: prices } = await supabase
    .from("current_product_prices")
    .select("product_id, amount, currency")
    .eq("price_type", "retail")
    .in("product_id", products.map((p) => p.id));

  return {
    ok: true as const,
    products: products.map((p) => {
      const price = prices?.find((x) => x.product_id === p.id);
      return {
        ...p,
        retail_price: price ? Number(price.amount) : null,
        currency: price?.currency ?? "TZS",
      };
    }),
  };
}

const createOfferSchema = z.object({
  name: z.string().trim().min(3).max(200),
  description: z.string().trim().max(2000).default(""),
  pricing_mode: z.enum(["percentage", "fixed_price", "individual"]),
  discount_value: z.number().nonnegative().nullable(),
  starts_at: z.string().datetime().nullable(),
  ends_at: z.string().datetime().nullable(),
  selection_mode: z.enum(["products", "category", "all_published"]),
  product_ids: z.array(z.string().uuid()).max(MAX_OFFER_PRODUCTS).default([]),
  category_id: z.string().uuid().nullable(),
  /** productId → offer price (individual mode) */
  individual_prices: z.record(z.string().uuid(), z.number().positive()).default({}),
});

export async function createOffer(payload: unknown) {
  const profile = await requirePermission("offers.write");
  const parsed = createOfferSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues.map((i) => i.message).join("; "),
    };
  }
  const data = parsed.data;

  if (data.pricing_mode === "percentage") {
    if (data.discount_value === null || data.discount_value <= 0 || data.discount_value >= 100) {
      return { ok: false as const, error: "Percentage discount must be between 0 and 100." };
    }
  }
  if (data.pricing_mode === "fixed_price" && (data.discount_value === null || data.discount_value <= 0)) {
    return { ok: false as const, error: "Enter the fixed offer price." };
  }
  if (data.ends_at && new Date(data.ends_at) <= new Date()) {
    return { ok: false as const, error: "End date must be in the future." };
  }
  if (data.starts_at && data.ends_at && new Date(data.ends_at) <= new Date(data.starts_at)) {
    return { ok: false as const, error: "End date must be after the start date." };
  }

  const supabase = await createSupabaseServerClient();

  // ----- Resolve the product selection -----
  let productIds: string[] = data.product_ids;
  if (data.selection_mode === "category") {
    if (!data.category_id) return { ok: false as const, error: "Choose a category." };
    const { data: rows } = await supabase
      .from("products")
      .select("id")
      .eq("category_id", data.category_id)
      .limit(MAX_OFFER_PRODUCTS);
    productIds = (rows ?? []).map((r) => r.id);
  } else if (data.selection_mode === "all_published") {
    const { data: rows } = await supabase
      .from("products")
      .select("id")
      .eq("visibility", "published")
      .limit(MAX_OFFER_PRODUCTS);
    productIds = (rows ?? []).map((r) => r.id);
  }
  if (productIds.length === 0) {
    return { ok: false as const, error: "The selection contains no products." };
  }

  // ----- Current retail prices as reference -----
  const refByProduct = new Map<string, number>();
  for (let i = 0; i < productIds.length; i += 1000) {
    const { data: prices } = await supabase
      .from("current_product_prices")
      .select("product_id, amount")
      .eq("price_type", "retail")
      .in("product_id", productIds.slice(i, i + 1000));
    for (const p of prices ?? []) refByProduct.set(p.product_id, Number(p.amount));
  }

  // ----- Compute offer rows (never below zero, 2dp) -----
  const skipped: string[] = [];
  const rows: {
    product_id: string;
    offer_price: number;
    reference_price: number | null;
  }[] = [];
  for (const pid of productIds) {
    const ref = refByProduct.get(pid) ?? null;
    let offerPrice: number | null = null;
    if (data.pricing_mode === "percentage") {
      if (ref === null) {
        skipped.push(pid);
        continue;
      }
      offerPrice = Math.round(ref * (1 - data.discount_value! / 100) * 100) / 100;
    } else if (data.pricing_mode === "fixed_price") {
      offerPrice = data.discount_value!;
    } else {
      const p = data.individual_prices[pid];
      if (!p) {
        skipped.push(pid);
        continue;
      }
      offerPrice = p;
    }
    if (offerPrice === null || offerPrice < 0) {
      skipped.push(pid);
      continue;
    }
    rows.push({ product_id: pid, offer_price: offerPrice, reference_price: ref });
  }
  if (rows.length === 0) {
    return {
      ok: false as const,
      error:
        "No products could be priced — products need a current retail price (or an individual offer price).",
    };
  }

  const { data: offer, error } = await supabase
    .from("offers")
    .insert({
      name: data.name,
      description: data.description,
      pricing_mode: data.pricing_mode,
      discount_value: data.discount_value,
      starts_at: data.starts_at,
      ends_at: data.ends_at,
      created_by: profile.id,
    })
    .select("id")
    .single();
  if (error || !offer) {
    return { ok: false as const, error: error?.message ?? "Offer create failed." };
  }

  for (let i = 0; i < rows.length; i += BATCH) {
    const { error: rowError } = await supabase.from("offer_products").insert(
      rows.slice(i, i + BATCH).map((r) => ({ ...r, offer_id: offer.id })),
    );
    if (rowError) return { ok: false as const, error: rowError.message };
  }

  revalidatePath("/dashboard/offers");
  return { ok: true as const, id: offer.id, added: rows.length, skipped: skipped.length };
}

/** One-click bridge: pilot_products → products + a draft offer. */
export async function importPilotOffer() {
  const profile = await requirePermission("offers.write");
  const admin = createSupabaseAdminClient();
  const result = await importPilotProductsAsOffer(admin, profile.id);

  await admin.from("audit_logs").insert({
    actor_id: profile.id,
    action: "offers.pilot_import",
    entity_type: "offer",
    entity_id: result.offerId ?? null,
    after: {
      ok: result.ok,
      productsCreated: result.productsCreated,
      productsLinked: result.productsLinked,
      skipped: result.skipped.length,
      error: result.error ?? null,
    },
  });

  revalidatePath("/dashboard/offers");
  if (result.ok && result.offerId) {
    redirect(`/dashboard/offers/${result.offerId}?imported=1`);
  }
  redirect(`/dashboard/offers?error=${encodeURIComponent(result.error ?? "Import failed")}`);
}

/**
 * Excel/CSV offer-price import: columns `sku`, `offer_price`
 * (optional `reference_price`). Updates rows of a draft/paused/scheduled offer.
 */
export async function importOfferPricesFile(offerId: string, formData: FormData) {
  await requirePermission("offers.write");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false as const, error: "Choose an .xlsx or .csv file." };
  }
  if (file.size > 5 * 1024 * 1024) {
    return { ok: false as const, error: "File too large (max 5 MB)." };
  }

  const supabase = await createSupabaseServerClient();
  const { data: offer } = await supabase
    .from("offers")
    .select("id, status")
    .eq("id", offerId)
    .single();
  if (!offer) return { ok: false as const, error: "Offer not found." };
  if (!["draft", "paused", "scheduled"].includes(offer.status)) {
    return {
      ok: false as const,
      error: "Prices can only be imported while the offer is draft, scheduled or paused.",
    };
  }

  let rows: Record<string, unknown>[];
  try {
    const wb = XLSX.read(Buffer.from(await file.arrayBuffer()), { type: "buffer" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  } catch {
    return { ok: false as const, error: "Could not parse the file." };
  }
  if (rows.length === 0) return { ok: false as const, error: "The file has no data rows." };
  if (rows.length > MAX_OFFER_PRODUCTS) {
    return { ok: false as const, error: `Too many rows (max ${MAX_OFFER_PRODUCTS}).` };
  }

  const norm = (r: Record<string, unknown>, keys: string[]) => {
    for (const k of Object.keys(r)) {
      if (keys.includes(k.trim().toLowerCase().replace(/\s+/g, "_"))) return r[k];
    }
    return undefined;
  };

  const parsedRows = rows
    .map((r, idx) => ({
      line: idx + 2,
      sku: String(norm(r, ["sku"]) ?? "").trim(),
      offer_price: Number(norm(r, ["offer_price", "offer", "re_price", "price"]) ?? NaN),
      reference_price: Number(norm(r, ["reference_price", "reference", "ref_price"]) ?? NaN),
    }))
    .filter((r) => r.sku.length > 0);

  const errors: string[] = [];
  let updated = 0;
  let notInOffer = 0;

  for (let i = 0; i < parsedRows.length; i += 200) {
    const chunk = parsedRows.slice(i, i + 200);
    const { data: products } = await supabase
      .from("products")
      .select("id, sku")
      .in("sku", chunk.map((c) => c.sku));
    const idBySku = new Map((products ?? []).map((p) => [p.sku, p.id]));

    for (const row of chunk) {
      const productId = idBySku.get(row.sku);
      if (!productId) {
        errors.push(`Line ${row.line}: unknown SKU ${row.sku}`);
        continue;
      }
      if (!(row.offer_price > 0)) {
        errors.push(`Line ${row.line}: invalid offer_price for ${row.sku}`);
        continue;
      }
      const { data: updatedRows, error } = await supabase
        .from("offer_products")
        .update({
          offer_price: Math.round(row.offer_price * 100) / 100,
          ...(row.reference_price > 0
            ? { reference_price: Math.round(row.reference_price * 100) / 100 }
            : {}),
          // price changed → verification must be redone
          price_verified: false,
          verified_by: null,
          verified_at: null,
        })
        .eq("offer_id", offerId)
        .eq("product_id", productId)
        .select("id");
      if (error) errors.push(`Line ${row.line}: ${error.message}`);
      else if (!updatedRows || updatedRows.length === 0) notInOffer++;
      else updated++;
    }
  }

  revalidatePath(`/dashboard/offers/${offerId}`);
  return {
    ok: true as const,
    updated,
    notInOffer,
    errors: errors.slice(0, 20),
    totalErrors: errors.length,
  };
}

/** Mark every product price on the offer as human-verified (offers.activate). */
export async function verifyAllOfferPrices(offerId: string) {
  const profile = await requirePermission("offers.activate");
  const supabase = await createSupabaseServerClient();
  await supabase
    .from("offer_products")
    .update({
      price_verified: true,
      verified_by: profile.id,
      verified_at: new Date().toISOString(),
    })
    .eq("offer_id", offerId)
    .eq("price_verified", false);

  const admin = createSupabaseAdminClient();
  await admin.from("audit_logs").insert({
    actor_id: profile.id,
    action: "offers.verify_prices",
    entity_type: "offer",
    entity_id: offerId,
  });

  revalidatePath(`/dashboard/offers/${offerId}`);
}

/**
 * Activate (or schedule) an offer. Fails closed:
 *  - every product price must be verified
 *  - the window must be valid
 *  - no product may already sit in another active/scheduled offer (overlap guard)
 */
export async function activateOffer(offerId: string) {
  const profile = await requirePermission("offers.activate");
  const supabase = await createSupabaseServerClient();

  const { data: offer } = await supabase
    .from("offers")
    .select("id, status, starts_at, ends_at")
    .eq("id", offerId)
    .single();
  if (!offer || !["draft", "paused", "scheduled"].includes(offer.status)) {
    redirect(`/dashboard/offers/${offerId}?error=state`);
  }
  if (offer.ends_at && new Date(offer.ends_at) <= new Date()) {
    redirect(`/dashboard/offers/${offerId}?error=expired_window`);
  }

  const { data: items } = await supabase
    .from("offer_products")
    .select("product_id, price_verified")
    .eq("offer_id", offerId)
    .limit(MAX_OFFER_PRODUCTS);
  if (!items || items.length === 0) {
    redirect(`/dashboard/offers/${offerId}?error=no_products`);
  }
  if (items.some((i) => !i.price_verified)) {
    redirect(`/dashboard/offers/${offerId}?error=unverified`);
  }

  // Overlap guard: same product in another currently-effective offer
  const productIds = items.map((i) => i.product_id);
  let overlaps = 0;
  for (let i = 0; i < productIds.length; i += 1000) {
    const { count } = await supabase
      .from("active_offer_products")
      .select("product_id", { count: "exact", head: true })
      .neq("offer_id", offerId)
      .in("product_id", productIds.slice(i, i + 1000));
    overlaps += count ?? 0;
  }
  if (overlaps > 0) {
    redirect(`/dashboard/offers/${offerId}?error=overlap&count=${overlaps}`);
  }

  const scheduled = offer.starts_at && new Date(offer.starts_at) > new Date();
  await supabase
    .from("offers")
    .update({
      status: scheduled ? "scheduled" : "active",
      activated_by: profile.id,
      activated_at: new Date().toISOString(),
    })
    .eq("id", offerId);

  const admin = createSupabaseAdminClient();
  await admin.from("audit_logs").insert({
    actor_id: profile.id,
    action: scheduled ? "offers.schedule" : "offers.activate",
    entity_type: "offer",
    entity_id: offerId,
  });

  revalidatePath(`/dashboard/offers/${offerId}`);
  revalidatePath("/dashboard/offers");
  revalidatePath("/catalog/offers");
  redirect(`/dashboard/offers/${offerId}?activated=1`);
}

export async function pauseOffer(offerId: string) {
  const profile = await requirePermission("offers.activate");
  const supabase = await createSupabaseServerClient();
  const { data: offer } = await supabase
    .from("offers")
    .select("status")
    .eq("id", offerId)
    .single();
  if (!offer || !["active", "scheduled"].includes(offer.status)) {
    redirect(`/dashboard/offers/${offerId}?error=state`);
  }
  await supabase.from("offers").update({ status: "paused" }).eq("id", offerId);
  const admin = createSupabaseAdminClient();
  await admin.from("audit_logs").insert({
    actor_id: profile.id,
    action: "offers.pause",
    entity_type: "offer",
    entity_id: offerId,
  });
  revalidatePath(`/dashboard/offers/${offerId}`);
  revalidatePath("/catalog/offers");
}

export async function cancelOffer(offerId: string) {
  const profile = await requirePermission("offers.activate");
  const supabase = await createSupabaseServerClient();
  const { data: offer } = await supabase
    .from("offers")
    .select("status")
    .eq("id", offerId)
    .single();
  if (!offer || ["expired", "cancelled"].includes(offer.status)) {
    redirect(`/dashboard/offers/${offerId}?error=state`);
  }
  await supabase.from("offers").update({ status: "cancelled" }).eq("id", offerId);
  const admin = createSupabaseAdminClient();
  await admin.from("audit_logs").insert({
    actor_id: profile.id,
    action: "offers.cancel",
    entity_type: "offer",
    entity_id: offerId,
  });
  revalidatePath(`/dashboard/offers/${offerId}`);
  revalidatePath("/dashboard/offers");
  revalidatePath("/catalog/offers");
}

/** Manual sweep: activates due scheduled offers, expires ended ones. */
export async function runOfferSweep() {
  await requirePermission("offers.activate");
  await sweepOfferStatuses(createSupabaseAdminClient());
  revalidatePath("/dashboard/offers");
  revalidatePath("/catalog/offers");
}
