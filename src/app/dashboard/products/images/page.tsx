import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { BulkImageUploader } from "@/components/products/BulkImageUploader";
import { deleteProductImage } from "./actions";

export const metadata = { title: "Product Images" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 24;

export default async function ProductImagesPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; q?: string; page?: string }>;
}) {
  await requirePermission("products.write");
  const sp = await searchParams;
  const view = sp.view === "with" ? "with" : "missing";
  const page = Math.max(1, Number(sp.page ?? "1") || 1);
  const from = (page - 1) * PAGE_SIZE;
  const supabase = await createSupabaseServerClient();

  const [totalRes, withImagesRes] = await Promise.all([
    supabase.from("products").select("id", { count: "exact", head: true }),
    supabase
      .from("product_images")
      .select("product_id", { count: "exact", head: true })
      .eq("is_primary", true),
  ]);
  const total = totalRes.count ?? 0;
  const withImages = withImagesRes.count ?? 0;

  // Listing: products missing an image, or products with images (gallery)
  let listQuery = supabase
    .from("products")
    .select("id, sku, name, visibility, product_images(id, public_url, is_primary)", {
      count: "exact",
    })
    .order("sku")
    .range(from, from + PAGE_SIZE - 1);
  if (sp.q) listQuery = listQuery.ilike("search_text", `%${sp.q.trim().toLowerCase()}%`);
  listQuery =
    view === "missing"
      ? listQuery.is("product_images", null)
      : listQuery.not("product_images", "is", null);

  const { data: products, count: listCount } = await listQuery;
  const totalPages = Math.max(1, Math.ceil((listCount ?? 0) / PAGE_SIZE));

  const qs = (patch: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const merged = { view, q: sp.q, page: undefined as string | undefined, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
    const s = params.toString();
    return s ? `?${s}` : "";
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="display text-2xl font-black">Product Images</h1>
        <p className="text-sm text-charcoal-light mt-1">
          Bulk upload with automatic SKU matching — the filename is the SKU.
          Public catalog and WhatsApp sharing use the primary image.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3 max-w-xl">
        {[
          ["Products", total],
          ["With image", withImages],
          ["Missing image", Math.max(0, total - withImages)],
        ].map(([label, value]) => (
          <div key={String(label)} className="bg-white border border-neutral-border rounded-lg p-4">
            <p className="text-[24px] font-bold leading-none tracking-tight">{Number(value).toLocaleString()}</p>
            <p className="text-[12.5px] text-[var(--ink-muted)] mt-1.5">{label}</p>
          </div>
        ))}
      </div>

      <BulkImageUploader />

      <div className="flex items-center gap-2 flex-wrap pt-2">
        <Link
          href={`/dashboard/products/images${qs({ view: "missing" })}`}
          className={`text-sm rounded px-3 py-1.5 border ${view === "missing" ? "bg-charcoal text-white border-charcoal" : "bg-white border-neutral-border"}`}
        >
          Missing image
        </Link>
        <Link
          href={`/dashboard/products/images${qs({ view: "with" })}`}
          className={`text-sm rounded px-3 py-1.5 border ${view === "with" ? "bg-charcoal text-white border-charcoal" : "bg-white border-neutral-border"}`}
        >
          With images
        </Link>
        <form action="/dashboard/products/images" className="flex gap-2 ml-auto">
          <input type="hidden" name="view" value={view} />
          <input
            type="search"
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder="Search SKU or name…"
            className="rounded border border-neutral-border bg-white px-3 py-1.5 text-sm"
          />
          <button className="text-sm bg-charcoal text-white rounded px-3 py-1.5">Search</button>
        </form>
      </div>

      {view === "missing" ? (
        <div className="border border-neutral-border rounded-lg overflow-hidden">
          <table className="data-table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Product</th>
                <th>Visibility</th>
              </tr>
            </thead>
            <tbody>
              {(products ?? []).length === 0 && (
                <tr>
                  <td colSpan={3} className="text-center text-charcoal-light py-6">
                    {sp.q ? "No matching products without images." : "Every product has an image 🎉"}
                  </td>
                </tr>
              )}
              {(products ?? []).map((p) => (
                <tr key={p.id}>
                  <td className="font-mono text-xs">{p.sku}</td>
                  <td>
                    <Link href={`/dashboard/products/${p.id}`} className="hover:text-tronic-red">
                      {p.name}
                    </Link>
                  </td>
                  <td className="text-xs capitalize">{p.visibility}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
          {(products ?? []).length === 0 && (
            <p className="col-span-full text-sm text-charcoal-light bg-white border border-neutral-border rounded-lg p-6 text-center">
              No products with images yet.
            </p>
          )}
          {(products ?? []).map((p) => {
            const images = (p.product_images ?? []) as {
              id: string;
              public_url: string;
              is_primary: boolean;
            }[];
            const primary = images.find((i) => i.is_primary) ?? images[0];
            return (
              <div key={p.id} className="bg-white border border-neutral-border rounded-lg overflow-hidden">
                <div className="aspect-square bg-neutral-bg flex items-center justify-center overflow-hidden">
                  {primary && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={primary.public_url}
                      alt={p.name}
                      className="w-full h-full object-contain"
                      loading="lazy"
                    />
                  )}
                </div>
                <div className="p-2">
                  <p className="font-mono text-[11px]">{p.sku}</p>
                  <p className="text-xs leading-snug line-clamp-1" title={p.name}>
                    {p.name}
                  </p>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[10px] text-charcoal-light">
                      {images.length} image(s)
                    </span>
                    {primary && (
                      <form action={deleteProductImage.bind(null, primary.id)}>
                        <button className="text-[11px] text-tronic-red hover:underline">
                          Delete
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center gap-2 text-sm">
          {page > 1 && (
            <Link
              href={`/dashboard/products/images${qs({ page: String(page - 1) })}`}
              className="border border-neutral-border bg-white rounded px-3 py-1.5"
            >
              ←
            </Link>
          )}
          <span className="text-charcoal-light">
            {page} / {totalPages} · {listCount ?? 0} products
          </span>
          {page < totalPages && (
            <Link
              href={`/dashboard/products/images${qs({ page: String(page + 1) })}`}
              className="border border-neutral-border bg-white rounded px-3 py-1.5"
            >
              →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
