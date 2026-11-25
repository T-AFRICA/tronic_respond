import { requirePermission, hasPermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { triggerSync } from "./actions";

export const metadata = { title: "Meta Catalog" };
export const dynamic = "force-dynamic";

export default async function MetaCatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ queued?: string; error?: string }>;
}) {
  const profile = await requirePermission("products.read");
  const { queued, error } = await searchParams;
  const supabase = await createSupabaseServerClient();

  const [{ count: synced }, { count: failed }, { count: excluded }, { data: jobs }] =
    await Promise.all([
      supabase.from("products").select("*", { count: "exact", head: true }).eq("meta_sync_status", "synced"),
      supabase.from("products").select("*", { count: "exact", head: true }).eq("meta_sync_status", "failed"),
      supabase.from("products").select("*", { count: "exact", head: true }).eq("meta_sync_status", "excluded"),
      supabase
        .from("catalog_sync_jobs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

  const canSync = hasPermission(profile, "catalog.sync");

  return (
    <div className="space-y-5 max-w-5xl">
      <div>
        <h1 className="display text-2xl font-black">Meta Product Catalog</h1>
        <p className="text-sm text-charcoal-light mt-1">
          Synchronizes published products to the Meta Product Catalog connected
          to the TRONIC WhatsApp Business Account. Only public retail data is
          pushed — wholesale prices never leave this system.
        </p>
      </div>

      {queued && (
        <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
          Sync job queued. The background worker will process it shortly.
        </p>
      )}
      {error === "noredis" && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2">
          Redis is not configured (REDIS_URL). The job was recorded but needs
          the background worker to run. Configure Redis and start the worker
          (<code>npm run worker</code>).
        </p>
      )}

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white border border-neutral-border rounded-lg px-4 py-3">
          <p className="text-xs text-charcoal-light uppercase">Synchronized</p>
          <p className="text-2xl font-bold">{synced ?? 0}</p>
        </div>
        <div className="bg-white border border-neutral-border rounded-lg px-4 py-3">
          <p className="text-xs text-charcoal-light uppercase">Failed</p>
          <p className={`text-2xl font-bold ${failed ? "text-tronic-red" : ""}`}>{failed ?? 0}</p>
        </div>
        <div className="bg-white border border-neutral-border rounded-lg px-4 py-3">
          <p className="text-xs text-charcoal-light uppercase">Excluded (ineligible)</p>
          <p className="text-2xl font-bold">{excluded ?? 0}</p>
        </div>
      </div>

      {canSync && (
        <div className="flex gap-2">
          <form action={triggerSync.bind(null, "incremental_update")}>
            <button className="text-sm bg-tronic-red hover:bg-tronic-red-dark text-white font-semibold rounded px-4 py-2">
              Sync Changes
            </button>
          </form>
          <form action={triggerSync.bind(null, "manual_resync")}>
            <button className="text-sm border border-neutral-border bg-white rounded px-4 py-2 hover:border-charcoal-light">
              Full Resync
            </button>
          </form>
          <form action={triggerSync.bind(null, "retry_failed")}>
            <button className="text-sm border border-neutral-border bg-white rounded px-4 py-2 hover:border-charcoal-light">
              Retry Failed
            </button>
          </form>
        </div>
      )}

      <section>
        <h2 className="text-sm font-semibold text-charcoal-light uppercase tracking-wide mb-2">
          Sync jobs
        </h2>
        <div className="border border-neutral-border rounded-lg overflow-hidden">
          <table className="data-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Status</th>
                <th>Total</th>
                <th>Synced</th>
                <th>Failed</th>
                <th>Skipped</th>
                <th>Started</th>
              </tr>
            </thead>
            <tbody>
              {(jobs ?? []).length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center text-charcoal-light py-6">
                    No sync jobs yet.
                  </td>
                </tr>
              )}
              {(jobs ?? []).map((job) => (
                <tr key={job.id}>
                  <td className="capitalize">{job.job_type.replace(/_/g, " ")}</td>
                  <td className="capitalize">{job.status.replace(/_/g, " ")}</td>
                  <td>{job.total_items}</td>
                  <td>{job.synced_items}</td>
                  <td className={job.failed_items > 0 ? "text-tronic-red" : ""}>
                    {job.failed_items}
                  </td>
                  <td>{job.skipped_items}</td>
                  <td className="text-xs text-charcoal-light">
                    {job.started_at ? new Date(job.started_at).toLocaleString() : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
