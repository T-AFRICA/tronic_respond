import { EmptyState } from "@/components/ui/EmptyState";
import { Users } from "lucide-react";
import Link from "next/link";
import { requirePermission, hasPermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { syncCustomersFromRespondio } from "./actions";

export const metadata = { title: "Customers" };
export const dynamic = "force-dynamic";
// Respond.io sync walks up to 40 contact pages — allow a longer serverless budget.
export const maxDuration = 60;

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    synced?: string;
    error?: string;
    created?: string;
    updated?: string;
    skipped?: string;
    detail?: string;
  }>;
}) {
  const profile = await requirePermission("customers.read");
  const sp = await searchParams;
  const { q } = sp;
  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from("customers")
    .select("*, profiles!customers_assigned_staff_id_fkey(full_name)", {
      count: "exact",
    })
    .order("last_contact_at", { ascending: false, nullsFirst: false })
    .limit(100);

  if (q) {
    query = query.or(
      `full_name.ilike.%${q}%,company_name.ilike.%${q}%,whatsapp_phone.ilike.%${q}%`,
    );
  }

  const { data: customers, count } = await query;

  return (
    <div className="space-y-4 max-w-6xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="display text-2xl font-black">Customers</h1>
          <p className="text-sm text-charcoal-light mt-1">
            {count ?? 0} customers — synchronized from Respond.io contacts and
            WhatsApp conversations.
          </p>
        </div>
        {hasPermission(profile, "customers.write") && (
          <form action={syncCustomersFromRespondio}>
            <button className="text-sm bg-tronic-red hover:bg-tronic-red-dark text-white font-semibold rounded px-4 py-2">
              Sync from Respond.io
            </button>
          </form>
        )}
      </div>

      {sp.synced && (
        <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
          Sync complete: {sp.created ?? 0} created, {sp.updated ?? 0} updated,{" "}
          {sp.skipped ?? 0} skipped (no phone or duplicate).
        </p>
      )}
      {sp.error === "norespondio" && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2">
          Respond.io is not configured (RESPOND_IO_API_TOKEN) — add credentials
          on the server to enable customer sync.
        </p>
      )}
      {sp.error === "syncfailed" && (
        <div className="text-sm text-tronic-red bg-tronic-red-soft border border-tronic-red/20 rounded px-3 py-2">
          <p>
            Sync stopped early ({sp.created ?? 0} created, {sp.updated ?? 0}{" "}
            updated before the error). The sync is safe to repeat.
          </p>
          {sp.detail && (
            <p className="mt-1 font-mono text-xs break-all">
              Provider response: {sp.detail}
            </p>
          )}
        </div>
      )}

      <form action="/dashboard/customers" className="flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search name, company, phone…"
          className="w-72 rounded border border-neutral-border bg-white px-3 py-2 text-sm"
        />
        <button className="text-sm border border-neutral-border bg-white rounded px-4 py-2 hover:border-charcoal-light">
          Search
        </button>
      </form>

      <div className="border border-neutral-border rounded-lg overflow-hidden">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Company</th>
              <th>WhatsApp</th>
              <th>Tags</th>
              <th>Assigned to</th>
              <th>Last contact</th>
            </tr>
          </thead>
          <tbody>
            {(customers ?? []).length === 0 && (
              <tr>
                <td colSpan={6} className="p-0"><EmptyState icon={Users} title="No customers yet" hint="Sync your existing Respond.io contacts - customers also appear automatically when they message you on WhatsApp." /></td>
              </tr>
            )}
            {(customers ?? []).map((c) => {
              const assignee = Array.isArray(c.profiles) ? c.profiles[0] : c.profiles;
              return (
                <tr key={c.id}>
                  <td className="font-medium">
                    <Link
                      href={`/dashboard/customers/${c.id}`}
                      className="text-tronic-red hover:underline"
                    >
                      {c.full_name || c.whatsapp_phone}
                    </Link>
                  </td>
                  <td>{c.company_name || "—"}</td>
                  <td className="font-mono text-xs">{c.whatsapp_phone}</td>
                  <td className="text-xs">{(c.tags ?? []).join(", ")}</td>
                  <td>{assignee?.full_name ?? "—"}</td>
                  <td className="text-xs text-charcoal-light">
                    {c.last_contact_at
                      ? new Date(c.last_contact_at).toLocaleString()
                      : "—"}
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
