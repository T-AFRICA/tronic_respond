import { createSupabaseAdminClient } from "@/lib/supabase/server";
import {
  refreshDeliveryStatus,
  createResendCampaign,
} from "@/app/dashboard/broadcasting/delivery-actions";

const LIST_CAP = 100;

type RecipientRow = {
  id: string;
  status: string;
  error: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  customers:
    | { full_name: string | null; whatsapp_phone: string | null }
    | { full_name: string | null; whatsapp_phone: string | null }[]
    | null;
};

function customerOf(r: RecipientRow) {
  return Array.isArray(r.customers) ? r.customers[0] : r.customers;
}

function RecipientTable({ rows, showError }: { rows: RecipientRow[]; showError?: boolean }) {
  if (rows.length === 0) {
    return <p className="text-xs text-charcoal-light px-3 py-2">None.</p>;
  }
  return (
    <div className="max-h-72 overflow-y-auto">
      <table className="data-table">
        <thead>
          <tr>
            <th>Customer</th>
            <th>WhatsApp</th>
            {showError ? <th>Reason</th> : <th>When</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const c = customerOf(r);
            return (
              <tr key={r.id}>
                <td>{c?.full_name || "—"}</td>
                <td className="font-mono text-xs">{c?.whatsapp_phone || "—"}</td>
                {showError ? (
                  <td className="text-xs text-tronic-red max-w-60">{r.error || "—"}</td>
                ) : (
                  <td className="text-xs text-charcoal-light">
                    {r.read_at
                      ? `read ${new Date(r.read_at).toLocaleString()}`
                      : r.delivered_at
                        ? `delivered ${new Date(r.delivered_at).toLocaleString()}`
                        : r.sent_at
                          ? `sent ${new Date(r.sent_at).toLocaleString()}`
                          : "—"}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Post-send delivery report: splits the campaign's recipients into
 * delivered / pending / not-delivered buckets so undelivered customers can
 * be re-targeted with a one-click follow-up ("resend") campaign.
 */
export async function DeliveryReport({
  campaignId,
  canWrite,
  canApprove,
  refreshed,
  changed,
  resendError,
}: {
  campaignId: string;
  canWrite: boolean;
  canApprove: boolean;
  refreshed?: string;
  changed?: string;
  resendError?: string;
}) {
  const admin = createSupabaseAdminClient();

  const select =
    "id, status, error, sent_at, delivered_at, read_at, customers(full_name, whatsapp_phone)";

  const [deliveredRes, pendingRes, failedRes, queuedRes, suppressedRes] =
    await Promise.all([
      admin
        .from("campaign_recipients")
        .select(select, { count: "exact" })
        .eq("campaign_id", campaignId)
        .in("status", ["delivered", "read"])
        .order("delivered_at", { ascending: false })
        .limit(LIST_CAP),
      admin
        .from("campaign_recipients")
        .select(select, { count: "exact" })
        .eq("campaign_id", campaignId)
        .eq("status", "sent")
        .order("sent_at", { ascending: false })
        .limit(LIST_CAP),
      admin
        .from("campaign_recipients")
        .select(select, { count: "exact" })
        .eq("campaign_id", campaignId)
        .eq("status", "failed")
        .eq("suppressed", false)
        .order("id")
        .limit(LIST_CAP),
      admin
        .from("campaign_recipients")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", campaignId)
        .eq("status", "queued")
        .eq("suppressed", false),
      admin
        .from("campaign_recipients")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", campaignId)
        .eq("suppressed", true),
    ]);

  const delivered = (deliveredRes.data ?? []) as RecipientRow[];
  const pending = (pendingRes.data ?? []) as RecipientRow[];
  const failed = (failedRes.data ?? []) as RecipientRow[];
  const deliveredCount = deliveredRes.count ?? 0;
  const pendingCount = pendingRes.count ?? 0;
  const failedCount = failedRes.count ?? 0;
  const queuedCount = queuedRes.count ?? 0;
  const suppressedCount = suppressedRes.count ?? 0;

  const anyActivity =
    deliveredCount + pendingCount + failedCount > 0;
  if (!anyActivity) return null;

  const chip = (label: string, value: number, cls: string) => (
    <span className={`text-xs border rounded-full px-2.5 py-0.5 ${cls}`}>
      {label}: <strong>{value.toLocaleString()}</strong>
    </span>
  );

  return (
    <div className="bg-white border border-neutral-border rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-xs uppercase tracking-wide text-charcoal-light font-semibold">
          Delivery report
        </h2>
        <div className="flex gap-2 flex-wrap">
          {chip("Delivered", deliveredCount, "bg-green-50 text-green-700 border-green-200")}
          {chip("Sent — awaiting delivery", pendingCount, "bg-blue-50 text-blue-700 border-blue-200")}
          {chip("Not delivered", failedCount, "bg-tronic-red-soft text-tronic-red border-tronic-red/30")}
          {queuedCount > 0 &&
            chip("Still queued", queuedCount, "bg-neutral-bg text-charcoal-light border-neutral-border")}
          {suppressedCount > 0 &&
            chip("Suppressed", suppressedCount, "bg-neutral-bg text-charcoal-light border-neutral-border")}
        </div>
      </div>

      {refreshed && (
        <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
          Checked {refreshed} message(s) with WhatsApp — {changed ?? 0} status
          update(s). Click again to continue if more are pending.
        </p>
      )}
      {resendError === "empty" && (
        <p className="text-sm text-tronic-red bg-tronic-red-soft border border-tronic-red/20 rounded px-3 py-2">
          No undelivered recipients to resend to.
        </p>
      )}
      {resendError === "create" && (
        <p className="text-sm text-tronic-red bg-tronic-red-soft border border-tronic-red/20 rounded px-3 py-2">
          Could not create the resend campaign.
        </p>
      )}

      <div className="flex gap-2 flex-wrap items-end">
        {canWrite && (
          <form action={refreshDeliveryStatus.bind(null, campaignId)}>
            <button className="text-sm border border-neutral-border bg-white rounded px-3 py-1.5 hover:border-charcoal-light">
              Refresh delivery status
            </button>
          </form>
        )}
        {canApprove && failedCount + pendingCount > 0 && (
          <form
            action={createResendCampaign.bind(null, campaignId)}
            className="flex gap-3 items-center border border-neutral-border rounded px-3 py-2"
          >
            <label className="flex items-center gap-2 text-xs text-charcoal-light">
              <input type="checkbox" name="include_pending" />
              include sent-but-unconfirmed too
            </label>
            <button className="text-sm bg-charcoal hover:bg-black text-white font-semibold rounded px-3 py-1.5">
              Create resend campaign ({failedCount.toLocaleString()} not delivered)
            </button>
          </form>
        )}
      </div>
      <p className="text-[11px] text-charcoal-light">
        “Refresh” polls WhatsApp for up to 150 messages per click. The resend
        campaign contains only this campaign&apos;s undelivered customers and is
        created pre-approved — run its live send from its own page. If you
        include sent-but-unconfirmed customers, tick “Allow resend” on that
        live send (they already have a sent record).
      </p>

      <div className="grid md:grid-cols-3 gap-3">
        <div className="border border-green-200 rounded overflow-hidden">
          <p className="text-xs font-semibold text-green-700 bg-green-50 px-3 py-2">
            ✓ Delivered / read ({deliveredCount.toLocaleString()}
            {deliveredCount > LIST_CAP ? `, first ${LIST_CAP} shown` : ""})
          </p>
          <RecipientTable rows={delivered} />
        </div>
        <div className="border border-blue-200 rounded overflow-hidden">
          <p className="text-xs font-semibold text-blue-700 bg-blue-50 px-3 py-2">
            ⏳ Sent — awaiting delivery ({pendingCount.toLocaleString()}
            {pendingCount > LIST_CAP ? `, first ${LIST_CAP} shown` : ""})
          </p>
          <RecipientTable rows={pending} />
        </div>
        <div className="border border-tronic-red/30 rounded overflow-hidden">
          <p className="text-xs font-semibold text-tronic-red bg-tronic-red-soft px-3 py-2">
            ✗ Not delivered ({failedCount.toLocaleString()}
            {failedCount > LIST_CAP ? `, first ${LIST_CAP} shown` : ""})
          </p>
          <RecipientTable rows={failed} showError />
        </div>
      </div>
    </div>
  );
}
