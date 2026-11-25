import { requirePermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Integrations" };
export const dynamic = "force-dynamic";

function statusColor(status: string) {
  switch (status) {
    case "healthy":
      return "bg-green-50 text-green-700 border-green-200";
    case "degraded":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "down":
      return "bg-tronic-red-soft text-tronic-red border-tronic-red/30";
    default:
      return "bg-neutral-bg text-charcoal-light border-neutral-border";
  }
}

export default async function IntegrationsPage() {
  await requirePermission("integrations.manage");
  const supabase = await createSupabaseServerClient();

  const [{ data: settings }, { data: recentEvents }] = await Promise.all([
    supabase.from("integration_settings").select("*"),
    supabase
      .from("webhook_events")
      .select("id, provider, event_type, status, received_at, error")
      .order("received_at", { ascending: false })
      .limit(30),
  ]);

  const envChecks = [
    { name: "Respond.io API token", set: Boolean(process.env.RESPONDIO_API_TOKEN) },
    { name: "Respond.io webhook secret", set: Boolean(process.env.RESPONDIO_WEBHOOK_SECRET) },
    { name: "Meta access token", set: Boolean(process.env.META_ACCESS_TOKEN) },
    { name: "Meta catalog ID", set: Boolean(process.env.META_CATALOG_ID) },
    { name: "Redis (queues)", set: Boolean(process.env.REDIS_URL) },
  ];

  return (
    <div className="space-y-5 max-w-5xl">
      <div>
        <h1 className="display text-2xl font-black">Integrations</h1>
        <p className="text-sm text-charcoal-light mt-1">
          Respond.io remains the primary communication platform — this system
          never disconnects or migrates the WhatsApp number. Verify each
          capability here before the dependent feature goes live.
        </p>
      </div>

      <section>
        <h2 className="text-sm font-semibold text-charcoal-light uppercase tracking-wide mb-2">
          Configuration
        </h2>
        <div className="grid md:grid-cols-2 gap-3">
          {envChecks.map((check) => (
            <div
              key={check.name}
              className="bg-white border border-neutral-border rounded-lg px-4 py-3 flex items-center justify-between"
            >
              <span className="text-sm">{check.name}</span>
              <span
                className={`text-[11px] border rounded-full px-2 py-0.5 ${
                  check.set
                    ? "bg-green-50 text-green-700 border-green-200"
                    : "bg-neutral-bg text-charcoal-light border-neutral-border"
                }`}
              >
                {check.set ? "Configured" : "Not configured"}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-charcoal-light uppercase tracking-wide mb-2">
          Provider health
        </h2>
        <div className="grid md:grid-cols-2 gap-3">
          {(settings ?? []).length === 0 && (
            <p className="text-sm text-charcoal-light">
              No providers registered yet — rows are created automatically on
              first use, or add them during capability validation.
            </p>
          )}
          {(settings ?? []).map((s) => (
            <div
              key={s.id}
              className="bg-white border border-neutral-border rounded-lg px-4 py-3 flex items-center justify-between"
            >
              <div>
                <p className="text-sm font-medium capitalize">{s.provider}</p>
                <p className="text-xs text-charcoal-light">
                  Last check:{" "}
                  {s.last_health_check_at
                    ? new Date(s.last_health_check_at).toLocaleString()
                    : "never"}
                </p>
              </div>
              <span
                className={`text-[11px] border rounded-full px-2 py-0.5 capitalize ${statusColor(s.health_status)}`}
              >
                {s.health_status}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-charcoal-light uppercase tracking-wide mb-2">
          Recent webhook events
        </h2>
        <div className="border border-neutral-border rounded-lg overflow-hidden">
          <table className="data-table">
            <thead>
              <tr>
                <th>Received</th>
                <th>Provider</th>
                <th>Event</th>
                <th>Status</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              {(recentEvents ?? []).length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center text-charcoal-light py-6">
                    No webhook events received yet. Point the Respond.io
                    webhook to <code>/api/webhooks/respondio</code>.
                  </td>
                </tr>
              )}
              {(recentEvents ?? []).map((e) => (
                <tr key={e.id}>
                  <td className="text-xs text-charcoal-light whitespace-nowrap">
                    {new Date(e.received_at).toLocaleString()}
                  </td>
                  <td>{e.provider}</td>
                  <td className="font-mono text-xs">{e.event_type}</td>
                  <td className="capitalize">{e.status}</td>
                  <td className="text-xs text-tronic-red">{e.error ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
