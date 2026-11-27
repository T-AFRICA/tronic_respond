import Link from "next/link";
import { notFound } from "next/navigation";
import { UsersRound } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { AddMembersPanel } from "@/components/segments/AddMembersPanel";
import { requirePermission, hasPermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { deleteSegment, removeMember } from "../actions";

export const metadata = { title: "Segment" };
export const dynamic = "force-dynamic";

export default async function SegmentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string; error?: string }>;
}) {
  const profile = await requirePermission("customers.read");
  const { id } = await params;
  const { q, error } = await searchParams;
  const supabase = await createSupabaseServerClient();

  const { data: segment } = await supabase
    .from("customer_segments")
    .select("id, name, description, created_at")
    .eq("id", id)
    .single();
  if (!segment) notFound();

  const { count: memberCount } = await supabase
    .from("customer_segment_members")
    .select("customer_id", { count: "exact", head: true })
    .eq("segment_id", id);

  let membersQuery = supabase
    .from("customer_segment_members")
    .select(
      "customer_id, added_at, customers!inner(id, full_name, company_name, whatsapp_phone, is_blocked, last_contact_at)",
    )
    .eq("segment_id", id)
    .order("added_at", { ascending: false })
    .limit(200);
  if (q) {
    membersQuery = membersQuery.or(
      `full_name.ilike.%${q}%,company_name.ilike.%${q}%,whatsapp_phone.ilike.%${q}%`,
      { referencedTable: "customers" },
    );
  }
  const { data: members } = await membersQuery;

  const canWrite = hasPermission(profile, "customers.write");

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs text-charcoal-light">
            <Link href="/dashboard/segments" className="hover:underline">
              Segments
            </Link>{" "}
            /
          </p>
          <h1 className="display text-2xl font-black">{segment.name}</h1>
          <p className="text-sm text-charcoal-light mt-1">
            {segment.description || "No description."}{" "}
            <span className="font-semibold text-charcoal">
              {memberCount ?? 0} members.
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/broadcasting/new"
            className="text-sm bg-tronic-red hover:bg-tronic-red-dark text-white font-semibold rounded px-4 py-2"
          >
            New campaign with this segment
          </Link>
          {canWrite && (
            <form action={deleteSegment}>
              <input type="hidden" name="segment_id" value={segment.id} />
              <button className="text-sm border border-neutral-border rounded px-4 py-2 text-charcoal-light hover:border-tronic-red hover:text-tronic-red">
                Delete segment
              </button>
            </form>
          )}
        </div>
      </div>

      {error === "inuse" && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2">
          This segment is used by one or more campaigns, so it cannot be
          deleted. Remove it from those campaigns first.
        </p>
      )}

      {canWrite && <AddMembersPanel segmentId={segment.id} />}

      <form action={`/dashboard/segments/${segment.id}`} className="flex gap-2">
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Filter members by name, company, phone…"
          className="w-72 rounded border border-neutral-border px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-tronic-red/40"
        />
        <button className="text-sm border border-neutral-border bg-white rounded px-4 py-2 hover:border-charcoal-light">
          Filter
        </button>
      </form>

      <div className="border border-neutral-border rounded-lg overflow-hidden">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Company</th>
              <th>WhatsApp</th>
              <th>Last contact</th>
              <th>Added</th>
              {canWrite && <th></th>}
            </tr>
          </thead>
          <tbody>
            {(members ?? []).length === 0 && (
              <tr>
                <td colSpan={canWrite ? 6 : 5} className="p-0">
                  <EmptyState
                    icon={UsersRound}
                    title={q ? "No members match that filter" : "No members yet"}
                    hint={
                      q
                        ? "Try a different name or number."
                        : "Add customers above — by activity filter, pasted phone list, or search."
                    }
                  />
                </td>
              </tr>
            )}
            {(members ?? []).map((m) => {
              const c = Array.isArray(m.customers) ? m.customers[0] : m.customers;
              if (!c) return null;
              return (
                <tr key={m.customer_id}>
                  <td className="font-medium">
                    <Link
                      href={`/dashboard/customers/${c.id}`}
                      className="text-tronic-red hover:underline"
                    >
                      {c.full_name || c.whatsapp_phone}
                    </Link>
                    {c.is_blocked && (
                      <span className="ml-2 text-xs text-tronic-red">
                        Blocked
                      </span>
                    )}
                  </td>
                  <td>{c.company_name || "—"}</td>
                  <td className="font-mono text-xs">{c.whatsapp_phone}</td>
                  <td className="text-xs text-charcoal-light">
                    {c.last_contact_at
                      ? new Date(c.last_contact_at).toLocaleDateString()
                      : "—"}
                  </td>
                  <td className="text-xs text-charcoal-light">
                    {new Date(m.added_at).toLocaleDateString()}
                  </td>
                  {canWrite && (
                    <td>
                      <form action={removeMember}>
                        <input
                          type="hidden"
                          name="segment_id"
                          value={segment.id}
                        />
                        <input
                          type="hidden"
                          name="customer_id"
                          value={m.customer_id}
                        />
                        <button className="text-xs text-charcoal-light hover:text-tronic-red">
                          Remove
                        </button>
                      </form>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {(members ?? []).length === 200 && (
        <p className="text-xs text-charcoal-light">
          Showing the 200 most recently added members — use the filter box to
          find anyone else.
        </p>
      )}
    </div>
  );
}
