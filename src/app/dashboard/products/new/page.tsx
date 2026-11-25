import { requirePermission, hasPermission } from "@/lib/auth/session";
import { listCategories } from "@/modules/products/service";
import { ProductForm } from "@/components/products/ProductForm";
import { createProduct } from "../actions";

export const metadata = { title: "New Product" };

export default async function NewProductPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const profile = await requirePermission("products.write");
  const categories = await listCategories();
  const { error } = await searchParams;

  return (
    <div className="space-y-4">
      <h1 className="display text-2xl font-black">New Product</h1>
      {error && (
        <p className="text-sm text-tronic-red bg-tronic-red-soft border border-tronic-red/20 rounded px-3 py-2 max-w-3xl">
          {error === "duplicate_sku"
            ? "A product with this SKU already exists."
            : error === "validation"
              ? "Please check the required fields."
              : "Save failed. Please try again."}
        </p>
      )}
      <ProductForm
        action={createProduct}
        categories={categories}
        submitLabel="Create Product"
        showWholesale={hasPermission(profile, "quotations.write") || hasPermission(profile, "products.write")}
      />
    </div>
  );
}
