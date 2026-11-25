"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCatalogSyncQueue, isQueueConfigured } from "@/lib/queue";

export async function triggerSync(
  jobType: "incremental_update" | "manual_resync" | "retry_failed",
) {
  const profile = await requirePermission("catalog.sync");
  const supabase = await createSupabaseServerClient();

  const { data: job, error } = await supabase
    .from("catalog_sync_jobs")
    .insert({ job_type: jobType, triggered_by: profile.id })
    .select("id")
    .single();

  if (error || !job) redirect("/dashboard/meta-catalog?error=create");

  if (isQueueConfigured()) {
    const queue = getCatalogSyncQueue();
    const queueJob = await queue.add(jobType, { syncJobId: job.id });
    await supabase
      .from("catalog_sync_jobs")
      .update({ queue_job_id: String(queueJob.id) })
      .eq("id", job.id);
    revalidatePath("/dashboard/meta-catalog");
    redirect("/dashboard/meta-catalog?queued=1");
  }

  revalidatePath("/dashboard/meta-catalog");
  redirect("/dashboard/meta-catalog?error=noredis");
}
