import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isLiveBroadcastingEnabled } from "@/lib/config";
import { AutoRefresh } from "@/components/ui/AutoRefresh";
import {
  startCampaignExecution,
  pauseCampaignExecution,
  resumeCampaignExecution,
  cancelCampaignExecution,
  updateTestAllowlist,
  setTemplateStatus,
  setLiveBroadcastApproved,
} from "@/app/dashboard/broadcasting/execution-actions";

const EXEC_ERRORS: Record<string, string> = {
  kind: "Unknown execution kind.",
  redis: "REDIS_URL is not configured — the background worker queue is unavailable.",
  notfound: "Campaign not found.",
  template_missing: "The campaign has no WhatsApp template name.",
  template_unapproved:
    "The template is not verified as approved. Verify it in Meta/Respond.io, then mark it approved below.",
  allowlist_empty: "The internal test allowlist is empty — a Super Admin must add numbers below.",
  not_allowlisted: "One or more numbers are not on the internal test allowlist.",
  env_flag:
    "ENABLE_LIVE_BROADCASTING is not 'true' on the server — live sends are disabled (fail closed).",
  not_approved_setting:
    "The in-app live-broadcast switch is off — a Super Admin must enable it below.",
  state: "Live sends need an approved (or scheduled, due) campaign.",
  too_early: "The campaign's scheduled time has not been reached yet.",
  job_exists: "A job is already queued/running for this campaign (or a live job already ran).",
  invalid_numbers: "Allowlist numbers must be E.164 format, e.g. +2557XXXXXXXX.",
  template_status: "Invalid template status.",
};

const JOB_STYLE: Record<string, string> = {
  queued: "bg-blue-50 text-blue-700 border-blue-200",
  running: "bg-blue-50 text-blue-700 border-blue-200",
  paused: "bg-amber-50 text-amber-700 border-amber-200",
  cancelled: "bg-neutral-bg text-charcoal-light border-neutral-border",
  completed: "bg-green-50 text-green-700 border-green-200",
  failed: "bg-tronic-red-soft text-tronic-red border-tronic-red/30",
};

