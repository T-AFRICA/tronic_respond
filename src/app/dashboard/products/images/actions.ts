"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import {
  createSupabaseServerClient,
  createSupabaseAdminClient,
} from "@/lib/supabase/server";

/**
 * Product image management.
 *
 * Upload path: files go DIRECTLY from the browser to the Supabase Storage
 * bucket `product-images` (authenticated client; the storage RLS policy
 * requires products.write). These actions only match SKUs and register
 * metadata — image bytes never pass through the server (avoids serverless
 * body limits).
 */

/** Filename → SKU stem: strip extension + trim. "TS 5011-BK.jpg" → "TS 5011-BK" */
function skuFromFilename(name: string): string {
  return name.replace(/\.[a-z0-9]+$/i, "").trim();
}

/**
 * Match a batch of filenames against product SKUs (case-insensitive exact
 * match on the filename stem). Returns match + existing-image info so the
 * uploader can show what will happen before uploading.
 */
export async function matchImageFilenames(filenames: string[]) {
  await requirePermission("products.write");
  const clean = filenames.slice(0, 500).map((f) => String(f));
  if (clean.length === 0) return { ok: false as const, error: "No files." };

  const supabase = await createSupabaseServerClient();
  const stems = Array.from(new Set(clean.map(skuFromFilename)));

  // Case-insensitive SKU lookup in chunks
  const bySkuLower = new Map<
    string,
    { id: string; sku: string; name: string }
  >();
  for (let i = 0; i < stems.length; i += 100) {
    const chunk = stems.slice(i, i + 100);
    const orFilter = chunk
      .map((s) => `sku.ilike.${s.replace(/[,()]/g, "")}`)
      .join(",");
    const { data } = await supabase
      .from("products")
      .select("id, sku, name")
      .or(orFilter);
    for (const p of data ?? []) bySkuLower.set(p.sku.toLowerCase(), p);
  }

  const productIds = Array.from(bySkuLower.values()).map((p) => p.id);
  const withImage = new Set<string>();
  for (let i = 0; i < productIds.length; i += 500) {
    const { data } = await supabase
      .from("product_images")
      .select("product_id")
      .in("product_id", productIds.slice(i, i + 500));
    for (const r of data ?? []) withImage.add(r.product_id);
  }

  return {
    ok: true as const,
    matches: clean.map((filename) => {
      const product = bySkuLower.get(skuFromFilename(filename).toLowerCase());
      return {
        filename,
        sku: product?.sku ?? skuFromFilename(filename),
        product_id: product?.id ?? null,
        product_name: product?.name ?? null,
        replaces_existing: product ? withImage.has(product.id) : false,
      };
    }),
  };
}

const registerSchema = z.object({
  product_id: z.string().uuid(),
  storage_path: z.string().min(1).max(500),
  make_primary: z.boolean().default(true),
});

/**
 * Register an uploaded storage object as a product image.
 * make_primary unsets any previous primary (new upload becomes the catalog
 * image — "replacement" semantics without deleting history).
 */
export async function registerProductImage(payload: unknown) {
  await requirePermission("products.write");
  const parsed = registerSchema.safeParse(payload);
  if (!parsed.success) return { ok: false as const, error: "Invalid payload." };
  const { product_id, storage_path, make_primary } = parsed.data;

  // Storage paths are app-generated; guard anyway.
  if (storage_path.includes("..")) {
    return { ok: false as const, error: "Invalid storage path." };
  }

  const supabase = await createSupabaseServerClient();
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publicUrl = `${baseUrl}/storage/v1/object/public/product-images/${storage_path
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;

  if (make_primary) {
    await supabase
      .from("product_images")
      .update({ is_primary: false })
      .eq("product_id", product_id)
      .eq("is_primary", true);
  }

  const { error } = await supabase.from("product_images").insert({
    product_id,
    storage_path,
    public_url: publicUrl,
    is_primary: make_primary,
  });
  if (error) return { ok: false as const, error: error.message };

  revalidatePath("/dashboard/products/images");
  revalidatePath("/catalog/offers");
  revalidatePath("/catalog");
  return { ok: true as const, public_url: publicUrl };
}

/** Delete one product image (DB row + storage object). */
export async function deleteProductImage(imageId: string, formData?: FormData) {
  void formData;
  await requirePermission("products.write");
  const supabase = await createSupabaseServerClient();

  const { data: image } = await supabase
    .from("product_images")
    .select("id, product_id, storage_path, is_primary")
    .eq("id", imageId)
    .single();
  if (!image) return;

  await supabase.from("product_images").delete().eq("id", imageId);

  // Promote the newest remaining image if we removed the primary one
  if (image.is_primary) {
    const { data: rest } = await supabase
      .from("product_images")
      .select("id")
      .eq("product_id", image.product_id)
      .order("created_at", { ascending: false })
      .limit(1);
    if (rest?.length) {
      await supabase
        .from("product_images")
        .update({ is_primary: true })
        .eq("id", rest[0].id);
    }
  }

  // Storage removal needs the service role (storage has no delete policy for the path owner model)
  const admin = createSupabaseAdminClient();
  await admin.storage.from("product-images").remove([image.storage_path]);

  revalidatePath("/dashboard/products/images");
}
