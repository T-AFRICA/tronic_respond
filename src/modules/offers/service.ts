import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Offers domain services shared by server actions and workers.
 *
 * PRICING SAFETY (pilot):
 * The imported pilot "RE price" is ALREADY the discounted offer price — it is
 * imported as offer_price verbatim, never discounted again. reference_price
 * and the 50% badge are pilot ASSUMPTIONS: rows stay price_verified=false
 * until a human verifies them, and unverified rows never reach customers.
 */

const BATCH = 500;

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "uncategorized"
  );
}

export type PilotImportResult = {
  ok: boolean;
  error?: string;
  offerId?: string;
  productsCreated: number;
  productsLinked: number;
  pricesCreated: number;
  skipped: { sku: string; reason: string }[];
};

/**
 * Bridge the existing public.pilot_products rows (~98 imported) into the app:
 *  1. Upserts missing rows into public.products by SKU (never overwrites
 *     existing products).
 *  2. Records the imported reference price as a retail price where the
 *     product has none yet.
 *  3. Creates a DRAFT offer holding every pilot product with
 *     offer_price = offer_price_tzs (the imported RE price, already
 *     discounted — no further discount is applied).
 *
 * Idempotent: re-running links the same SKUs into a new draft offer without
 * duplicating products or price rows.
 */
