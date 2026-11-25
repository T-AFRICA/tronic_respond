import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getLang, t } from "@/lib/catalog/i18n";
import { CatalogHeader, catalogQuery } from "@/components/catalog/CatalogHeader";
import { AddToCartButton } from "@/components/catalog/CartWidgets";

export const metadata = { title: "TRONIC Special Offers" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 24;

/**
 * Public, mobile-first catalog of ACTIVE offers only.
 * Shows exclusively published products whose offer price has been verified —
 * unverified pilot pricing never reaches customers.
 */
export default async function OffersCatalogPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    category?: string;
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
    .from("active_offer_products")
    .select(
      "product_id, sku, product_name, category_id, ends_at, offer_price, reference_price, currency, discount_percent",
      { count: "exact" },
    )
    .eq("price_verified", true)
    .eq("visibility", "published")
    .order("product_name")
    .range(from, from + PAGE_SIZE - 1);

  if (sp.q) query = query.ilike("search_text", `%${sp.q.trim().toLowerCase()}%`);
  if (sp.category) query = query.eq("category_id", sp.category);

  const [{ data: rows, count }, { data: categories }] = await Promise.all([
    query,
    supabase.from("categories").select("id, name").eq("is_active", true).order("name"),
  ]);

  const ids = (rows ?? []).map((r) => r.product_id);
  const { data: images } = ids.length
    ? await supabase
        .from("product_images")
        .select("product_id, public_url, is_primary")
        .in("product_id", ids)
    : { data: [] };

  const imageOf = (id: string) => {
    const list = (images ?? []).filter((i) => i.product_id === id);
    return list.find((i) => i.is_primary)?.public_url ?? list[0]?.public_url ?? null;
  };

  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const baseExtra = { q: sp.q, category: sp.category };

  return (
    <>
      <CatalogHeader lang={lang} dict={dict} token={token} />

      <main className="max-w-5xl mx-auto px-4 py-4 space-y-4">
        <div className="bg-tronic-red text-white rounded-lg px-4 py-3 flex items-center justify-between gap-3">
          <h1 className="display font-black text-lg">{dict.offers_title}</h1>
          <Link
            href={`/catalog${catalogQuery(lang, token)}`}
            className="text-xs underline underline-offset-2 shrink-0"
          >
            {dict.browse_catalog} →
          </Link>
        </div>

        <form action="/catalog/offers" className="flex gap-2 flex-wrap">
          {lang === "sw" && <input type="hidden" name="lang" value="sw" />}
          {token && <input type="hidden" name="t" value={token} />}
          <input
            type="search"
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder={dict.search_placeholder}
            className="flex-1 min-w-48 rounded border border-neutral-border bg-white px-3 py-2.5 text-sm"
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
        </p>

        {(rows ?? []).length === 0 ? (
          <p className="text-sm text-charcoal-light bg-white border border-neutral-border rounded-lg p-6 text-center">
            {dict.no_offers}
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {(rows ?? []).map((r) => {
              const image = imageOf(r.product_id);
              const offerPrice = Number(r.offer_price);
              const ref = r.reference_price !== null ? Number(r.reference_price) : null;
              const disc = r.discount_percent !== null ? Number(r.discount_percent) : null;
              return (
                <div
                  key={r.product_id}
                  className="bg-white border border-neutral-border rounded-lg overflow-hidden flex flex-col relative"
                >
                  {disc !== null && disc > 0 && (
                    <span className="absolute top-2 left-2 z-10 bg-tronic-red text-white text-[11px] font-bold rounded px-1.5 py-0.5">
                      -{disc}%
                    </span>
                  )}
                  <Link
                    href={`/catalog/p/${encodeURIComponent(r.sku)}${catalogQuery(lang, token, baseExtra)}`}
                    className="block"
                  >
                    <div className="aspect-square bg-neutral-bg flex items-center justify-center overflow-hidden">
                      {image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={image}
                          alt={r.product_name}
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
                      href={`/catalog/p/${encodeURIComponent(r.sku)}${catalogQuery(lang, token, baseExtra)}`}
                      className="text-sm font-medium leading-snug line-clamp-2 hover:text-tronic-red"
                    >
                      {r.product_name}
                    </Link>
                    <p className="text-[11px] text-charcoal-light font-mono">{r.sku}</p>
                    <p className="text-sm font-bold text-tronic-red">
                      {offerPrice.toLocaleString()} {r.currency}
                    </p>
                    {ref !== null && ref > offerPrice && (
                      <p className="text-xs text-charcoal-light">
                        <s>{ref.toLocaleString()}</s>{" "}
                        <span className="text-green-700">
                          {dict.you_save} {(ref - offerPrice).toLocaleString()}
                        </span>
                      </p>
                    )}
                    {r.ends_at && (
                      <p className="text-[11px] text-charcoal-light">
                        {dict.offer_valid_until}{" "}
                        {new Date(r.ends_at).toLocaleDateString()}
                      </p>
                    )}
                    <div className="mt-auto pt-1">
                      <AddToCartButton
                        sku={r.sku}
                        name={r.product_name}
                        price={offerPrice}
                        currency={r.currency}
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

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 text-sm py-2">
            {page > 1 && (
              <Link
                href={`/catalog/offers${catalogQuery(lang, token, { ...baseExtra, page: String(page - 1) })}`}
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
                href={`/catalog/offers${catalogQuery(lang, token, { ...baseExtra, page: String(page + 1) })}`}
                className="border border-neutral-border bg-white rounded px-3 py-1.5"
              >
                →
              </Link>
            )}
          </div>
        )}

        <p className="text-[11px] text-charcoal-light text-center pb-4">
          {dict.offer_price_note}.
        </p>
      </main>
    </>
  );
}
