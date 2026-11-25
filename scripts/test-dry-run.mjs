/**
 * End-to-end DRY RUN test of the broadcast engine. Sends NOTHING.
 * Creates an approved test campaign, materializes recipients with
 * consent suppression (mirrors the in-app approval), queues a dry_run
 * job and watches the local worker process it.
 */
import { createClient } from "@supabase/supabase-js";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(process.cwd(), ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

// ---- Super Admin as actor ----
const { data: actor } = await admin
  .from("profiles")
  .select("id, full_name, roles!inner(key)")
  .eq("roles.key", "super_admin")
  .limit(1)
  .single();
if (!actor) {
  console.error("No super_admin profile found.");
  process.exit(1);
}

// ---- Campaign (approved, api-executed) ----
const { data: campaign, error: cErr } = await admin
  .from("campaigns")
  .insert({
    name: `Dry Run Test — ${new Date().toISOString().slice(0, 16).replace("T", " ")}`,
    campaign_type: "promotional",
    status: "approved",
    template_name: process.env.RESPOND_IO_TEMPLATE_NAME || "tronic_special_offers",
    message_body: "",
    executed_via: "api",
    created_by: actor.id,
    approved_by: actor.id,
    approved_at: new Date().toISOString(),
  })
  .select("id, name")
  .single();
if (cErr) {
  console.error("campaign insert failed:", cErr.message);
  process.exit(1);
}
console.log(`Campaign created: ${campaign.name} (${campaign.id})`);

// ---- Attach a few offer products ----
const { data: offerProducts } = await admin
  .from("active_offer_products")
  .select("product_id")
  .limit(10);
if (offerProducts?.length) {
  await admin.from("campaign_products").insert(
    offerProducts.map((p, i) => ({
      campaign_id: campaign.id,
      product_id: p.product_id,
      sort_order: i,
    })),
  );
  console.log(`Attached ${offerProducts.length} offer products`);
}

// ---- Materialize recipients with suppression ----
const allCustomers = [];
for (let fromIdx = 0; ; fromIdx += 1000) {
  const { data: pageRows } = await admin
    .from("customers")
    .select("id, is_blocked")
    .order("id")
    .range(fromIdx, fromIdx + 999);
  allCustomers.push(...(pageRows ?? []));
  if (!pageRows || pageRows.length < 1000) break;
}
const { data: revoked } = await admin
  .from("current_customer_consents")
  .select("customer_id")
  .eq("channel", "whatsapp_marketing")
  .eq("status", "revoked");
const revokedSet = new Set((revoked ?? []).map((r) => r.customer_id));

const rows = allCustomers.map((c) => {
  const suppressed = c.is_blocked || revokedSet.has(c.id);
  return {
    campaign_id: campaign.id,
    customer_id: c.id,
    suppressed,
    suppressed_reason: suppressed ? "opted_out_or_blocked" : "",
  };
});
for (let i = 0; i < rows.length; i += 1000) {
  const { error } = await admin
    .from("campaign_recipients")
    .upsert(rows.slice(i, i + 1000), {
      onConflict: "campaign_id,customer_id",
      ignoreDuplicates: true,
    });
  if (error) {
    console.error("recipient batch failed:", error.message);
    process.exit(1);
  }
}
const suppressedCount = rows.filter((r) => r.suppressed).length;
console.log(
  `Recipients materialized: ${rows.length} total, ${rows.length - suppressedCount} eligible, ${suppressedCount} suppressed`,
);

// ---- Dry-run job ----
const { data: job, error: jErr } = await admin
  .from("campaign_jobs")
  .insert({
    campaign_id: campaign.id,
    kind: "dry_run",
    batch_size: 200,
    batch_delay_ms: 0,
    requested_by: actor.id,
  })
  .select("id")
  .single();
if (jErr) {
  console.error("job insert failed:", jErr.message);
  process.exit(1);
}

const connection = new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
const queue = new Queue("campaign-send", { connection });
await queue.add("send", { campaignJobId: job.id });
console.log(`Dry-run job queued (${job.id}) — waiting for the worker…\n`);

// ---- Watch progress ----
const started = Date.now();
for (;;) {
  await new Promise((r) => setTimeout(r, 3000));
  const { data: j } = await admin
    .from("campaign_jobs")
    .select("status, total_recipients, processed, sent, failed, skipped, error")
    .eq("id", job.id)
    .single();
  process.stdout.write(
    `\r  status=${j.status}  processed=${j.processed}/${j.total_recipients}  would-send=${j.sent}  skipped=${j.skipped}   `,
  );
  if (["completed", "failed", "cancelled"].includes(j.status)) {
    console.log("\n");
    console.log("================= DRY RUN RESULT =================");
    console.log(`  Status:        ${j.status}`);
    console.log(`  Recipients:    ${j.total_recipients}`);
    console.log(`  Processed:     ${j.processed}`);
    console.log(`  Would send:    ${j.sent}  (NOTHING was actually sent)`);
    console.log(`  Skipped:       ${j.skipped} (blocked / missing contact)`);
    if (j.error) console.log(`  Error:         ${j.error}`);
    console.log("==================================================");
    break;
  }
  if (Date.now() - started > 10 * 60 * 1000) {
    console.log("\nTimed out waiting (worker running?)");
    break;
  }
}
await queue.close();
connection.disconnect();
process.exit(0);
