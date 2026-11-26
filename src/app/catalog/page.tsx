import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getLang, t } from "@/lib/catalog/i18n";
import {
  CatalogHeader,
  catalogQuery,
} from "@/components/catalog/CatalogHeader";
import { AddToCartButton } from "@/components/catalog/CartWidgets";
import { ProductSearchBox } from "@/components/search/ProductSearchBox";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 24;

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    category?: string;
    skus?: string;
    page?: string;
    lang?: string;
    t?: string;
  }>;
}) {
  const sp = await searchParams;
  const lang = getLang(sp.lang);
  const dict = t(lang);
  const token = sp.t;
  const page = Math.max(1, Number(sp.page ?? "1") || 1);
  const from = (page - 1) * PAGE_SIZE;

  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from("products")
    .select(
      "id, sku, name, brand, model_number, currency, availability, product_images(public_url, is_primary)",
      { count: "exact" },
    )
    .eq("visibility", "published")
    .order("name")
    .range(from, from + PAGE_SIZE - 1);

  if (sp.q) query = query.ilike("search_text", `%${sp.q.trim().toLowerCase()}%`);
  if (sp.category) query = query.eq("category_id", sp.category);
  if (sp.skus) {
    const skuList = sp.skus.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 50);
    if (skuList.length > 0) query = query.in("sku", skuList);
  }

  const [{ data: products, count }, { data: categories }] = await Promise.all([
    query,
    supabase
      .from("categories")
      .select("id, name")
      .eq("is_active", true)
      .order("name"),
  ]);

  const ids = (products ?? []).map((p) => p.id);
  const { data: prices } = ids.length
    ? await supabase
        .from("product_prices")
        .select("product_id, amount, currency, effective_from")
        .eq("price_type", "retail")
        .in("product_id", ids)
        .order("effective_from", { ascending: false })
    : { data: [] };

  const priceOf = (id: string) => prices?.find((p) => p.product_id === id);
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const baseExtra = { q: sp.q, category: sp.category, skus: sp.skus };

  return (
    <>
      <CatalogHeader lang={lang} dict={dict} token={token} />

      <main className="max-w-5xl mx-auto px-4 py-4 space-y-4">
        {/* Search + filters */}
        <form action="/catalog" className="flex gap-2 flex-wrap">
          {lang === "sw" && <input type="hidden" name="lang" value="sw" />}
          {token && <input type="hidden" name="t" value={token} />}
          {sp.skus && <input type="hidden" name="skus" value={sp.skus} />}
          <ProductSearchBox
            scope="catalog"
            defaultValue={sp.q ?? ""}
            placeholder={dict.search_placeholder}
            className="flex-1 min-w-48"
            inputClassName="w-full rounded border border-neutral-border bg-white pl-8 pr-8 py-2.5 text-sm"
            linkParams={{ lang: lang === "sw" ? "sw" : undefined, t: token }}
          />
          <select
            name="category"
            defaultValue={sp.category ?? ""}
            className="rounded border border-neutral-border bg-white px-3 py-2.5 text-sm"
          >
            <option value="">{dict.all_categories}</option>
            {(categories ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button className="bg-charcoal text-white text-sm font-semibold rounded px-4 py-2.5">
            {dict.filter}
          </button>
        </form>

        <p className="text-xs text-charcoal-light">
          {(count ?? 0).toLocaleString()} {dict.products}
          {sp.skus && (
            <>
              {" · "}
              <Link
                href={`/catalog${catalogQuery(lang, token)}`}
                className="text-tronic-red hover:underline"
              >
                {dict.browse_catalog} →
              </Link>
            </>
          )}
        </p>

        {/* Product grid */}
        {(products ?? []).length === 0 ? (
          <p className="text-sm text-charcoal-light bg-white border border-neutral-border rounded-lg p-6 text-center">
            {dict.no_products}
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {(products ?? []).map((p) => {
              const images = (p.product_images ?? []) as {
                public_url: string;
                is_primary: boolean;
              }[];
              const image =
                images.find((i) => i.is_primary)?.public_url ??
                images[0]?.public_url ??
                null;
              const price = priceOf(p.id);
              return (
                <div
                  key={p.id}
                  className="bg-white border border-neutral-border rounded-lg overflow-hidden flex flex-col"
                >
                  <Link
                    href={`/catalog/p/${encodeURIComponent(p.sku)}${catalogQuery(lang, token, baseExtra)}`}
                    className="block"
                  >
                    <div className="aspect-square bg-neutral-bg flex items-center justify-center overflow-hidden">
                      {image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={image}
                          alt={p.name}
                          className="w-full h-full object-contain"
                          loading="lazy"
                        />
                      ) : (
                        <span className="display text-2xl font-black text-neutral-border">
                          T
                        </span>
                      )}
                    </div>
                  </Link>
                  <div className="p-2.5 flex flex-col gap-1 flex-1">
                    <Link
                      href={`/catalog/p/${encodeURIComponent(p.sku)}${catalogQuery(lang, token, baseExtra)}`}
                      className="text-sm font-medium leading-snug line-clamp-2 hover:text-tronic-red"
                    >
                      {p.name}
                    </Link>
                    <p className="text-[11px] text-charcoal-light font-mono">
                      {p.sku}
                    </p>
                    {price && (
                      <p className="text-sm font-bold text-tronic-red">
                        {Number(price.amount).toLocaleString()} {price.currency}
                      </p>
                    )}
                    <div className="mt-auto pt-1">
                      <AddToCartButton
                        sku={p.sku}
                        name={p.name}
                        price={price ? Number(price.amount) : null}
                        currency={price?.currency ?? p.currency}
                        imageUrl={image}
                        label={dict.add_to_cart}
                        addedLabel={dict.in_cart}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 text-sm py-2">
            {page > 1 && (
              <Link
                href={`/catalog${catalogQuery(lang, token, { ...baseExtra, page: String(page - 1) })}`}
                className="border border-neutral-border bg-white rounded px-3 py-1.5"
              >
                ←
              </Link>
            )}
            <span className="text-charcoal-light">
              {page} / {totalPages}
            </span>
            {page < totalPages && (
              <Link
                href={`/catalog${catalogQuery(lang, token, { ...baseExtra, page: String(page + 1) })}`}
                className="border border-neutral-border bg-white rounded px-3 py-1.5"
              >
                →
              </Link>
            )}
          </div>
        )}

        <p className="text-[11px] text-charcoal-light text-center pb-4">
          {dict.price_note}.
        </p>
      </main>
    </>
  );
}
