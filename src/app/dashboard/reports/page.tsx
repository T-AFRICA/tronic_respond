import { requirePermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

function hoursBetween(a: string, b: string): number {
  return (new Date(b).getTime() - new Date(a).getTime()) / 3_600_000;
}

function fmtHours(h: number): string {
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < 48) return `${h.toFixed(1)} h`;
  return `${(h / 24).toFixed(1)} d`;
}

export default async function ReportsPage() {
  await requirePermission("reports.read");
  const supabase = await createSupabaseServerClient();

  const [
    { data: rfqItems },
    { data: quotations },
    { data: rfqs },
    { data: staff },
    { data: campaigns },
    { data: recipients },
  ] = await Promise.all([
    supabase.from("rfq_items").select("sku, product_name, quantity").limit(5000),
    supabase
      .from("quotations")
      .select("id, status, rfq_id, prepared_by, sent_at, created_at, grand_total, currency")
      .limit(5000),
    supabase
      .from("rfqs")
      .select("id, status, assigned_staff_id, submitted_at")
      .limit(5000),
    supabase
      .from("profiles")
      .select("id, full_name, is_active, roles(key)")
      .eq("is_active", true),
    supabase
      .from("campaigns")
      .select("id, name, status, campaign_type, started_at, finished_at")
      .order("created_at", { ascending: false })
      .limit(25),
    supabase
      .from("campaign_recipients")
      .select("campaign_id, suppressed")
      .limit(50000),
  ]);

  // ---------- Response time: RFQ submitted → quotation sent ----------
  const rfqById = new Map((rfqs ?? []).map((r) => [r.id, r]));
  const responseTimes = (quotations ?? [])
    .filter((q) => q.sent_at && q.rfq_id)
    .map((q) => {
      const rfq = rfqById.get(q.rfq_id!);
      return rfq ? hoursBetween(rfq.submitted_at, q.sent_at!) : null;
    })
    .filter((h): h is number => h !== null && h >= 0);
  const avgResponse =
    responseTimes.length > 0
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      : null;
  const medianResponse =
    responseTimes.length > 0
      ? [...responseTimes].sort((a, b) => a - b)[Math.floor(responseTimes.length / 2)]
      : null;

  // ---------- Conversion ----------
  const sentCount = (quotations ?? []).filter((q) =>
    ["sent", "accepted", "rejected", "revision_requested", "completed", "expired"].includes(q.status),
  ).length;
  const acceptedCount = (quotations ?? []).filter((q) =>
    ["accepted", "completed"].includes(q.status),
  ).length;

  // ---------- Staff performance ----------
  const staffRows = (staff ?? [])
    .map((s) => {
      const assigned = (rfqs ?? []).filter((r) => r.assigned_staff_id === s.id).length;
      const prepared = (quotations ?? []).filter((q) => q.prepared_by === s.id).length;
      const sent = (quotations ?? []).filter(
        (q) =>
          q.prepared_by === s.id &&
          ["sent", "accepted", "rejected", "revision_requested", "completed"].includes(q.status),
      ).length;
      const accepted = (quotations ?? []).filter(
        (q) => q.prepared_by === s.id && ["accepted", "completed"].includes(q.status),
      ).length;
      return { name: s.full_name, assigned, prepared, sent, accepted };
    })
    .filter((row) => row.assigned + row.prepared > 0)
    .sort((a, b) => b.accepted - a.accepted || b.sent - a.sent);

  // ---------- Most requested products ----------
  const bySku = new Map<string, { name: string; requests: number; qty: number }>();
  for (const item of rfqItems ?? []) {
    const entry = bySku.get(item.sku) ?? { name: item.product_name, requests: 0, qty: 0 };
    entry.requests += 1;
    entry.qty += Number(item.quantity);
    bySku.set(item.sku, entry);
  }
  const topProducts = [...bySku.entries()]
    .sort((a, b) => b[1].requests - a[1].requests)
    .slice(0, 15);

  // ---------- Campaign analytics ----------
  const recipientStats = new Map<string, { eligible: number; suppressed: number }>();
  for (const r of recipients ?? []) {
    const entry = recipientStats.get(r.campaign_id) ?? { eligible: 0, suppressed: 0 };
    if (r.suppressed) entry.suppressed += 1;
    else entry.eligible += 1;
    recipientStats.set(r.campaign_id, entry);
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="display text-2xl font-black">Reports</h1>
        <p className="text-sm text-charcoal-light mt-1">
          All figures are computed live from database records — never
          fabricated. Based on the most recent {Math.min(5000, (rfqs ?? []).length)} RFQs
          and {Math.min(5000, (quotations ?? []).length)} quotations.
        </p>
      </div>

      {/* Headline metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white border border-neutral-border rounded-lg px-4 py-3">
          <p className="text-xs text-charcoal-light uppercase">Avg response time</p>
          <p className="text-2xl font-bold mt-1">
            {avgResponse !== null ? fmtHours(avgResponse) : "—"}
          </p>
          <p className="text-[11px] text-charcoal-light">RFQ submitted → quotation sent</p>
        </div>
        <div className="bg-white border border-neutral-border rounded-lg px-4 py-3">
          <p className="text-xs text-charcoal-light uppercase">Median response time</p>
          <p className="text-2xl font-bold mt-1">
            {medianResponse !== null ? fmtHours(medianResponse) : "—"}
          </p>
          <p className="text-[11px] text-charcoal-light">{responseTimes.length} measured</p>
        </div>
        <div className="bg-white border border-neutral-border rounded-lg px-4 py-3">
          <p className="text-xs text-charcoal-light uppercase">Quotations sent</p>
          <p className="text-2xl font-bold mt-1">{sentCount}</p>
        </div>
        <div className="bg-white border border-neutral-border rounded-lg px-4 py-3">
          <p className="text-xs text-charcoal-light uppercase">Conversion rate</p>
          <p className="text-2xl font-bold mt-1 text-tronic-red">
            {sentCount > 0 ? `${Math.round((acceptedCount / sentCount) * 100)}%` : "—"}
          </p>
          <p className="text-[11px] text-charcoal-light">{acceptedCount} accepted</p>
        </div>
      </div>

      {/* Staff performance */}
      <section>
        <h2 className="text-sm font-semibold text-charcoal-light uppercase tracking-wide mb-2">
          Staff performance
        </h2>
        <div className="border border-neutral-border rounded-lg overflow-hidden">
          <table className="data-table">
            <thead>
              <tr>
                <th>Staff</th>
                <th>RFQs assigned</th>
                <th>Quotations prepared</th>
                <th>Sent</th>
                <th>Accepted</th>
                <th>Acceptance rate</th>
              </tr>
            </thead>
            <tbody>
              {staffRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-charcoal-light py-6">
                    No activity recorded yet.
                  </td>
                </tr>
              )}
              {staffRows.map((row) => (
                <tr key={row.name}>
                  <td className="font-medium">{row.name}</td>
                  <td>{row.assigned}</td>
                  <td>{row.prepared}</td>
                  <td>{row.sent}</td>
                  <td>{row.accepted}</td>
                  <td>
                    {row.sent > 0
                      ? `${Math.round((row.accepted / row.sent) * 100)}%`
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Most requested products */}
        <section>
          <h2 className="text-sm font-semibold text-charcoal-light uppercase tracking-wide mb-2">
            Most requested products
          </h2>
          <div className="border border-neutral-border rounded-lg overflow-hidden">
            <table className="data-table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Product</th>
                  <th>Requests</th>
                  <th>Total qty</th>
                </tr>
              </thead>
              <tbody>
                {topProducts.length === 0 && (
                  <tr>
                    <td colSpan={4} className="text-center text-charcoal-light py-6">
                      No request data yet.
                    </td>
                  </tr>
                )}
                {topProducts.map(([sku, data]) => (
                  <tr key={sku}>
                    <td className="font-mono text-xs">{sku}</td>
                    <td>{data.name}</td>
                    <td>{data.requests}</td>
                    <td>{data.qty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Campaign analytics */}
        <section>
          <h2 className="text-sm font-semibold text-charcoal-light uppercase tracking-wide mb-2">
            Campaigns
          </h2>
          <div className="border border-neutral-border rounded-lg overflow-hidden">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Campaign</th>
                  <th>Status</th>
                  <th>Eligible</th>
                  <th>Suppressed</th>
                </tr>
              </thead>
              <tbody>
                {(campaigns ?? []).length === 0 && (
                  <tr>
                    <td colSpan={4} className="text-center text-charcoal-light py-6">
                      No campaigns yet.
                    </td>
                  </tr>
                )}
                {(campaigns ?? []).map((c) => {
                  const stats = recipientStats.get(c.id);
                  return (
                    <tr key={c.id}>
                      <td className="font-medium">{c.name}</td>
                      <td className="capitalize text-xs">
                        {c.status.replace(/_/g, " ")}
                      </td>
                      <td>{stats?.eligible ?? "—"}</td>
                      <td>{stats?.suppressed ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
