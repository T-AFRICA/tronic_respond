import Link from "next/link";
import { requirePermission, hasPermission } from "@/lib/auth/session";
import { listProducts, listCategories } from "@/modules/products/service";

export const metadata = { title: "Products" };
export const dynamic = "force-dynamic";

const SYNC_BADGE: Record<string, string> = {
  synced: "bg-green-50 text-green-700 border-green-200",
  failed: "bg-tronic-red-soft text-tronic-red border-tronic-red/30",
  syncing: "bg-amber-50 text-amber-700 border-amber-200",
  queued: "bg-amber-50 text-amber-700 border-amber-200",
  not_synced: "bg-neutral-bg text-charcoal-light border-neutral-border",
  excluded: "bg-neutral-bg text-charcoal-light border-neutral-border",
};

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    category?: string;
    visibility?: string;
    page?: string;
  }>;
}) {
  const profile = await requirePermission("products.read");
  const params = await searchParams;
  const page = Number(params.page ?? "1") || 1;

  const [{ products, total, pageSize }, categories] = await Promise.all([
    listProducts({
      search: params.q,
      categoryId: params.category,
      visibility: params.visibility,
      page,
    }),
    listCategories(),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const canWrite = hasPermission(profile, "products.write");

  return (
    <div className="space-y-4 max-w-6xl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="display text-2xl font-black">Products</h1>
          <p className="text-sm text-charcoal-light">
            {total.toLocaleString()} products in the central catalog
          </p>
        </div>
        {canWrite && (
          <div className="flex gap-2">
            <Link
              href="/dashboard/products/import"
              className="text-sm border border-neutral-border bg-white rounded px-3 py-2 hover:border-charcoal-light"
            >
              Import Excel / CSV
            </Link>
            <Link
              href="/dashboard/products/new"
              className="text-sm bg-tronic-red hover:bg-tronic-red-dark text-white font-semibold rounded px-3 py-2"
            >
              Add Product
            </Link>
          </div>
        )}
      </div>

      <form className="flex gap-2 flex-wrap" action="/dashboard/products">
        <input
          type="search"
          name="q"
          defaultValue={params.q ?? ""}
          placeholder="Search SKU, name, brand, model…"
          className="w-72 rounded border border-neutral-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tronic-red/40"
        />
        <select
          name="category"
          defaultValue={params.category ?? ""}
          className="rounded border border-neutral-border bg-white px-3 py-2 text-sm"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          name="visibility"
          defaultValue={params.visibility ?? ""}
          className="rounded border border-neutral-border bg-white px-3 py-2 text-sm"
        >
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </select>
        <button
          type="submit"
          className="text-sm border border-neutral-border bg-white rounded px-4 py-2 hover:border-charcoal-light"
        >
          Filter
        </button>
      </form>

      <div className="border border-neutral-border rounded-lg overflow-hidden">
        <table className="data-table">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Name</th>
              <th>Brand</th>
              <th>Category</th>
              <th>Visibility</th>
              <th>Meta Sync</th>
            </tr>
          </thead>
          <tbody>
            {products.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center text-charcoal-light py-8">
                  No products found.
                  {canWrite && " Import your catalog to get started."}
                </td>
              </tr>
            )}
            {products.map((p) => (
              <tr key={p.id}>
                <td className="font-mono text-xs">
                  <Link
                    href={`/dashboard/products/${p.id}`}
                    className="text-tronic-red hover:underline"
                  >
                    {p.sku}
                  </Link>
                </td>
                <td>{p.name}</td>
                <td>{p.brand}</td>
                <td>{p.category_name ?? "—"}</td>
                <td className="capitalize">{p.visibility}</td>
                <td>
                  <span
                    className={`inline-block text-[11px] border rounded-full px-2 py-0.5 ${SYNC_BADGE[p.meta_sync_status] ?? SYNC_BADGE.not_synced}`}
                  >
                    {p.meta_sync_status.replace("_", " ")}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center gap-2 text-sm">
          {page > 1 && (
            <Link
              href={`/dashboard/products?${new URLSearchParams({ ...params, page: String(page - 1) })}`}
              className="border border-neutral-border bg-white rounded px-3 py-1.5"
            >
              Previous
            </Link>
          )}
          <span className="text-charcoal-light">
            Page {page} of {totalPages}
          </span>
          {page < totalPages && (
            <Link
              href={`/dashboard/products?${new URLSearchParams({ ...params, page: String(page + 1) })}`}
              className="border border-neutral-border bg-white rounded px-3 py-1.5"
            >
              Next
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
