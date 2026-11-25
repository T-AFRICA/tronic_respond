import { requirePermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CampaignComposer } from "@/components/broadcasting/CampaignComposer";

export const metadata = { title: "New Campaign" };
export const dynamic = "force-dynamic";

export default async function NewCampaignPage() {
  await requirePermission("campaigns.write");
  const supabase = await createSupabaseServerClient();
  const { data: segments } = await supabase
    .from("customer_segments")
    .select("id, name")
    .order("name");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="display text-2xl font-black">New Campaign</h1>
        <p className="text-sm text-charcoal-light mt-1">
          Prepare a broadcast for manager approval. Execution runs through
          Respond.io&apos;s native Broadcast module; opted-out customers are
          suppressed automatically.
        </p>
      </div>
      <CampaignComposer segments={segments ?? []} />
    </div>
  );
}
