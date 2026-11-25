import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile, hasPermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * CSV export of a campaign's ELIGIBLE recipients (suppressed customers are
 * never exported) for use in Respond.io's native Broadcast module.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const profile = await getCurrentProfile();
  if (!profile || !hasPermission(profile, "campaigns.write")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: campaign } = await supabase
    .from("campaigns")
    .select("name, status")
    .eq("id", id)
    .single();
  if (!campaign) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (!["approved", "scheduled", "running", "completed"].includes(campaign.status)) {
    return NextResponse.json(
      { error: "campaign is not approved yet" },
      { status: 409 },
    );
  }

  const rows: string[] = ["phone,name,company"];
  let from = 0;
  const page = 1000;
  for (;;) {
    const { data } = await supabase
      .from("campaign_recipients")
      .select("customers(whatsapp_phone, full_name, company_name)")
      .eq("campaign_id", id)
      .eq("suppressed", false)
      .range(from, from + page - 1);
    if (!data || data.length === 0) break;

    for (const r of data) {
      const c = Array.isArray(r.customers) ? r.customers[0] : r.customers;
      if (!c) continue;
      const esc = (s: string) => `"${(s ?? "").replace(/"/g, '""')}"`;
      rows.push([esc(c.whatsapp_phone), esc(c.full_name), esc(c.company_name)].join(","));
    }
    if (data.length < page) break;
    from += page;
  }

  const safeName = campaign.name.replace(/[^a-z0-9-_]+/gi, "-").slice(0, 60);
  return new NextResponse(rows.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="campaign-${safeName}-recipients.csv"`,
    },
  });
}
