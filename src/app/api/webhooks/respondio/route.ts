import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { processWebhookEvent } from "@/modules/webhooks/processor";

/**
 * Respond.io webhook inbox — store-then-process pattern.
 *
 * 1. Verify the signature where the workspace supports signed webhooks
 *    (RESPONDIO_WEBHOOK_SECRET). If no secret is configured the endpoint
 *    still stores events but marks them unverified.
 * 2. Deduplicate on provider event/message id (or payload hash fallback).
 * 3. Store the raw payload in webhook_events.
 * 4. Process inline (Phase 1A) — moves to the BullMQ worker when Redis is live.
 *
 * Always returns 200 quickly so the provider does not retry-storm us;
 * failures are retried from our own stored events, not by the provider.
 */

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  // --- Signature verification (when supported/configured) ---
  const secret = process.env.RESPONDIO_WEBHOOK_SECRET;
  let verified = false;
  if (secret) {
    const signature =
      request.headers.get("x-webhook-signature") ??
      request.headers.get("x-signature") ??
      "";
    const expected = crypto
      .createHmac("sha256", secret)
      .update(rawBody)
      .digest("base64");
    const expectedHex = crypto
      .createHmac("sha256", secret)
      .update(rawBody)
      .digest("hex");
    verified =
      signature.length > 0 &&
      (safeEqual(signature, expected) || safeEqual(signature, expectedHex));
    if (!verified) {
      // Reject outright when a secret is configured but the signature fails.
      return NextResponse.json({ error: "invalid signature" }, { status: 401 });
    }
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const eventType = String(
    (payload as { event_type?: string; event?: string }).event_type ??
      (payload as { event?: string }).event ??
      "unknown",
  );

  const externalId = extractExternalId(payload);
  const dedupeKey = externalId
    ? `respondio:${eventType}:${externalId}`
    : `respondio:${eventType}:${crypto.createHash("sha256").update(rawBody).digest("hex")}`;

  const admin = createSupabaseAdminClient();

  const { data: stored, error } = await admin
    .from("webhook_events")
    .insert({
      provider: "respondio",
      event_type: eventType,
      external_id: externalId,
      dedupe_key: dedupeKey,
      status: "received",
      payload,
      headers: { verified },
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      // Duplicate delivery — acknowledge without reprocessing.
      return NextResponse.json({ ok: true, duplicate: true });
    }
    console.error("webhook store failed", error);
    return NextResponse.json({ error: "store failed" }, { status: 500 });
  }

  // Process without blocking the response longer than necessary.
  try {
    await processWebhookEvent(stored.id);
  } catch (e) {
    // Event remains stored with status=failed; the retry worker picks it up.
    console.error("webhook processing failed", e);
  }

  return NextResponse.json({ ok: true });
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function extractExternalId(payload: Record<string, unknown>): string | null {
  const message = payload.message as { messageId?: unknown; id?: unknown } | undefined;
  const id =
    message?.messageId ??
    message?.id ??
    (payload as { messageId?: unknown }).messageId ??
    (payload as { id?: unknown }).id;
  return id !== undefined && id !== null ? String(id) : null;
}
