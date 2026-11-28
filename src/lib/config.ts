/**
 * Server-side environment configuration.
 *
 * Supports both naming conventions so existing deployments keep working:
 *   RESPOND_IO_API_TOKEN   (spec)   or RESPONDIO_API_TOKEN   (legacy)
 *   RESPOND_IO_API_URL     (spec)   or RESPONDIO_API_BASE_URL (legacy)
 *   APP_BASE_URL           (spec)   or NEXT_PUBLIC_APP_URL    (legacy)
 *
 * SECURITY: everything here except appBaseUrl is server-only. Never import
 * this module from a client component.
 */

function env(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name];
    if (value) return value;
  }
  return undefined;
}

export const respondIoConfig = {
  token: () => env("RESPOND_IO_API_TOKEN", "RESPONDIO_API_TOKEN"),
  baseUrl: () =>
    env("RESPOND_IO_API_URL", "RESPONDIO_API_BASE_URL") ??
    "https://api.respond.io/v2",
  /** WhatsApp channel ID in Respond.io. Without an explicit channelId the
   *  provider falls back to the contact's "last interacted channel", which
   *  fails for new contacts — so the pinned WhatsApp channel is the default. */
  channelId: () =>
    env("RESPOND_IO_CHANNEL_ID", "RESPONDIO_CHANNEL_ID") ?? "582135",
  /** Default approved marketing template name. */
  templateName: () =>
    env("RESPOND_IO_TEMPLATE_NAME", "RESPONDIO_TEMPLATE_NAME") ??
    "tronic_special_offers",
  /**
   * Public image URL for the template's IMAGE header. Meta rejects sends of
   * media-header templates without a header parameter (#132012), and fetches
   * this URL itself — so it must be publicly reachable (not localhost).
   * The ?v= query busts Meta/WhatsApp's media cache: bump it whenever
   * public/brand/offer-header.jpg is replaced, or stale banners get sent.
   */
  templateHeaderImageUrl: () =>
    env("BROADCAST_HEADER_IMAGE_URL") ??
    "https://www.tronic.ltd/brand/offer-header.jpg?v=3",
};

/**
 * HARD server-side kill switch for live customer broadcasting.
 * Fail closed: anything other than the exact string "true" disables live sends.
 * A second, in-app switch (system_settings.live_broadcasting_approved) must
 * ALSO be on — both are required.
 */
export function isLiveBroadcastingEnabled(): boolean {
  return (process.env.ENABLE_LIVE_BROADCASTING ?? "").toLowerCase() === "true";
}

export function appBaseUrl(): string {
  return env("APP_BASE_URL", "NEXT_PUBLIC_APP_URL") ?? "http://localhost:3000";
}
