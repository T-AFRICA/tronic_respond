import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getLang, t } from "@/lib/catalog/i18n";
import {
  CatalogHeader,
  catalogQuery,
} from "@/components/catalog/CatalogHeader";
import { AddToCartButton } from "@/components/catalog/CartWidgets";

export const dynamic = "force-dynamic";

export default async function CatalogProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ sku: string }>;
  searchParams: Promise<{ lang?: string; t?: string; q?: string; category?: string; skus?: string }>;
}) {
  const { sku } = await params;
  const sp = await searchParams;
  const lang = getLang(sp.lang);
  const dict = t(lang);
  const token = sp.t;

  const supabase = await createSupabaseServerClient();
  const { data: product } = await supabase
    .from("products")
    .select(
      "id, sku, name, brand, model_number, description, currency, availability, unit_of_measure, product_images(public_url, is_primary, sort_order), product_specifications(spec_key, spec_value, unit, sort_order), categories(name)",
    )
    .eq("sku", decodeURIComponent(sku))
    .eq("visibility", "published")
    .single();

  if (!product) notFound();

  const { data: prices } = await supabase
    .from("product_prices")
    .select("amount, currency, effective_from")
    .eq("product_id", product.id)
    .eq("price_type", "retail")
    .order("effective_from", { ascending: false })
    .limit(1);

  const price = prices?.[0];
  const images = ((product.product_images ?? []) as {
    public_url: string;
    is_primary: boolean;
    sort_order: number;
  }[]).sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.sort_order - b.sort_order);
  const specs = ((product.product_specifications ?? []) as {
    spec_key: string;
    spec_value: string;
    unit: string;
    sort_order: number;
  }[]).sort((a, b) => a.sort_order - b.sort_order);
  const category = Array.isArray(product.categories)
    ? product.categories[0]
    : product.categories;

  const availabilityLabel =
    product.availability === "available"
      ? dict.available
      : product.availability === "on_request"
        ? dict.on_request
        : dict.discontinued;

  return (
    <>
      <CatalogHeader lang={lang} dict={dict} token={token} />

      <main className="max-w-5xl mx-auto px-4 py-4 space-y-4">
        <Link
          href={`/catalog${catalogQuery(lang, token, { q: sp.q, category: sp.category, skus: sp.skus })}`}
          className="text-sm text-tronic-red hover:underline"
        >
          ← {dict.back_to_catalog}
        </Link>

        <div className="grid md:grid-cols-2 gap-4">
          {/* Images */}
          <div className="bg-white border border-neutral-border rounded-lg p-4">
            <div className="aspect-square bg-neutral-bg rounded flex items-center justify-center overflow-hidden">
              {images[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={images[0].public_url}
                  alt={product.name}
                  className="w-full h-full object-contain"
                />
              ) : (
                <span className="display text-5xl font-black text-neutral-border">
                  T
                </span>
              )}
            </div>
            {images.length > 1 && (
              <div className="flex gap-2 mt-2 overflow-x-auto">
                {images.slice(1, 6).map((img, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={i}
                    src={img.public_url}
                    alt=""
                    className="w-16 h-16 object-contain bg-neutral-bg rounded border border-neutral-border"
                  />
                ))}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="bg-white border border-neutral-border rounded-lg p-5 space-y-3">
            <h1 className="text-xl font-bold leading-snug">{product.name}</h1>
            <dl className="text-sm space-y-1">
              <div className="flex gap-2">
                <dt className="text-charcoal-light w-28">{dict.sku}</dt>
                <dd className="font-mono">{product.sku}</dd>
              </div>
              {product.brand && (
                <div className="flex gap-2">
                  <dt className="text-charcoal-light w-28">{dict.brand}</dt>
                  <dd>{product.brand}</dd>
                </div>
              )}
              {product.model_number && (
                <div className="flex gap-2">
                  <dt className="text-charcoal-light w-28">{dict.model}</dt>
                  <dd>{product.model_number}</dd>
                </div>
              )}
              {category && (
                <div className="flex gap-2">
                  <dt className="text-charcoal-light w-28">
                    {dict.all_categories.replace("All ", "").replace("Aina zote", "Aina")}
                  </dt>
                  <dd>{category.name}</dd>
                </div>
              )}
              <div className="flex gap-2">
                <dt className="text-charcoal-light w-28">{dict.availability}</dt>
                <dd>{availabilityLabel}</dd>
              </div>
            </dl>

            {price && (
              <div>
                <p className="text-2xl font-bold text-tronic-red">
                  {Number(price.amount).toLocaleString()} {price.currency}
                </p>
                <p className="text-xs text-charcoal-light">{dict.price_note}</p>
              </div>
            )}

            <AddToCartButton
              sku={product.sku}
              name={product.name}
              price={price ? Number(price.amount) : null}
              currency={price?.currency ?? product.currency}
              imageUrl={images[0]?.public_url ?? null}
              label={dict.add_to_cart}
              addedLabel={dict.in_cart}
              withQty
              qtyLabel={dict.quantity}
            />

            {process.env.NEXT_PUBLIC_WHATSAPP_NUMBER && (
              <a
                href={`https://wa.me/${process.env.NEXT_PUBLIC_WHATSAPP_NUMBER}?text=${encodeURIComponent(`${product.name} (${product.sku})`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block text-sm border border-green-600 text-green-700 font-semibold rounded px-3 py-2 hover:bg-green-50"
              >
                {dict.talk_to_sales}
              </a>
            )}
          </div>
        </div>

        {product.description && (
          <section className="bg-white border border-neutral-border rounded-lg p-5">
            <h2 className="text-sm font-semibold text-charcoal-light uppercase tracking-wide mb-2">
              {dict.description}
            </h2>
            <p className="text-sm whitespace-pre-wrap">{product.description}</p>
          </section>
        )}

        {specs.length > 0 && (
          <section className="bg-white border border-neutral-border rounded-lg p-5">
            <h2 className="text-sm font-semibold text-charcoal-light uppercase tracking-wide mb-2">
              {dict.specifications}
            </h2>
            <table className="w-full text-sm">
              <tbody>
                {specs.map((s) => (
                  <tr key={s.spec_key} className="border-b border-neutral-border last:border-0">
                    <td className="py-1.5 text-charcoal-light w-1/2">{s.spec_key}</td>
                    <td className="py-1.5">
                      {s.spec_value}
                      {s.unit ? ` ${s.unit}` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </main>
    </>
  );
}
