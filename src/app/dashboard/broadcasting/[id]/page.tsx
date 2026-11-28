import { notFound } from "next/navigation";
import Link from "next/link";
import { requirePermission, hasPermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  submitCampaignForApproval,
  decideCampaign,
  setCampaignStatus,
} from "../actions";
import { ExecutionPanel } from "@/components/broadcasting/ExecutionPanel";
import { DeliveryReport } from "@/components/broadcasting/DeliveryReport";

export const metadata = { title: "Campaign" };
export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-neutral-bg text-charcoal-light border-neutral-border",
  pending_approval: "bg-amber-50 text-amber-700 border-amber-200",
  approved: "bg-green-50 text-green-700 border-green-200",
  scheduled: "bg-blue-50 text-blue-700 border-blue-200",
  running: "bg-blue-50 text-blue-700 border-blue-200",
  completed: "bg-green-50 text-green-700 border-green-200",
  cancelled: "bg-neutral-bg text-charcoal-light border-neutral-border",
  rejected: "bg-tronic-red-soft text-tronic-red border-tronic-red/30",
};

export default async function CampaignDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    requested?: string;
    error?: string;
    exec_error?: string;
    exec_started?: string;
    delivery_refreshed?: string;
    delivery_changed?: string;
    resend_error?: string;
    resent_from?: string;
  }>;
}) {
  const profile = await requirePermission("campaigns.read");
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createSupabaseServerClient();

  const [{ data: campaign }, { data: products }, recipientsRes, suppressedRes] =
    await Promise.all([
      supabase
        .from("campaigns")
        .select(
          "*, customer_segments(name), creator:profiles!campaigns_created_by_fkey(full_name), approver:profiles!campaigns_approved_by_fkey(full_name)",
        )
        .eq("id", id)
        .single(),
      supabase
        .from("campaign_products")
        .select("sort_order, products(sku, name)")
        .eq("campaign_id", id)
        .order("sort_order"),
      supabase
        .from("campaign_recipients")
        .select("*", { count: "exact", head: true })
        .eq("campaign_id", id)
        .eq("suppressed", false),
      supabase
        .from("campaign_recipients")
        .select("*", { count: "exact", head: true })
        .eq("campaign_id", id)
        .eq("suppressed", true),
    ]);

  if (!campaign) notFound();

  const canWrite = hasPermission(profile, "campaigns.write");
  const canApprove = hasPermission(profile, "campaigns.approve");
  const segment = Array.isArray(campaign.customer_segments)
    ? campaign.customer_segments[0]
    : campaign.customer_segments;
  const creator = Array.isArray(campaign.creator) ? campaign.creator[0] : campaign.creator;
  const approver = Array.isArray(campaign.approver) ? campaign.approver[0] : campaign.approver;
  const recipients = recipientsRes.count ?? 0;
  const suppressed = suppressedRes.count ?? 0;

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="display text-2xl font-black">{campaign.name}</h1>
            <span
              className={`text-xs border rounded-full px-3 py-1 capitalize ${STATUS_STYLE[campaign.status] ?? ""}`}
            >
              {campaign.status.replace(/_/g, " ")}
            </span>
          </div>
          <p className="text-sm text-charcoal-light mt-1 capitalize">
            {campaign.campaign_type.replace(/_/g, " ")} · by {creator?.full_name}
            {segment ? ` · segment: ${segment.name}` : " · all customers"}
            {campaign.scheduled_at &&
              ` · scheduled ${new Date(campaign.scheduled_at).toLocaleString()}`}
          </p>
        </div>

        <div className="flex gap-2 flex-wrap">
          {campaign.status === "draft" && canWrite && (
            <form action={submitCampaignForApproval.bind(null, id)}>
              <button className="text-sm bg-charcoal hover:bg-black text-white font-semibold rounded px-4 py-2">
                Submit for Approval
              </button>
            </form>
          )}
          {["approved", "scheduled"].includes(campaign.status) && canWrite && (
            <>
              <a
                href={`/dashboard/broadcasting/${id}/export`}
                className="text-sm border border-neutral-border bg-white rounded px-4 py-2 hover:border-charcoal-light"
              >
                Export Recipients CSV
              </a>
              <form action={setCampaignStatus.bind(null, id, "running")}>
                <button className="text-sm bg-tronic-red hover:bg-tronic-red-dark text-white font-semibold rounded px-4 py-2">
                  Mark Running
                </button>
              </form>
            </>
          )}
          {campaign.status === "running" && canWrite && (
            <form action={setCampaignStatus.bind(null, id, "completed")}>
              <button className="text-sm bg-green-700 hover:bg-green-800 text-white font-semibold rounded px-4 py-2">
                Mark Completed
              </button>
            </form>
          )}
          {!["completed", "cancelled", "rejected"].includes(campaign.status) &&
            canWrite && (
              <form action={setCampaignStatus.bind(null, id, "cancelled")}>
                <button className="text-sm border border-neutral-border bg-white text-charcoal-light rounded px-4 py-2 hover:text-tronic-red hover:border-tronic-red/40">
                  Cancel
                </button>
              </form>
            )}
        </div>
      </div>

      {sp.resent_from && (
        <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
          Resend campaign created with only the undelivered customers of the
          original campaign. It is pre-approved — start its live send below.
        </p>
      )}
      {sp.requested && (
        <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
          Submitted — managers have been notified for approval.
        </p>
      )}
      {sp.error === "state" && (
        <p className="text-sm text-tronic-red bg-tronic-red-soft border border-tronic-red/20 rounded px-3 py-2">
          That action is not allowed in the current status.
        </p>
      )}

      {campaign.status === "pending_approval" && canApprove && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <p className="text-sm font-medium text-amber-800 mb-2">
            Approval required. Approving materializes the recipient list with
            opt-out suppression.
          </p>
          <form action={decideCampaign.bind(null, id)} className="flex gap-2 flex-wrap">
            <input
              name="reason"
              placeholder="Comments / rejection reason (optional)"
              className="flex-1 min-w-60 rounded border border-amber-300 bg-white px-3 py-2 text-sm"
            />
            <button
              name="decision"
              value="approved"
              className="text-sm bg-green-700 hover:bg-green-800 text-white font-semibold rounded px-4 py-2"
            >
              Approve
            </button>
            <button
              name="decision"
              value="rejected"
              className="text-sm bg-tronic-red hover:bg-tronic-red-dark text-white font-semibold rounded px-4 py-2"
            >
              Reject
            </button>
          </form>
        </div>
      )}

      {campaign.status === "rejected" && campaign.rejected_reason && (
        <p className="text-sm bg-tronic-red-soft border border-tronic-red/20 text-tronic-red rounded px-3 py-2">
          Rejected: {campaign.rejected_reason}
        </p>
      )}

      <div className="grid md:grid-cols-3 gap-4">
        <div className="bg-white border border-neutral-border rounded-lg p-4">
          <h2 className="text-xs uppercase tracking-wide text-charcoal-light font-semibold mb-2">
            Message
          </h2>
          <p className="text-sm">
            <span className="text-charcoal-light">Template:</span>{" "}
            {campaign.template_name || "— (session message)"}
          </p>
          <p className="text-sm mt-2 whitespace-pre-wrap">
            {campaign.message_body || "—"}
          </p>
        </div>

        <div className="bg-white border border-neutral-border rounded-lg p-4">
          <h2 className="text-xs uppercase tracking-wide text-charcoal-light font-semibold mb-2">
            Recipients
          </h2>
          {campaign.status === "draft" || campaign.status === "pending_approval" ? (
            <p className="text-sm text-charcoal-light">
              Materialized on approval.
            </p>
          ) : (
            <dl className="text-sm space-y-1">
              <div className="flex justify-between">
                <dt className="text-charcoal-light">Eligible</dt>
                <dd className="font-semibold">{recipients.toLocaleString()}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-charcoal-light">Suppressed (opt-out/blocked)</dt>
                <dd>{suppressed.toLocaleString()}</dd>
              </div>
            </dl>
          )}
          {approver && (
            <p className="text-xs text-charcoal-light mt-3">
              Approved by {approver.full_name}
              {campaign.approved_at &&
                ` · ${new Date(campaign.approved_at).toLocaleString()}`}
            </p>
          )}
        </div>

        <div className="bg-white border border-neutral-border rounded-lg p-4">
          <h2 className="text-xs uppercase tracking-wide text-charcoal-light font-semibold mb-2">
            Execution paths
          </h2>
          <p className="text-sm text-charcoal-light">
            Either run the broadcast in Respond.io&apos;s native Broadcast module
            (export the recipient CSV, then mark Running/Completed here), or use
            the API execution panel below. Never both — the API engine refuses a
            second live run.
          </p>
        </div>
      </div>

      <ExecutionPanel
        campaignId={id}
        campaignStatus={campaign.status}
        templateName={campaign.template_name ?? ""}
        canWrite={canWrite}
        canApprove={canApprove}
        canManageSettings={hasPermission(profile, "settings.manage")}
        canManageIntegrations={hasPermission(profile, "integrations.manage")}
        execError={sp.exec_error}
        execStarted={sp.exec_started}
      />

      {!["draft", "pending_approval", "rejected"].includes(campaign.status) && (
        <DeliveryReport
          campaignId={id}
          canWrite={canWrite}
          canApprove={canApprove}
          refreshed={sp.delivery_refreshed}
          changed={sp.delivery_changed}
          resendError={sp.resend_error}
        />
      )}

      {(products ?? []).length > 0 && (
        <div className="border border-neutral-border rounded-lg overflow-hidden">
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>SKU</th>
                <th>Product</th>
              </tr>
            </thead>
            <tbody>
              {(products ?? []).map((cp, idx) => {
                const product = Array.isArray(cp.products) ? cp.products[0] : cp.products;
                return (
                  <tr key={idx}>
                    <td>{idx + 1}</td>
                    <td className="font-mono text-xs">{product?.sku}</td>
                    <td>{product?.name}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-charcoal-light">
        <Link href="/dashboard/broadcasting" className="text-tronic-red hover:underline">
          ← All campaigns
        </Link>
      </p>
    </div>
  );
}
