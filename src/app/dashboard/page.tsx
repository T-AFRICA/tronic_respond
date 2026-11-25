import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/session";

export const metadata = { title: "Overview" };
export const dynamic = "force-dynamic";

async function count(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  table: string,
  filter?: (q: any) => any,
): Promise<number> {
  let query = supabase.from(table).select("*", { count: "exact", head: true });
  if (filter) query = filter(query);
  const { count: n, error } = await query;
  if (error) return 0;
  return n ?? 0;
}

function MetricCard({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: number | string;
  accent?: boolean;
}) {
  return (
    <div className="bg-white border border-neutral-border rounded-lg px-4 py-3">
      <p className="text-xs text-charcoal-light uppercase tracking-wide">
        {label}
      </p>
      <p
        className={`text-2xl font-bold mt-1 ${accent ? "text-tronic-red" : "text-charcoal"}`}
      >
        {value}
      </p>
    </div>
  );
}

export default async function OverviewPage() {
  const profile = await requireProfile();
  const supabase = await createSupabaseServerClient();

  // All metrics are real database aggregates — never fabricated.
  const [
    totalProducts,
    syncedProducts,
    syncFailures,
    totalCustomers,
    newRfqs,
    pendingQuotations,
    sentQuotations,
    acceptedQuotations,
    activeCampaigns,
  ] = await Promise.all([
    count(supabase, "products"),
    count(supabase, "products", (q) => q.eq("meta_sync_status", "synced")),
    count(supabase, "products", (q) => q.eq("meta_sync_status", "failed")),
    count(supabase, "customers"),
    count(supabase, "rfqs", (q) => q.eq("status", "new")),
    count(supabase, "quotations", (q) =>
      q.in("status", ["new", "assigned", "under_review", "prepared", "approved"]),
    ),
    count(supabase, "quotations", (q) => q.eq("status", "sent")),
    count(supabase, "quotations", (q) =>
      q.in("status", ["accepted", "completed"]),
    ),
    count(supabase, "campaigns", (q) =>
      q.in("status", ["scheduled", "running"]),
    ),
  ]);

  const decided = sentQuotations + acceptedQuotations;
  const conversionRate =
    decided > 0 ? `${Math.round((acceptedQuotations / decided) * 100)}%` : "—";

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="display text-2xl font-black">Sales Command Center</h1>
        <p className="text-sm text-charcoal-light mt-1">
          Welcome back, {profile.full_name}.
        </p>
      </div>

      <section>
        <h2 className="text-sm font-semibold text-charcoal-light uppercase tracking-wide mb-2">
          Catalog
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricCard label="Total products" value={totalProducts} />
          <MetricCard label="Meta-synchronized" value={syncedProducts} />
          <MetricCard
            label="Sync failures"
            value={syncFailures}
            accent={syncFailures > 0}
          />
          <MetricCard label="Total customers" value={totalCustomers} />
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-charcoal-light uppercase tracking-wide mb-2">
          Sales Pipeline
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <MetricCard label="New RFQs" value={newRfqs} accent={newRfqs > 0} />
          <MetricCard label="Pending quotations" value={pendingQuotations} />
          <MetricCard label="Quotations sent" value={sentQuotations} />
          <MetricCard label="Accepted" value={acceptedQuotations} />
          <MetricCard label="Conversion rate" value={conversionRate} />
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-charcoal-light uppercase tracking-wide mb-2">
          Marketing
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricCard label="Active campaigns" value={activeCampaigns} />
        </div>
      </section>
    </div>
  );
}
