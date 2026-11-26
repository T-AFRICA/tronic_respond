import { createSupabaseAdminClient } from "@/lib/supabase/server";
import {
  upsertCatalogItems,
  type CatalogItemInput,
} from "@/integrations/meta/catalog-client";
import {
  validateEligibility,
  toCatalogItem,
  payloadHash,
  type ProductForSync,
} from "@/integrations/meta/eligibility";

const BATCH_SIZE = 100;

/**
 * Executes a catalog_sync_jobs row: validates eligibility, skips unchanged
 * payloads (hash), pushes in batches, records per-item results, updates
 * sync statuses. Only PUBLIC retail data is pushed — never wholesale prices.
 */
export async function runCatalogSyncJob(syncJobId: string): Promise<void> {
  const admin = createSupabaseAdminClient();

  const { data: job } = await admin
    .from("catalog_sync_jobs")
    .select("*")
    .eq("id", syncJobId)
    .single();
  if (!job || job.status === "completed" || job.status === "cancelled") return;

  await admin
    .from("catalog_sync_jobs")
    .update({ status: "running", started_at: new Date().toISOString() })
    .eq("id", syncJobId);

  // Select candidates: published products (retry jobs re-select failures only)
  let productQuery = admin
    .from("products")
    .select(
      "id, sku, name, brand, description, currency, availability, visibility",
    )
    .eq("visibility", "published");
  if (job.job_type === "retry_failed") {
    productQuery = productQuery.eq("meta_sync_status", "failed");
  }
  const { data: products } = await productQuery;
  if (!products || products.length === 0) {
    await finishJob(syncJobId, 0, 0, 0, 0, []);
    return;
  }

  // Load retail prices + primary images in bulk
  const ids = products.map((p) => p.id);
  const [{ data: prices }, { data: images }, { data: metaRows }] =
    await Promise.all([
      admin
        .from("current_product_prices")
        .select("product_id, price_type, amount")
        .in("product_id", ids)
        .eq("price_type", "retail"),
      admin
        .from("product_images")
        .select("product_id, public_url")
        .in("product_id", ids)
        .eq("is_primary", true),
      admin
        .from("meta_catalog_products")
        .select("product_id, last_payload_hash")
        .in("product_id", ids),
    ]);

  const priceMap = new Map((prices ?? []).map((p) => [p.product_id, p.amount]));
  const imageMap = new Map(
    (images ?? []).map((i) => [i.product_id, i.public_url]),
  );
  const hashMap = new Map(
    (metaRows ?? []).map((m) => [m.product_id, m.last_payload_hash]),
  );

  const catalogId = process.env.META_CATALOG_ID ?? "";
  // Meta fetches the `link` itself, so it must be the PUBLIC catalog URL —
  // never localhost from a local worker.
  const linkBase =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.APP_BASE_URL ??
    "https://tronic-respond.vercel.app";

  let synced = 0;
  let failed = 0;
  let skipped = 0;
  const errors: { sku: string; error: string }[] = [];
  const toPush: { product: ProductForSync; item: CatalogItemInput }[] = [];

  for (const p of products) {
    const forSync: ProductForSync = {
      ...p,
      retail_price: priceMap.get(p.id) ?? null,
      primary_image_url: imageMap.get(p.id) ?? null,
    };

    const eligibility = validateEligibility(forSync);

    await admin.from("meta_catalog_products").upsert(
      {
        product_id: p.id,
        meta_catalog_id: catalogId,
        retailer_id: p.sku,
        is_eligible: eligibility.eligible,
        eligibility_issues: eligibility.issues,
      },
      { onConflict: "product_id" },
    );

    if (!eligibility.eligible) {
      skipped++;
      await setProductStatus(p.id, "excluded");
      await recordItem(syncJobId, p.id, "excluded", eligibility.issues.join("; "));
      continue;
    }

    const item = toCatalogItem(forSync, linkBase);
    const hash = payloadHash(item);
    if (hashMap.get(p.id) === hash && job.job_type !== "manual_resync") {
      skipped++; // unchanged since last sync
      await recordItem(syncJobId, p.id, "synced", "unchanged");
      continue;
    }
    toPush.push({ product: forSync, item });
  }

  // Push in batches
  for (let i = 0; i < toPush.length; i += BATCH_SIZE) {
    const batch = toPush.slice(i, i + BATCH_SIZE);
    try {
      await upsertCatalogItems(batch.map((b) => b.item));
      for (const b of batch) {
        synced++;
        await admin
          .from("meta_catalog_products")
          .update({
            sync_status: "synced",
            last_synced_at: new Date().toISOString(),
            last_payload_hash: payloadHash(b.item),
            last_error: null,
            retry_count: 0,
          })
          .eq("product_id", b.product.id);
        await setProductStatus(b.product.id, "synced");
        await recordItem(syncJobId, b.product.id, "synced");
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      for (const b of batch) {
        failed++;
        errors.push({ sku: b.product.sku, error: message });
        await admin
          .from("meta_catalog_products")
          .update({ sync_status: "failed", last_error: message })
          .eq("product_id", b.product.id);
        await setProductStatus(b.product.id, "failed");
        await recordItem(syncJobId, b.product.id, "failed", message);
      }
    }
  }

  await finishJob(syncJobId, products.length, synced, failed, skipped, errors);

  async function setProductStatus(productId: string, status: string) {
    await admin
      .from("products")
      .update({ meta_sync_status: status })
      .eq("id", productId);
  }

  async function recordItem(
    jobId: string,
    productId: string,
    status: string,
    error?: string,
  ) {
    await admin.from("catalog_sync_job_items").insert({
      job_id: jobId,
      product_id: productId,
      status,
      error: error ?? null,
    });
  }

  async function finishJob(
    jobId: string,
    total: number,
    syncedN: number,
    failedN: number,
    skippedN: number,
    errs: { sku: string; error: string }[],
  ) {
    await admin
      .from("catalog_sync_jobs")
      .update({
        status: failedN === 0 ? "completed" : "completed_with_errors",
        total_items: total,
        synced_items: syncedN,
        failed_items: failedN,
        skipped_items: skippedN,
        error_summary: errs.slice(0, 200),
        finished_at: new Date().toISOString(),
      })
      .eq("id", jobId);
  }
}
