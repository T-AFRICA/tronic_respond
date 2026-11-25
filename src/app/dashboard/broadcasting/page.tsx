import { EmptyState } from "@/components/ui/EmptyState";
import { Megaphone } from "lucide-react";
import Link from "next/link";
import { requirePermission, hasPermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Broadcasting" };
export const dynamic = "force-dynamic";

export default async function BroadcastingPage() {
  const profile = await requirePermission("campaigns.read");
  const supabase = await createSupabaseServerClient();

  const { data: campaigns } = await supabase
    .from("campaigns")
    .select("*, profiles!campaigns_created_by_fkey(full_name)")
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="display text-2xl font-black">WhatsApp Broadcasting</h1>
          <p className="text-sm text-charcoal-light mt-1">
            Campaign preparation and tracking. Execution uses Respond.io's
            native Broadcast module as the initial engine; opted-out customers
            are always suppressed.
          </p>
        </div>
        {hasPermission(profile, "campaigns.write") && (
          <Link
            href="/dashboard/broadcasting/new"
            className="text-sm bg-tronic-red hover:bg-tronic-red-dark text-white font-semibold rounded px-4 py-2"
          >
            New Campaign
          </Link>
        )}
      </div>

      <div className="border border-neutral-border rounded-lg overflow-hidden">
        <table className="data-table">
          <thead>
            <tr>
              <th>Campaign</th>
              <th>Type</th>
              <th>Status</th>
              <th>Created by</th>
              <th>Scheduled</th>
            </tr>
          </thead>
          <tbody>
            {(campaigns ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="p-0"><EmptyState icon={Megaphone} title="No campaigns yet" hint="Create your first WhatsApp campaign - select offer products, choose the audience and run an internal test." actionHref="/dashboard/broadcasting/new" actionLabel="New Campaign" /></td>
              </tr>
            )}
            {(campaigns ?? []).map((c) => {
              const creator = Array.isArray(c.profiles) ? c.profiles[0] : c.profiles;
              return (
                <tr key={c.id}>
                  <td className="font-medium">
                    <Link
                      href={`/dashboard/broadcasting/${c.id}`}
                      className="text-tronic-red hover:underline"
                    >
                      {c.name}
                    </Link>
                  </td>
                  <td className="capitalize text-xs">
                    {c.campaign_type.replace(/_/g, " ")}
                  </td>
                  <td className="capitalize">{c.status.replace(/_/g, " ")}</td>
                  <td>{creator?.full_name}</td>
                  <td className="text-xs text-charcoal-light">
                    {c.scheduled_at
                      ? new Date(c.scheduled_at).toLocaleString()
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
