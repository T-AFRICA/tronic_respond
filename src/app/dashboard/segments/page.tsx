import Link from "next/link";
import { UsersRound } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { requirePermission, hasPermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSegment } from "./actions";

export const metadata = { title: "Segments" };
export const dynamic = "force-dynamic";

export default async function SegmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const profile = await requirePermission("customers.read");
  const { error } = await searchParams;
  const supabase = await createSupabaseServerClient();

  const { data: segments } = await supabase
    .from("customer_segments")
    .select(
      "id, name, description, created_at, customer_segment_members(count), campaigns(count)",
    )
    .order("created_at", { ascending: false });

  const canWrite = hasPermission(profile, "customers.write");

  return (
    <div className="space-y-4 max-w-5xl">
      <div>
        <h1 className="display text-2xl font-black">Segments</h1>
        <p className="text-sm text-charcoal-light mt-1">
          Named customer groups for Broadcasting — build a list once, reuse it
          in any campaign. Opted-out customers are always suppressed at send
          time.
        </p>
      </div>

      {error === "duplicate" && (
        <p className="text-sm text-tronic-red bg-tronic-red-soft border border-tronic-red/20 rounded px-3 py-2">
          A segment with that name already exists.
        </p>
      )}
      {error && error !== "duplicate" && (
        <p className="text-sm text-tronic-red bg-tronic-red-soft border border-tronic-red/20 rounded px-3 py-2">
          Could not create the segment: {error}
        </p>
      )}

      {canWrite && (
        <form
          action={createSegment}
          className="border border-neutral-border rounded-lg bg-white p-4 flex flex-wrap items-end gap-3"
        >
          <div className="flex-1 min-w-56">
            <label className="block text-xs font-medium text-charcoal-light mb-1">
              Segment name
            </label>
            <input
              name="name"
              required
              minLength={2}
              maxLength={120}
              placeholder="e.g. Special Active 600"
              className="w-full rounded border border-neutral-border px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-tronic-red/40"
            />
          </div>
          <div className="flex-[2] min-w-64">
            <label className="block text-xs font-medium text-charcoal-light mb-1">
              Description (optional)
            </label>
            <input
              name="description"
              maxLength={500}
              placeholder="Who belongs in this group?"
              className="w-full rounded border border-neutral-border px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-tronic-red/40"
            />
          </div>
          <button className="text-sm bg-tronic-red hover:bg-tronic-red-dark text-white font-semibold rounded px-4 py-2">
            Create segment
          </button>
        </form>
      )}

      <div className="border border-neutral-border rounded-lg overflow-hidden">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Description</th>
              <th>Members</th>
              <th>Used by campaigns</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {(segments ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="p-0">
                  <EmptyState
                    icon={UsersRound}
                    title="No segments yet"
                    hint="Create a segment above, then add customers by activity filter, pasted phone list, or search."
                  />
                </td>
              </tr>
            )}
            {(segments ?? []).map((s) => {
              const members = Array.isArray(s.customer_segment_members)
                ? (s.customer_segment_members[0] as { count?: number } | undefined)
                    ?.count ?? 0
                : 0;
              const campaigns = Array.isArray(s.campaigns)
                ? (s.campaigns[0] as { count?: number } | undefined)?.count ?? 0
                : 0;
              return (
                <tr key={s.id}>
                  <td className="font-medium">
                    <Link
                      href={`/dashboard/segments/${s.id}`}
                      className="text-tronic-red hover:underline"
                    >
                      {s.name}
                    </Link>
                  </td>
                  <td className="text-sm text-charcoal-light">
                    {s.description || "—"}
                  </td>
                  <td className="font-mono text-sm">{members}</td>
                  <td className="font-mono text-sm">{campaigns}</td>
                  <td className="text-xs text-charcoal-light">
                    {new Date(s.created_at).toLocaleDateString()}
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
