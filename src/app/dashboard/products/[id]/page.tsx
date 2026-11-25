import { notFound } from "next/navigation";
import { requirePermission, hasPermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listCategories } from "@/modules/products/service";
import { ProductForm } from "@/components/products/ProductForm";
import { updateProduct } from "../actions";

export const metadata = { title: "Edit Product" };
export const dynamic = "force-dynamic";

export default async function EditProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const profile = await requirePermission("products.read");
  const { id } = await params;
  const { error, saved } = await searchParams;

  const supabase = await createSupabaseServerClient();
  const [{ data: product }, categories, { data: prices }] = await Promise.all([
    supabase.from("products").select("*").eq("id", id).single(),
    listCategories(),
    supabase
      .from("current_product_prices")
      .select("*")
      .eq("product_id", id),
  ]);

  if (!product) notFound();

  const retail = prices?.find((p) => p.price_type === "retail")?.amount;
  const wholesale = prices?.find((p) => p.price_type === "wholesale")?.amount;
  const canWrite = hasPermission(profile, "products.write");

  const boundUpdate = updateProduct.bind(null, id);

  return (
    <div className="space-y-4">
      <div className="flex items-baseline gap-3">
        <h1 className="display text-2xl font-black">{product.name}</h1>
        <span className="font-mono text-sm text-charcoal-light">
          {product.sku}
        </span>
      </div>

      {saved && (
        <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2 max-w-3xl">
          Product saved.
        </p>
      )}
      {error && (
        <p className="text-sm text-tronic-red bg-tronic-red-soft border border-tronic-red/20 rounded px-3 py-2 max-w-3xl">
          {error === "duplicate_sku"
            ? "A product with this SKU already exists."
            : "Save failed. Please check the fields and try again."}
        </p>
      )}

      {canWrite ? (
        <ProductForm
          action={boundUpdate}
          categories={categories}
          values={{ ...product, retail_price: retail, wholesale_price: wholesale }}
          submitLabel="Save Changes"
          showWholesale
        />
      ) : (
        <div className="bg-white border border-neutral-border rounded-lg p-6 max-w-3xl text-sm space-y-2">
          <p><span className="text-charcoal-light">Brand:</span> {product.brand || "—"}</p>
          <p><span className="text-charcoal-light">Model:</span> {product.model_number || "—"}</p>
          <p><span className="text-charcoal-light">Availability:</span> {product.availability}</p>
          <p><span className="text-charcoal-light">Description:</span> {product.description || "—"}</p>
          {retail !== undefined && (
            <p><span className="text-charcoal-light">Retail price:</span> {retail} {product.currency}</p>
          )}
        </div>
      )}
    </div>
  );
}
