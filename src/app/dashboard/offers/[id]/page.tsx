import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission, hasPermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { OfferPriceImport } from "@/components/offers/OfferPriceImport";
import {
  activateOffer,
  pauseOffer,
  cancelOffer,
  verifyAllOfferPrices,
} from "../actions";

export const metadata = { title: "Offer" };
export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-neutral-bg text-charcoal-light border-neutral-border",
  scheduled: "bg-blue-50 text-blue-700 border-blue-200",
  active: "bg-green-50 text-green-700 border-green-200",
  paused: "bg-amber-50 text-amber-700 border-amber-200",
  expired: "bg-neutral-bg text-charcoal-light border-neutral-border",
  cancelled: "bg-neutral-bg text-charcoal-light border-neutral-border",
};

const ERRORS: Record<string, string> = {
  state: "That action is not allowed in the current status.",
  unverified:
    "All offer prices must be verified before activation — pilot prices are assumptions until checked.",
  no_products: "The offer has no products.",
  overlap:
    "Some products are already in another active or scheduled offer — overlapping offers would produce wrong prices.",
  expired_window: "The end date is in the past — adjust the schedule first.",
};

const PAGE_SIZE = 50;

export default async function OfferDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    error?: string;
    activated?: string;
    created?: string;
    imported?: string;
    page?: string;
  }>;
}) {
  const profile = await requirePermission("offers.read");
  const { id } = await params;
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? "1") || 1);
  const from = (page - 1) * PAGE_SIZE;
  const supabase = await createSupabaseServerClient();

  const [{ data: offer }, { data: items, count }, unverifiedRes] =
    await Promise.all([
      supabase
        .from("offers")
        .select(
          "*, creator:profiles!offers_created_by_fkey(full_name), activator:profiles!offers_activated_by_fkey(full_name)",
        )
        .eq("id", id)
        .single(),
      supabase
        .from("offer_products")
        .select(
          "id, offer_price, currency, price_verified, products(sku, name, visibility)",
          { count: "exact" },
        )
        .eq("offer_id", id)
        .order("created_at")
        .range(from, from + PAGE_SIZE - 1),
      supabase
        .from("offer_products")
        .select("id", { count: "exact", head: true })
        .eq("offer_id", id)
        .eq("price_verified", false),
    ]);

  if (!offer) notFound();

  const canWrite = hasPermission(profile, "offers.write");
  const canActivate = hasPermission(profile, "offers.activate");
  const unverified = unverifiedRes.count ?? 0;
  const creator = Array.isArray(offer.creator) ? offer.creator[0] : offer.creator;
  const activator = Array.isArray(offer.activator) ? offer.activator[0] : offer.activator;
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const editable = ["draft", "scheduled", "paused"].includes(offer.status);

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="display text-2xl font-black">{offer.name}</h1>
            <span
              className={`text-xs border rounded-full px-3 py-1 capitalize ${STATUS_STYLE[offer.status] ?? ""}`}
            >
              {offer.status}
            </span>
          </div>
          <p className="text-sm text-charcoal-light mt-1">
            {String(offer.pricing_mode).replace(/_/g, " ")} · by {creator?.full_name}
            {offer.starts_at && ` · starts ${new Date(offer.starts_at).toLocaleString()}`}
            {offer.ends_at && ` · ends ${new Date(offer.ends_at).toLocaleString()}`}
          </p>
          {offer.description && (
            <p className="text-sm text-charcoal-light mt-1 max-w-2xl">{offer.description}</p>
          )}
        </div>

        <div className="flex gap-2 flex-wrap">
          {editable && canActivate && unverified > 0 && (
            <form action={verifyAllOfferPrices.bind(null, id)}>
              <button className="text-sm bg-charcoal hover:bg-black text-white font-semibold rounded px-4 py-2">
                Verify all prices ({unverified})
              </button>
            </form>
          )}
          {editable && canActivate && (
            <form action={activateOffer.bind(null, id)}>
              <button className="text-sm bg-tronic-red hover:bg-tronic-red-dark text-white font-semibold rounded px-4 py-2">
                {offer.starts_at && new Date(offer.starts_at) > new Date()
                  ? "Schedule"
                  : "Activate"}
              </button>
            </form>
          )}
          {["active", "scheduled"].includes(offer.status) && canActivate && (
            <form action={pauseOffer.bind(null, id)}>
              <button className="text-sm border border-neutral-border bg-white rounded px-4 py-2 hover:border-charcoal-light">
                Pause
              </button>
            </form>
          )}
          {!["expired", "cancelled"].includes(offer.status) && canActivate && (
            <form action={cancelOffer.bind(null, id)}>
              <button className="text-sm border border-neutral-border bg-white text-charcoal-light rounded px-4 py-2 hover:text-tronic-red hover:border-tronic-red/40">
                Cancel offer
              </button>
            </form>
          )}
        </div>
      </div>

      {sp.created && (
        <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
          Draft offer created. Review the prices below, verify them, then activate.
        </p>
      )}
      {sp.imported && (
        <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
          Pilot products imported as a draft offer. The imported RE price is used
          as the offer price unchanged (it is already the final discounted
          price) — verify before activating.
        </p>
      )}
      {sp.activated && (
        <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
          Offer is live. Active, verified products now appear in the customer
          offers catalog (/catalog/offers).
        </p>
      )}
      {sp.error && (
        <p className="text-sm text-tronic-red bg-tronic-red-soft border border-tronic-red/20 rounded px-3 py-2">
          {ERRORS[sp.error] ?? sp.error}
        </p>
      )}

      {unverified > 0 && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2">
          {unverified} price(s) are not yet verified. Unverified prices never
          reach customers, and the offer cannot be activated until a manager
          verifies them.
        </p>
      )}

      {editable && canWrite && (
        <div className="bg-white border border-neutral-border rounded-lg p-4">
          <OfferPriceImport offerId={id} />
        </div>
      )}

      <div className="border border-neutral-border rounded-lg overflow-hidden">
        <table className="data-table">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Product</th>
              <th>Offer price</th>
              <th>Verified</th>
            </tr>
          </thead>
          <tbody>
            {(items ?? []).map((row) => {
              const product = Array.isArray(row.products) ? row.products[0] : row.products;
              const priceNum = Number(row.offer_price);
              return (
                <tr key={row.id}>
                  <td className="font-mono text-xs">{product?.sku}</td>
                  <td>
                    {product?.name}
                    {product?.visibility !== "published" && (
                      <span className="ml-2 text-[10px] uppercase text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                        not published
                      </span>
                    )}
                  </td>
                  <td className="font-semibold text-tronic-red">
                    {priceNum.toLocaleString()} {row.currency}
                  </td>
                  <td>
                    {row.price_verified ? (
                      <span className="text-xs text-green-700">✓ verified</span>
                    ) : (
                      <span className="text-xs text-amber-700">pending</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center gap-2 text-sm">
          {page > 1 && (
            <Link
              href={`/dashboard/offers/${id}?page=${page - 1}`}
              className="border border-neutral-border bg-white rounded px-3 py-1.5"
            >
              ←
            </Link>
          )}
          <span className="text-charcoal-light">
            {page} / {totalPages} · {count ?? 0} products
          </span>
          {page < totalPages && (
            <Link
              href={`/dashboard/offers/${id}?page=${page + 1}`}
              className="border border-neutral-border bg-white rounded px-3 py-1.5"
            >
              →
            </Link>
          )}
        </div>
      )}

      <p className="text-xs text-charcoal-light">
        {activator && (
          <>Activated by {activator.full_name}
          {offer.activated_at && ` · ${new Date(offer.activated_at).toLocaleString()}`} · </>
        )}
        <Link href="/dashboard/offers" className="text-tronic-red hover:underline">
          ← All offers
        </Link>
      </p>
    </div>
  );
}
