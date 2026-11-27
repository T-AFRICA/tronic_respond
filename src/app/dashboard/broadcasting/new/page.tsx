import { requirePermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listChannelTemplates } from "@/integrations/respondio/client";
import { CampaignComposer } from "@/components/broadcasting/CampaignComposer";
import type { TemplateOption } from "@/components/broadcasting/CampaignComposer";

export const metadata = { title: "New Campaign" };
export const dynamic = "force-dynamic";

export default async function NewCampaignPage() {
  await requirePermission("campaigns.write");
  const supabase = await createSupabaseServerClient();
  const { data: segments } = await supabase
    .from("customer_segments")
    .select("id, name")
    .order("name");

  // Approved templates straight from Respond.io, so staff pick instead of
  // typing. If the API is unreachable the composer falls back to free text.
  let templates: TemplateOption[] = [];
  try {
    templates = (await listChannelTemplates())
      .filter((t) => String(t.status).toLowerCase() === "approved")
      .map((t) => ({
        name: t.name,
        body: t.components?.find((c) => c.type === "body")?.text ?? "",
        isCatalog: JSON.stringify(t.components ?? [])
          .toLowerCase()
          .includes("catalog"),
      }));
  } catch {
    templates = [];
  }

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
      <CampaignComposer segments={segments ?? []} templates={templates} />
    </div>
  );
}