export async function importPilotProductsAsOffer(
  admin: SupabaseClient,
  createdBy: string,
): Promise<PilotImportResult> {
  const skipped: { sku: string; reason: string }[] = [];

  const { data: pilots, error: pilotError } = await admin
    .from("pilot_products")
    .select("*")
    .order("sku");
  if (pilotError) {
    return {
      ok: false,
      error: `pilot_products read failed: ${pilotError.message}`,
      productsCreated: 0,
      productsLinked: 0,
      pricesCreated: 0,
      skipped,
    };
  }
  if (!pilots || pilots.length === 0) {
    return {
      ok: false,
      error:
        "pilot_products is empty in this database. In production it holds the ~98 imported pilot products.",
      productsCreated: 0,
      productsLinked: 0,
      pricesCreated: 0,
      skipped,
    };
  }

  const { data: country } = await admin
    .from("countries")
    .select("id")
    .eq("iso2", "TZ")
    .single();
  if (!country) {
    return {
      ok: false,
      error: "Country TZ missing — run base migrations first.",
      productsCreated: 0,
      productsLinked: 0,
      pricesCreated: 0,
      skipped,
    };
  }

  // ---- Categories: create any missing ones from the pilot category names ----
  const categoryNames = Array.from(
    new Set(
      pilots
        .map((p) => String(p.category ?? "").trim())
        .filter((c) => c.length > 0),
    ),
  );
  const categoryIdByName = new Map<string, string>();
  if (categoryNames.length > 0) {
    const slugs = categoryNames.map((n) => ({ name: n, slug: slugify(n) }));
    await admin
      .from("categories")
      .upsert(
        slugs.map((s) => ({ name: s.name, slug: s.slug })),
        { onConflict: "slug", ignoreDuplicates: true },
      );
    const { data: cats } = await admin
      .from("categories")
      .select("id, slug")
      .in("slug", slugs.map((s) => s.slug));
    for (const s of slugs) {
      const hit = cats?.find((c) => c.slug === s.slug);
      if (hit) categoryIdByName.set(s.name, hit.id);
    }
  }

  // ---- Products: create missing by SKU (existing products are preserved) ----
  const skus = pilots.map((p) => String(p.sku));
  const { data: existing } = await admin
    .from("products")
    .select("id, sku")
    .in("sku", skus);
  const existingBySku = new Map((existing ?? []).map((p) => [p.sku, p.id]));

  const toCreate = pilots
    .filter((p) => !existingBySku.has(String(p.sku)))
    .map((p) => ({
      sku: String(p.sku),
      name: String(p.description ?? p.sku).slice(0, 300) || String(p.sku),
      description: String(p.description ?? ""),
      category_id: categoryIdByName.get(String(p.category ?? "").trim()) ?? null,
      visibility: p.is_published ? "published" : "draft",
      country_id: country.id,
      created_by: createdBy,
    }));

  let productsCreated = 0;
  for (let i = 0; i < toCreate.length; i += BATCH) {
    const chunk = toCreate.slice(i, i + BATCH);
    const { data: created, error } = await admin
      .from("products")
      .insert(chunk)
      .select("id, sku");
    if (error) {
      return {
        ok: false,
        error: `product create failed: ${error.message}`,
        productsCreated,
        productsLinked: 0,
        pricesCreated: 0,
        skipped,
      };
    }
    for (const c of created ?? []) existingBySku.set(c.sku, c.id);
    productsCreated += created?.length ?? 0;
  }

  // ---- Retail prices: record the imported reference price where none exists ----
  const productIds = Array.from(existingBySku.values());
  const { data: priced } = await admin
    .from("product_prices")
    .select("product_id")
    .eq("price_type", "retail")
    .in("product_id", productIds);
  const alreadyPriced = new Set((priced ?? []).map((p) => p.product_id));

  const priceRows = pilots
    .map((p) => {
      const productId = existingBySku.get(String(p.sku));
      const ref = Number(p.reference_price_tzs);
      if (!productId || alreadyPriced.has(productId) || !(ref > 0)) return null;
      return {
        product_id: productId,
        price_type: "retail",
        amount: ref,
        currency: "TZS",
        created_by: createdBy,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  let pricesCreated = 0;
  for (let i = 0; i < priceRows.length; i += BATCH) {
    const { error } = await admin
      .from("product_prices")
      .insert(priceRows.slice(i, i + BATCH));
    if (!error) pricesCreated += Math.min(BATCH, priceRows.length - i);
  }

  // ---- Draft offer with every pilot product ----
  const { data: offer, error: offerError } = await admin
    .from("offers")
    .insert({
      name: `Pilot Special Offers — imported ${new Date().toISOString().slice(0, 10)}`,
      description:
        "Imported from pilot_products. offer_price = imported RE price (already discounted — NOT discounted again). Reference prices and the 50% figure are pilot assumptions: verify every price before activating.",
      pricing_mode: "individual",
      status: "draft",
      created_by: createdBy,
    })
    .select("id")
    .single();
  if (offerError || !offer) {
    return {
      ok: false,
      error: `offer create failed: ${offerError?.message}`,
      productsCreated,
      productsLinked: 0,
      pricesCreated,
      skipped,
    };
  }

  const offerRows = pilots
    .map((p) => {
      const productId = existingBySku.get(String(p.sku));
      const offerPrice = Number(p.offer_price_tzs);
      if (!productId) {
        skipped.push({ sku: String(p.sku), reason: "product not created" });
        return null;
      }
      if (!(offerPrice > 0)) {
        skipped.push({ sku: String(p.sku), reason: "missing offer price" });
        return null;
      }
      const ref = Number(p.reference_price_tzs);
      return {
        offer_id: offer.id,
        product_id: productId,
        offer_price: offerPrice,
        reference_price: ref > 0 ? ref : null,
        currency: "TZS",
        price_verified: Boolean(p.price_verified),
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  let productsLinked = 0;
  for (let i = 0; i < offerRows.length; i += BATCH) {
    const { error } = await admin
      .from("offer_products")
      .upsert(offerRows.slice(i, i + BATCH), {
        onConflict: "offer_id,product_id",
        ignoreDuplicates: true,
      });
    if (error) {
      return {
        ok: false,
        error: `offer_products insert failed: ${error.message}`,
        productsCreated,
        productsLinked,
        pricesCreated,
        skipped,
      };
    }
    productsLinked += Math.min(BATCH, offerRows.length - i);
  }

  return {
    ok: true,
    offerId: offer.id,
    productsCreated,
    productsLinked,
    pricesCreated,
    skipped,
  };
}

/** Activate due scheduled offers + expire ended ones (DB-side sweep). */
export async function sweepOfferStatuses(admin: SupabaseClient): Promise<void> {
  await admin.rpc("sweep_offer_statuses");
}
