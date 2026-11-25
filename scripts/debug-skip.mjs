import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const { data: campaign } = await admin
  .from("campaigns")
  .select("id, name")
  .order("created_at", { ascending: false })
  .limit(1)
  .single();
console.log("campaign:", campaign.name);

const { data: batch, error: bErr } = await admin
  .from("campaign_recipients")
  .select("id, customer_id, status")
  .eq("campaign_id", campaign.id)
  .limit(5);
console.log("recipients sample:", batch?.length, bErr?.message ?? "");

const ids = (batch ?? []).map((b) => b.customer_id);
const { data: customers, error: cErr } = await admin
  .from("customers")
  .select("id, whatsapp_phone, respondio_contact_id, is_blocked")
  .in("id", ids);
console.log("customers lookup error:", cErr ? JSON.stringify(cErr) : "none");
console.log(
  "customers:",
  (customers ?? []).map((c) => ({
    found: true,
    hasPhone: Boolean(c.whatsapp_phone),
    hasContactId: Boolean(c.respondio_contact_id),
    blocked: c.is_blocked,
  })),
);
