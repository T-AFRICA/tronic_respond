import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Live product search (typeahead).
 *  scope=admin   — staff dashboard: all products the signed-in user may read
 *                  (RLS enforced by the session client).
 *  scope=catalog — public catalog: published products only.
 */
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().toLowerCase();
  const scope =
    req.nextUrl.searchParams.get("scope") === "catalog" ? "catalog" : "admin";
  if (!q) return NextResponse.json({ items: [] });

  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from("products")
    .select(
      "id, sku, name, brand, visibility, availability, product_images(public_url, is_primary), categories(name)",
    )
    .ilike("search_text", `%${q}%`)
    .order("name")
    .limit(8);
  if (scope === "catalog") query = query.eq("visibility", "published");

  const { data: products } = await query;
  const ids = (products ?? []).map((p) => p.id);

  const [{ data: prices }, { data: offers }] = ids.length
    ? await Promise.all([
        supabase
          .from("product_prices")
          .select("product_id, amount, currency, effective_from")
          .eq("price_type", "retail")
          .in("product_id", ids)
          .order("effective_from", { ascending: false }),
        supabase
          .from("active_offer_products")
          .select("product_id, offer_price, discount_percent")
          .in("product_id", ids),
      ])
    : [{ data: [] }, { data: [] }];

  const items = (products ?? []).map((p) => {
    const imgs = (p.product_images ?? []) as {
      public_url: string;
      is_primary: boolean;
    }[];
    const price = (prices ?? []).find((x) => x.product_id === p.id);
    const offer = (offers ?? []).find((x) => x.product_id === p.id);
    const cat = p.categories as { name?: string } | { name?: string }[] | null;
    return {
      id: p.id,
      sku: p.sku,
      name: p.name,
      brand: p.brand,
      visibility: p.visibility,
      availability: p.availability,
      category: Array.isArray(cat) ? (cat[0]?.name ?? null) : (cat?.name ?? null),
      image:
        imgs.find((i) => i.is_primary)?.public_url ??
        imgs[0]?.public_url ??
        null,
      price: price ? { amount: price.amount, currency: price.currency } : null,
      offer: offer
        ? { price: offer.offer_price, discount: offer.discount_percent }
        : null,
    };
  });

  return NextResponse.json({ items });
}
