import { EmptyState } from "@/components/ui/EmptyState";
import { BadgePercent } from "lucide-react";
import Link from "next/link";
import { requirePermission, hasPermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { importPilotOffer, runOfferSweep } from "./actions";

export const metadata = { title: "Offers" };
export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-neutral-bg text-charcoal-light border-neutral-border",
  scheduled: "bg-blue-50 text-blue-700 border-blue-200",
  active: "bg-green-50 text-green-700 border-green-200",
  paused: "bg-amber-50 text-amber-700 border-amber-200",
  expired: "bg-neutral-bg text-charcoal-light border-neutral-border",
  cancelled: "bg-neutral-bg text-charcoal-light border-neutral-border",
};

export default async function OffersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const profile = await requirePermission("offers.read");
  const sp = await searchParams;
  const supabase = await createSupabaseServerClient();

  const [{ data: offers }, activeProductsRes, pilotRes] = await Promise.all([
    supabase
      .from("offers")
      .select(
        "id, name, pricing_mode, status, starts_at, ends_at, created_at, offer_products(count)",
      )
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("active_offer_products")
      .select("product_id", { count: "exact", head: true }),
    supabase
      .from("pilot_products")
      .select("id", { count: "exact", head: true }),
  ]);

  const canWrite = hasPermission(profile, "offers.write");
  const canActivate = hasPermission(profile, "offers.activate");
  const activeOffers = (offers ?? []).filter((o) => o.status === "active").length;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="display text-2xl font-black">Offers</h1>
          <p className="text-sm text-charcoal-light mt-1">
            Discounts and promotional prices. Only verified, active offers reach
            the customer catalog.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {canActivate && (
            <form action={runOfferSweep}>
              <button className="text-sm border border-neutral-border bg-white rounded px-4 py-2 hover:border-charcoal-light">
                Run expiry sweep
              </button>
            </form>
          )}
          {canWrite && (
            <form action={importPilotOffer}>
              <button className="text-sm border border-neutral-border bg-white rounded px-4 py-2 hover:border-charcoal-light">
                Import pilot products ({pilotRes.count ?? 0})
              </button>
            </form>
          )}
          {canWrite && (
            <Link
              href="/dashboard/offers/new"
              className="text-sm bg-tronic-red hover:bg-tronic-red-dark text-white font-semibold rounded px-4 py-2"
            >
              New Offer
            </Link>
          )}
        </div>
      </div>

      {sp.error && (
        <p className="text-sm text-tronic-red bg-tronic-red-soft border border-tronic-red/20 rounded px-3 py-2">
          {sp.error}
        </p>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          ["Total offers", (offers ?? []).length],
          ["Active offers", activeOffers],
          ["Products on offer now", activeProductsRes.count ?? 0],
          ["Pilot products", pilotRes.count ?? 0],
        ].map(([label, value]) => (
          <div key={String(label)} className="bg-white border border-neutral-border rounded-lg p-4">
            <p className="text-xs text-charcoal-light">{label}</p>
            <p className="display text-2xl font-black mt-1">{Number(value).toLocaleString()}</p>
          </div>
        ))}
      </div>

      <div className="border border-neutral-border rounded-lg overflow-hidden">
        <table className="data-table">
          <thead>
            <tr>
              <th>Offer</th>
              <th>Pricing</th>
              <th>Products</th>
              <th>Window</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {(offers ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="p-0"><EmptyState icon={BadgePercent} title="No offers yet" hint="Create an offer or import the pilot products to get started." actionHref="/dashboard/offers/new" actionLabel="New Offer" /></td>
              </tr>
            )}
            {(offers ?? []).map((o) => {
              const count = Array.isArray(o.offer_products)
                ? ((o.offer_products[0] as { count?: number } | undefined)?.count ?? 0)
                : 0;
              return (
                <tr key={o.id}>
                  <td>
                    <Link
                      href={`/dashboard/offers/${o.id}`}
                      className="font-medium hover:text-tronic-red"
                    >
                      {o.name}
                    </Link>
                  </td>
                  <td className="capitalize">{o.pricing_mode.replace(/_/g, " ")}</td>
                  <td>{count}</td>
                  <td className="text-xs text-charcoal-light">
                    {o.starts_at ? new Date(o.starts_at).toLocaleDateString() : "—"} →{" "}
                    {o.ends_at ? new Date(o.ends_at).toLocaleDateString() : "no end"}
                  </td>
                  <td>
                    <span
                      className={`text-xs border rounded-full px-2.5 py-0.5 capitalize ${STATUS_STYLE[o.status] ?? ""}`}
                    >
                      {o.status}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
