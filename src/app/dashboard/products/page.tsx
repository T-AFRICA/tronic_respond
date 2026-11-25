import Link from "next/link";
import {
  Package,
  Plus,
  Upload,
  Image as ImageIcon,
  Search,
  BadgePercent,
  X,
} from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { requirePermission, hasPermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
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

const VISIBILITY_PILL: Record<string, { cls: string; dot: string; label: string }> = {
  published: { cls: "bg-green-50 text-green-700 border-green-200", dot: "bg-green-500", label: "Published" },
  draft: { cls: "bg-neutral-bg text-charcoal-light border-neutral-border", dot: "bg-charcoal-light/50", label: "Draft" },
  archived: { cls: "bg-amber-50 text-amber-700 border-amber-200", dot: "bg-amber-500", label: "Archived" },
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
  const supabase = await createSupabaseServerClient();

  const [{ products, total, pageSize }, categories, publishedRes, missingImgRes] =
    await Promise.all([
      listProducts({
        search: params.q,
        categoryId: params.category,
        visibility: params.visibility,
        page,
      }),
      listCategories(),
      supabase
        .from("products")
        .select("id", { count: "exact", head: true })
        .eq("visibility", "published"),
      supabase
        .from("products")
        .select("id, product_images(id)", { count: "exact", head: true })
        .is("product_images", null),
    ]);

  // Enrich the visible page: primary image, current retail price, active offer
  const ids = products.map((p) => p.id);
  const [{ data: images }, { data: prices }, { data: offers }] = ids.length
    ? await Promise.all([
        supabase
          .from("product_images")
          .select("product_id, public_url, is_primary")
          .in("product_id", ids),
        supabase
          .from("current_product_prices")
          .select("product_id, amount, currency")
          .eq("price_type", "retail")
          .in("product_id", ids),
        supabase
          .from("active_offer_products")
          .select("product_id, offer_price, discount_percent")
          .in("product_id", ids),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];

  const imageOf = (id: string) => {
    const list = (images ?? []).filter((i) => i.product_id === id);
    return list.find((i) => i.is_primary)?.public_url ?? list[0]?.public_url ?? null;
  };
  const priceOf = (id: string) => prices?.find((p) => p.product_id === id);
  const offerOf = (id: string) => offers?.find((o) => o.product_id === id);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const canWrite = hasPermission(profile, "products.write");
  const hasFilters = Boolean(params.q || params.category || params.visibility);
  const from = (page - 1) * pageSize;

  const qs = (patch: Record<string, string | undefined>) => {
    const merged: Record<string, string | undefined> = {
      q: params.q,
      category: params.category,
      visibility: params.visibility,
      ...patch,
    };
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v) sp.set(k, v);
    const s = sp.toString();
    return s ? `?${s}` : "";
  };

  return (
    <div className="space-y-4 max-w-6xl">
      {/* Header */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="display text-2xl font-black">Products</h1>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap text-xs">
            <span className="border border-neutral-border bg-white rounded-full px-2.5 py-1">
              <b>{total.toLocaleString()}</b> total
            </span>
            <span className="border border-green-200 bg-green-50 text-green-700 rounded-full px-2.5 py-1">
              <b>{(publishedRes.count ?? 0).toLocaleString()}</b> published
            </span>
            {(missingImgRes.count ?? 0) > 0 && (
              <Link
                href="/dashboard/products/images"
                className="border border-amber-200 bg-amber-50 text-amber-700 rounded-full px-2.5 py-1 hover:border-amber-400"
              >
                <b>{(missingImgRes.count ?? 0).toLocaleString()}</b> missing image →
              </Link>
            )}
          </div>
        </div>
        {canWrite && (
          <div className="flex gap-2 flex-wrap">
            <Link
              href="/dashboard/products/images"
              className="inline-flex items-center gap-1.5 text-sm border border-neutral-border bg-white rounded-lg px-3.5 py-2 hover:border-charcoal-light/40"
            >
              <ImageIcon size={15} /> Images
            </Link>
            <Link
              href="/dashboard/products/import"
              className="inline-flex items-center gap-1.5 text-sm border border-neutral-border bg-white rounded-lg px-3.5 py-2 hover:border-charcoal-light/40"
            >
              <Upload size={15} /> Import Excel / CSV
            </Link>
            <Link
              href="/dashboard/products/new"
              className="inline-flex items-center gap-1.5 text-sm bg-tronic-red hover:bg-tronic-red-dark text-white font-semibold rounded-lg px-4 py-2 shadow-sm"
            >
              <Plus size={15} /> Add Product
            </Link>
          </div>
        )}
      </div>

      {/* Filter toolbar */}
      <form
        className="bg-white border border-neutral-border rounded-xl p-2.5 flex gap-2 flex-wrap items-center"
        action="/dashboard/products"
      >
        <div className="relative flex-1 min-w-56">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal-light/50 pointer-events-none"
          />
          <input
            type="search"
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Search SKU, name, brand, model…"
            className="w-full rounded-lg border border-neutral-border bg-neutral-bg/50 pl-9 pr-3 py-2 text-sm focus:bg-white focus:outline-none"
          />
        </div>
        <select
          name="category"
          defaultValue={params.category ?? ""}
          className="rounded-lg border border-neutral-border bg-white px-3 py-2 text-sm"
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
          className="rounded-lg border border-neutral-border bg-white px-3 py-2 text-sm"
        >
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </select>
        <button
          type="submit"
          className="text-sm bg-charcoal hover:bg-black text-white font-semibold rounded-lg px-4 py-2"
        >
          Filter
        </button>
        {hasFilters && (
          <Link
            href="/dashboard/products"
            className="inline-flex items-center gap-1 text-xs text-charcoal-light hover:text-tronic-red px-1"
          >
            <X size={13} /> Reset
          </Link>
        )}
      </form>

      {/* Table */}
      <div className="border border-neutral-border rounded-xl overflow-hidden bg-white">
        <table className="data-table">
          <thead>
            <tr>
              <th className="w-[38%]">Product</th>
              <th>SKU</th>
              <th>Category</th>
              <th className="text-right">Retail (TZS)</th>
              <th>Offer</th>
              <th>Status</th>
              <th>Meta sync</th>
            </tr>
          </thead>
          <tbody>
            {products.length === 0 && (
              <tr>
                <td colSpan={7} className="p-0">
                  <EmptyState
                    icon={Package}
                    title="No products found"
                    hint="Adjust the filters, or import your catalog from Excel/CSV."
                    actionHref="/dashboard/products/import"
                    actionLabel="Import products"
                  />
                </td>
              </tr>
            )}
            {products.map((p) => {
              const image = imageOf(p.id);
              const price = priceOf(p.id);
              const offer = offerOf(p.id);
              const vis = VISIBILITY_PILL[p.visibility] ?? VISIBILITY_PILL.draft;
              return (
                <tr key={p.id}>
                  <td>
                    <Link
                      href={`/dashboard/products/${p.id}`}
                      className="flex items-center gap-3 group/row min-w-0"
                    >
                      <span className="w-10 h-10 shrink-0 rounded-lg bg-neutral-bg border border-neutral-border flex items-center justify-center overflow-hidden">
                        {image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={image}
                            alt=""
                            className="w-full h-full object-contain"
                            loading="lazy"
                          />
                        ) : (
                          <Package size={16} className="text-charcoal-light/40" />
                        )}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium leading-snug truncate group-hover/row:text-tronic-red">
                          {p.name}
                        </span>
                        {(p.brand || p.model_number) && (
                          <span className="block text-xs text-charcoal-light truncate">
                            {[p.brand, p.model_number].filter(Boolean).join(" · ")}
                          </span>
                        )}
                      </span>
                    </Link>
                  </td>
                  <td className="font-mono text-xs whitespace-nowrap">{p.sku}</td>
                  <td className="text-sm">
                    {p.category_name ? (
                      <span className="text-xs border border-neutral-border bg-neutral-bg rounded-full px-2 py-0.5">
                        {p.category_name}
                      </span>
                    ) : (
                      <span className="text-charcoal-light">—</span>
                    )}
                  </td>
                  <td className="text-right font-medium whitespace-nowrap">
                    {price ? Number(price.amount).toLocaleString() : <span className="text-charcoal-light font-normal">—</span>}
                  </td>
                  <td>
                    {offer ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-tronic-red text-white rounded-full px-2 py-0.5">
                        <BadgePercent size={11} />
                        {offer.discount_percent !== null
                          ? `-${Number(offer.discount_percent)}%`
                          : Number(offer.offer_price).toLocaleString()}
                      </span>
                    ) : (
                      <span className="text-charcoal-light text-xs">—</span>
                    )}
                  </td>
                  <td>
                    <span
                      className={`inline-flex items-center gap-1.5 text-[11px] border rounded-full px-2 py-0.5 ${vis.cls}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${vis.dot}`} />
                      {vis.label}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`inline-block text-[11px] border rounded-full px-2 py-0.5 ${SYNC_BADGE[p.meta_sync_status] ?? SYNC_BADGE.not_synced}`}
                    >
                      {p.meta_sync_status.replace("_", " ")}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between gap-3 flex-wrap text-sm">
        <p className="text-xs text-charcoal-light">
          Showing {total === 0 ? 0 : from + 1}–{Math.min(from + pageSize, total)} of{" "}
          {total.toLocaleString()}
        </p>
        {totalPages > 1 && (
          <div className="flex items-center gap-1.5">
            {page > 1 && (
              <Link
                href={`/dashboard/products${qs({ page: String(page - 1) })}`}
                className="border border-neutral-border bg-white rounded-lg px-3 py-1.5 hover:border-charcoal-light/40"
              >
                ← Prev
              </Link>
            )}
            <span className="text-charcoal-light px-2">
              {page} / {totalPages}
            </span>
            {page < totalPages && (
              <Link
                href={`/dashboard/products${qs({ page: String(page + 1) })}`}
                className="border border-neutral-border bg-white rounded-lg px-3 py-1.5 hover:border-charcoal-light/40"
              >
                Next →
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
