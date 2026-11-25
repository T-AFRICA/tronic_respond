import { requirePermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Audit Logs" };
export const dynamic = "force-dynamic";

export default async function AuditLogsPage() {
  await requirePermission("audit.read");
  const supabase = await createSupabaseServerClient();

  const { data: logs } = await supabase
    .from("audit_logs")
    .select("*, profiles(full_name)")
    .order("created_at", { ascending: false })
    .limit(200);

  return (
    <div className="space-y-4 max-w-5xl">
      <h1 className="display text-2xl font-black">Audit Logs</h1>

      <div className="border border-neutral-border rounded-lg overflow-hidden">
        <table className="data-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Entity</th>
            </tr>
          </thead>
          <tbody>
            {(logs ?? []).length === 0 && (
              <tr>
                <td colSpan={4} className="text-center text-charcoal-light py-8">
                  No audit entries yet.
                </td>
              </tr>
            )}
            {(logs ?? []).map((log) => {
              const actor = Array.isArray(log.profiles) ? log.profiles[0] : log.profiles;
              return (
                <tr key={log.id}>
                  <td className="text-xs text-charcoal-light whitespace-nowrap">
                    {new Date(log.created_at).toLocaleString()}
                  </td>
                  <td>{actor?.full_name ?? "System"}</td>
                  <td className="font-mono text-xs">{log.action}</td>
                  <td className="text-xs">
                    {log.entity_type}
                    {log.entity_id ? ` · ${log.entity_id}` : ""}
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
