/**
 * TRONIC Response — background worker entry point.
 * Deployed separately (Railway / VPS): `npm run worker`
 *
 * Consumes:
 *  - catalog-sync:  pushes eligible products to the Meta Product Catalog
 *  - webhook-retry: reprocesses failed webhook events
 */
import { Worker } from "bullmq";
import { getRedis } from "@/lib/queue";
import { runCatalogSyncJob } from "@/workers/catalog-sync";
import { processWebhookEvent } from "@/modules/webhooks/processor";
import { runCampaignSendJob } from "@/modules/broadcast/engine";
import { sweepOfferStatuses } from "@/modules/offers/service";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

const OFFER_SWEEP_INTERVAL_MS = 5 * 60 * 1000;

function main() {
  const connection = getRedis();

  const catalogWorker = new Worker(
    "catalog-sync",
    async (job) => {
      console.log(`[catalog-sync] job ${job.id} (${job.name}) started`);
      await runCatalogSyncJob(job.data.syncJobId as string);
    },
    { connection, concurrency: 1 }, // serialize catalog pushes (rate limits)
  );

  const webhookWorker = new Worker(
    "webhook-retry",
    async (job) => {
      console.log(`[webhook-retry] event ${job.data.eventId}`);
      await processWebhookEvent(job.data.eventId as string);
    },
    { connection, concurrency: 4 },
  );

  // Campaign execution: dry-run / internal test / live sends.
  // concurrency 1 — one campaign at a time keeps provider rate limits safe.
  const campaignWorker = new Worker(
    "campaign-send",
    async (job) => {
      console.log(`[campaign-send] job ${job.id} (campaignJob ${job.data.campaignJobId}) started`);
      await runCampaignSendJob(job.data.campaignJobId as string);
    },
    { connection, concurrency: 1 },
  );

  // Offer lifecycle sweep: activates due scheduled offers, expires ended ones.
  const offerSweep = setInterval(() => {
    sweepOfferStatuses(createSupabaseAdminClient()).catch((e) =>
      console.error("[offer-sweep] failed:", e instanceof Error ? e.message : e),
    );
  }, OFFER_SWEEP_INTERVAL_MS);

  for (const w of [catalogWorker, webhookWorker, campaignWorker]) {
    w.on("failed", (job, err) => {
      console.error(`[${w.name}] job ${job?.id} failed:`, err.message);
    });
    w.on("completed", (job) => {
      console.log(`[${w.name}] job ${job.id} completed`);
    });
  }

  console.log(
    "TRONIC Response workers running (catalog-sync, webhook-retry, campaign-send, offer-sweep)",
  );

  const shutdown = async () => {
    console.log("Shutting down workers…");
    clearInterval(offerSweep);
    await Promise.all([
      catalogWorker.close(),
      webhookWorker.close(),
      campaignWorker.close(),
    ]);
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main();