export async function ExecutionPanel({
  campaignId,
  campaignStatus,
  templateName,
  canWrite,
  canApprove,
  canManageSettings,
  canManageIntegrations,
  execError,
  execStarted,
}: {
  campaignId: string;
  campaignStatus: string;
  templateName: string;
  canWrite: boolean;
  canApprove: boolean;
  canManageSettings: boolean;
  canManageIntegrations: boolean;
  execError?: string;
  execStarted?: string;
}) {
  const supabase = await createSupabaseServerClient();

  const [{ data: jobs }, { data: settings }, { data: templates }] =
    await Promise.all([
      supabase
        .from("campaign_jobs")
        .select("*, requester:profiles!campaign_jobs_requested_by_fkey(full_name)")
        .eq("campaign_id", campaignId)
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("system_settings")
        .select("key, value")
        .in("key", ["test_whatsapp_allowlist", "live_broadcasting_approved"]),
      templateName
        ? supabase
            .from("message_templates")
            .select("status, category, last_checked_at")
            .eq("name", templateName)
            .limit(1)
        : Promise.resolve({
            data: [] as {
              status: string;
              category: string;
              last_checked_at: string | null;
            }[],
          }),
    ]);

  const allowlist: string[] = Array.isArray(
    settings?.find((s) => s.key === "test_whatsapp_allowlist")?.value,
  )
    ? (settings!.find((s) => s.key === "test_whatsapp_allowlist")!.value as string[])
    : [];
  const liveApproved =
    settings?.find((s) => s.key === "live_broadcasting_approved")?.value === true;
  const envFlag = isLiveBroadcastingEnabled();
  const template = templates?.[0] ?? null;
  const templateApproved = template?.status === "approved";
  const hasUnfinished = (jobs ?? []).some((j) =>
    ["queued", "running", "paused"].includes(j.status),
  );
  const liveRan = (jobs ?? []).some(
    (j) => j.kind === "live" && j.status !== "cancelled",
  );

  const input =
    "rounded border border-neutral-border bg-white px-3 py-2 text-sm";

  return (
    <div className="bg-white border border-neutral-border rounded-lg p-4 space-y-4">
      {/* Live status: refresh server data while a job is queued/running/paused */}
      <AutoRefresh active={hasUnfinished} />
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-xs uppercase tracking-wide text-charcoal-light font-semibold">
          API Execution (Redis / BullMQ worker)
        </h2>
        <div className="flex gap-2 text-[11px]">
          <span
            className={`border rounded-full px-2 py-0.5 ${envFlag ? "bg-green-50 text-green-700 border-green-200" : "bg-neutral-bg text-charcoal-light border-neutral-border"}`}
          >
            env flag {envFlag ? "ON" : "OFF"}
          </span>
          <span
            className={`border rounded-full px-2 py-0.5 ${liveApproved ? "bg-green-50 text-green-700 border-green-200" : "bg-neutral-bg text-charcoal-light border-neutral-border"}`}
          >
            in-app switch {liveApproved ? "ON" : "OFF"}
          </span>
          <span
            className={`border rounded-full px-2 py-0.5 ${templateApproved ? "bg-green-50 text-green-700 border-green-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}
          >
            template {template?.status ?? "unknown"}
          </span>
        </div>
      </div>

      {execError && (
        <p className="text-sm text-tronic-red bg-tronic-red-soft border border-tronic-red/20 rounded px-3 py-2">
          {EXEC_ERRORS[execError] ?? execError}
        </p>
      )}
      {execStarted && (
        <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
          {execStarted === "dry_run" && "Dry run queued — no messages will be sent."}
          {execStarted === "test" && "Internal test send queued (allowlisted numbers only)."}
          {execStarted === "live" && "Live campaign send queued."}
        </p>
      )}

      {/* ---- Start controls ---- */}
      {canWrite && !hasUnfinished && (
        <div className="grid md:grid-cols-3 gap-3">
          <form
            action={startCampaignExecution.bind(null, campaignId)}
            className="border border-neutral-border rounded p-3 space-y-2"
          >
            <input type="hidden" name="kind" value="dry_run" />
            <p className="text-sm font-semibold">Dry run</p>
            <p className="text-xs text-charcoal-light">
              Validates recipients and counts sends. Nothing is transmitted.
            </p>
            <button className="text-sm border border-neutral-border bg-white rounded px-3 py-1.5 hover:border-charcoal-light">
              Start dry run
            </button>
          </form>

          <form
            action={startCampaignExecution.bind(null, campaignId)}
            className="border border-neutral-border rounded p-3 space-y-2"
          >
            <input type="hidden" name="kind" value="test" />
            <p className="text-sm font-semibold">Internal test</p>
            <p className="text-xs text-charcoal-light">
              Sends the approved template ONLY to allowlisted internal numbers
              ({allowlist.length} configured). Leave empty to use all of them.
            </p>
            <input
              name="test_numbers"
              placeholder="+2557… +2556… (optional subset)"
              className={`${input} w-full`}
            />
            <button className="text-sm bg-charcoal hover:bg-black text-white font-semibold rounded px-3 py-1.5">
              Send test
            </button>
          </form>

          <form
            action={startCampaignExecution.bind(null, campaignId)}
            className="border border-tronic-red/30 rounded p-3 space-y-2"
          >
            <input type="hidden" name="kind" value="live" />
            <p className="text-sm font-semibold text-tronic-red">Live send</p>
            <p className="text-xs text-charcoal-light">
              One consolidated template message per eligible customer. Requires:
              approved campaign, approved template, env flag AND in-app switch.
              Runs once per campaign — ever.
            </p>
            <label className="text-xs text-charcoal-light block">
              Batch size
              <input
                type="number"
                name="batch_size"
                defaultValue={20}
                min={1}
                max={200}
                className={`${input} w-24 ml-2`}
              />
            </label>
            <button
              disabled={
                !canApprove ||
                liveRan ||
                !envFlag ||
                !liveApproved ||
                !templateApproved ||
                !["approved", "scheduled"].includes(campaignStatus)
              }
              className="text-sm bg-tronic-red hover:bg-tronic-red-dark text-white font-semibold rounded px-3 py-1.5 disabled:opacity-40"
            >
              {liveRan ? "Live send already executed" : "Start LIVE send"}
            </button>
          </form>
        </div>
      )}

      {/* ---- Jobs ---- */}
      {(jobs ?? []).length > 0 && (
        <div className="border border-neutral-border rounded overflow-hidden">
          <table className="data-table">
            <thead>
              <tr>
                <th>Kind</th>
                <th>Status</th>
                <th>Progress</th>
                <th>Sent</th>
                <th>Failed</th>
                <th>Skipped</th>
                <th>By</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(jobs ?? []).map((j) => {
                const requester = Array.isArray(j.requester) ? j.requester[0] : j.requester;
                const pct =
                  j.total_recipients > 0
                    ? Math.min(100, Math.round((j.processed / j.total_recipients) * 100))
                    : 0;
                return (
                  <tr key={j.id}>
                    <td className="capitalize">{String(j.kind).replace(/_/g, " ")}</td>
                    <td>
                      <span
                        className={`text-xs border rounded-full px-2 py-0.5 ${JOB_STYLE[j.status] ?? ""}`}
                        title={j.error ?? undefined}
                      >
                        {j.status}
                      </span>
                      {j.error && (
                        <p className="text-[11px] text-tronic-red mt-1 max-w-72">{j.error}</p>
                      )}
                    </td>
                    <td className="min-w-32">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-neutral-bg rounded overflow-hidden">
                          <div
                            className="h-full bg-tronic-red"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs text-charcoal-light">
                          {j.processed}/{j.total_recipients}
                        </span>
                      </div>
                    </td>
                    <td>{j.sent}</td>
                    <td>{j.failed}</td>
                    <td>{j.skipped}</td>
                    <td className="text-xs text-charcoal-light">{requester?.full_name}</td>
                    <td>
                      {canWrite && (
                        <div className="flex gap-1.5">
                          {["queued", "running"].includes(j.status) && (
                            <form action={pauseCampaignExecution.bind(null, campaignId, j.id)}>
                              <button className="text-xs border border-neutral-border rounded px-2 py-1 hover:border-charcoal-light">
                                Pause
                              </button>
                            </form>
                          )}
                          {j.status === "paused" && (
                            <form action={resumeCampaignExecution.bind(null, campaignId, j.id)}>
                              <button className="text-xs border border-neutral-border rounded px-2 py-1 hover:border-charcoal-light">
                                Resume
                              </button>
                            </form>
                          )}
                          {["queued", "running", "paused"].includes(j.status) && (
                            <form action={cancelCampaignExecution.bind(null, campaignId, j.id)}>
                              <button className="text-xs text-tronic-red border border-tronic-red/30 rounded px-2 py-1 hover:bg-tronic-red-soft">
                                Cancel
                              </button>
                            </form>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ---- Admin configuration ---- */}
      <div className="grid md:grid-cols-3 gap-3">
        {canManageIntegrations && templateName && (
          <form
            action={setTemplateStatus.bind(null, campaignId, templateName)}
            className="border border-neutral-border rounded p-3 space-y-2"
          >
            <p className="text-xs font-semibold text-charcoal-light">
              Template approval — “{templateName}”
            </p>
            <p className="text-[11px] text-charcoal-light">
              Check the approval in Meta Business Manager / Respond.io, then
              record the verified status here.
              {template?.last_checked_at &&
                ` Last checked ${new Date(template.last_checked_at).toLocaleString()}.`}
            </p>
            <div className="flex gap-2 flex-wrap">
              <select name="status" defaultValue={template?.status ?? "pending"} className={input}>
                <option value="pending">pending</option>
                <option value="approved">approved</option>
                <option value="rejected">rejected</option>
                <option value="unknown">unknown</option>
              </select>
              <select
                name="format"
                defaultValue={template?.category === "catalog" ? "catalog" : "standard"}
                className={input}
              >
                <option value="standard">standard (image header)</option>
                <option value="catalog">catalog (no header)</option>
              </select>
              <button className="text-xs border border-neutral-border rounded px-3 py-1.5 hover:border-charcoal-light">
                Save
              </button>
            </div>
          </form>
        )}

        {canManageSettings && (
          <form
            action={updateTestAllowlist.bind(null, campaignId)}
            className="border border-neutral-border rounded p-3 space-y-2"
          >
            <p className="text-xs font-semibold text-charcoal-light">
              Internal test allowlist ({allowlist.length})
            </p>
            <textarea
              name="numbers"
              rows={2}
              defaultValue={allowlist.join("\n")}
              placeholder={"+2557XXXXXXXX\n+2556XXXXXXXX"}
              className={`${input} w-full font-mono text-xs`}
            />
            <button className="text-xs border border-neutral-border rounded px-3 py-1.5 hover:border-charcoal-light">
              Save allowlist
            </button>
          </form>
        )}

        {canManageSettings && (
          <form
            action={setLiveBroadcastApproved.bind(null, campaignId)}
            className="border border-neutral-border rounded p-3 space-y-2"
          >
            <p className="text-xs font-semibold text-charcoal-light">
              Live broadcasting switch
            </p>
            <p className="text-[11px] text-charcoal-light">
              Both this switch and the server env flag ENABLE_LIVE_BROADCASTING
              must be on for live sends (fail closed).
            </p>
            <button
              name="approved"
              value={liveApproved ? "false" : "true"}
              className={`text-xs font-semibold rounded px-3 py-1.5 ${
                liveApproved
                  ? "border border-tronic-red/30 text-tronic-red hover:bg-tronic-red-soft"
                  : "bg-charcoal text-white hover:bg-black"
              }`}
            >
              {liveApproved ? "Disable live sends" : "Enable live sends"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
