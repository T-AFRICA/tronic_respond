import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Product } from "@/lib/types";

export type ProductListParams = {
  search?: string;
  categoryId?: string;
  visibility?: string;
  syncStatus?: string;
  page?: number;
  pageSize?: number;
};

export type ProductListResult = {
  products: (Product & { category_name: string | null })[];
  total: number;
  page: number;
  pageSize: number;
};

/** Staff product search: SKU, name, brand, model — backed by trigram index. */
export async function listProducts(
  params: ProductListParams,
): Promise<ProductListResult> {
  const supabase = await createSupabaseServerClient();
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, params.pageSize ?? 25);
  const from = (page - 1) * pageSize;

  let query = supabase
    .from("products")
    .select("*, categories(name)", { count: "exact" })
    .order("updated_at", { ascending: false })
    .range(from, from + pageSize - 1);

  if (params.search) {
    const term = params.search.trim().toLowerCase();
    // search_text is a generated column: sku + name + brand + model
    query = query.ilike("search_text", `%${term}%`);
  }
  if (params.categoryId) query = query.eq("category_id", params.categoryId);
  if (params.visibility) query = query.eq("visibility", params.visibility);
  if (params.syncStatus) query = query.eq("meta_sync_status", params.syncStatus);

  const { data, count, error } = await query;
  if (error) throw new Error(`Product list failed: ${error.message}`);

  return {
    products: (data ?? []).map((p) => ({
      ...p,
      category_name: (Array.isArray(p.categories)
        ? p.categories[0]?.name
        : (p.categories as { name: string } | null)?.name) ?? null,
    })),
    total: count ?? 0,
    page,
    pageSize,
  };
}

export async function getProduct(id: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("products")
    .select(
      "*, product_images(*), product_specifications(*), categories(id, name)",
    )
    .eq("id", id)
    .single();
  if (error) throw new Error(`Product not found: ${error.message}`);
  return data;
}

export async function listCategories() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .order("sort_order")
    .order("name");
  if (error) throw new Error(error.message);
  return data ?? [];
}
