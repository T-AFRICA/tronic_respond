import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Live customer search (typeahead) — staff only; RLS returns nothing to anon. */
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (!q) return NextResponse.json({ items: [] });

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("customers")
    .select(
      "id, full_name, company_name, whatsapp_phone, is_blocked, last_contact_at",
    )
    .or(
      `full_name.ilike.%${q}%,company_name.ilike.%${q}%,whatsapp_phone.ilike.%${q}%`,
    )
    .order("last_contact_at", { ascending: false, nullsFirst: false })
    .limit(8);

  return NextResponse.json({ items: data ?? [] });
}
