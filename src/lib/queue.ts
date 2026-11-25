import { Queue } from "bullmq";
import IORedis from "ioredis";

/**
 * BullMQ queues (backed by Redis on Railway/VPS).
 * Producers live in the Next.js app; consumers in src/workers (separate deploy).
 *
 * Queues:
 *  - catalog-sync:    Meta Product Catalog synchronization jobs
 *  - webhook-retry:   reprocessing of failed webhook_events
 *  - notifications:   fan-out that shouldn't block request handlers
 * Failed jobs exhaust retries → BullMQ keeps them (dead-letter set) for
 * inspection from the Integrations screen.
 */

let connection: IORedis | null = null;

export function getRedis(): IORedis {
  if (!connection) {
    const url = process.env.REDIS_URL;
    if (!url) throw new Error("REDIS_URL is not configured");
    connection = new IORedis(url, { maxRetriesPerRequest: null });
  }
  return connection;
}

const DEFAULT_JOB_OPTS = {
  attempts: 5,
  backoff: { type: "exponential" as const, delay: 5_000 },
  removeOnComplete: { age: 7 * 24 * 3600, count: 1000 },
  removeOnFail: false as const, // keep failures for the dead-letter view
};

let catalogSyncQueue: Queue | null = null;
let webhookRetryQueue: Queue | null = null;
let campaignSendQueue: Queue | null = null;

export function getCatalogSyncQueue(): Queue {
  if (!catalogSyncQueue) {
    catalogSyncQueue = new Queue("catalog-sync", {
      connection: getRedis(),
      defaultJobOptions: DEFAULT_JOB_OPTS,
    });
  }
  return catalogSyncQueue;
}

export function getWebhookRetryQueue(): Queue {
  if (!webhookRetryQueue) {
    webhookRetryQueue = new Queue("webhook-retry", {
      connection: getRedis(),
      defaultJobOptions: DEFAULT_JOB_OPTS,
    });
  }
  return webhookRetryQueue;
}

/**
 * Campaign execution jobs (dry-run / internal test / live sends).
 * attempts: 1 — campaign jobs manage their own retry + resume semantics so a
 * crashed send is NEVER blindly re-run (duplicate-message prevention);
 * resuming re-enqueues and the worker skips recipients already sent.
 */
export function getCampaignSendQueue(): Queue {
  if (!campaignSendQueue) {
    campaignSendQueue = new Queue("campaign-send", {
      connection: getRedis(),
      defaultJobOptions: {
        ...DEFAULT_JOB_OPTS,
        attempts: 1,
      },
    });
  }
  return campaignSendQueue;
}

export function isQueueConfigured(): boolean {
  return Boolean(process.env.REDIS_URL);
}
