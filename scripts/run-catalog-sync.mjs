/**
 * Enqueue a Meta catalog sync job (same as the dashboard button).
 * Usage: node scripts/run-catalog-sync.mjs [incremental_update|manual_resync|retry_failed]
 */
import { createClient } from "@supabase/supabase-js";
import { Queue } from "bullmq";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(process.cwd(), ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const jobType = process.argv[2] ?? "manual_resync";
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// Super Admin profile as the trigger actor
const { data: admin } = await db
  .from("profiles")
  .select("id, roles(key)")
  .eq("is_active", true)
  .limit(10);
const actor = (admin ?? []).find((p) => p.roles?.key === "super_admin") ?? admin?.[0];
if (!actor) {
  console.error("No active profile found to attribute the job to.");
  process.exit(1);
}

const { data: job, error } = await db
  .from("catalog_sync_jobs")
  .insert({ job_type: jobType, triggered_by: actor.id })
  .select("id")
  .single();
if (error) {
  console.error("Job insert failed:", error.message);
  process.exit(1);
}

const queue = new Queue("catalog-sync", {
  connection: { url: process.env.REDIS_URL },
});
const queueJob = await queue.add(jobType, { syncJobId: job.id });
await db
  .from("catalog_sync_jobs")
  .update({ queue_job_id: String(queueJob.id) })
  .eq("id", job.id);
await queue.close();

console.log(`Catalog sync queued: job ${job.id} (${jobType})`);
