/**
 * Respond.io integration adapter.
 *
 * IMPORTANT — capability verification policy:
 * Every method here wraps an endpoint of the Respond.io Developer API v2
 * (https://developers.respond.io). Before any feature that depends on a
 * method goes live, the endpoint MUST be verified against the workspace's
 * actual subscription/plan via the Integrations screen's capability check.
 * Methods marked `verified: pending` must not be relied on by core flows —
 * every flow that uses them has a manual fallback.
 *
 * This adapter never invents endpoints: if a capability is not available,
 * the UI directs staff to perform the action inside Respond.io itself
 * (e.g. native product sharing, native Broadcast module).
 */

import { respondIoConfig } from "@/lib/config";

export class RespondIoError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(message);
    this.name = "RespondIoError";
  }
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  retries = 2,
): Promise<T> {
  const token = respondIoConfig.token();
  if (!token) throw new Error("RESPOND_IO_API_TOKEN is not configured");

  let res: Response;
  try {
    res = await fetch(`${respondIoConfig.baseUrl()}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
    });
  } catch (e) {
    // Retry ONLY connect-stage network failures (DNS, refused, connect
    // timeout): the request never reached the server, so a retry cannot
    // produce a duplicate send. Mid-response failures are NOT retried.
    const code = (e as { cause?: { code?: string } })?.cause?.code ?? "";
    const connectStage = [
      "UND_ERR_CONNECT_TIMEOUT",
      "ENOTFOUND",
      "ECONNREFUSED",
      "EAI_AGAIN",
    ].includes(code);
    if (connectStage && retries > 0) {
      await new Promise((r) => setTimeout(r, (3 - retries) * 3000 + 2000));
      return request<T>(path, init, retries - 1);
    }
    throw e;
  }

  // Provider rate limiting: back off and retry
  if (res.status === 429 && retries > 0) {
    const retryAfter = Number(res.headers.get("retry-after") ?? "2");
    await new Promise((r) => setTimeout(r, Math.min(retryAfter, 30) * 1000));
    return request<T>(path, init, retries - 1);
  }

  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = await res.text().catch(() => null);
    }
    throw new RespondIoError(
      `Respond.io ${init.method ?? "GET"} ${path} failed (${res.status})`,
      res.status,
      body,
    );
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/**
 * Respond.io addresses contacts by identifier: "id:123", "phone:+255…" or
 * "email:…". A bare numeric id is rejected ("Identifier … is invalid"), so
 * normalize numbers / numeric strings to the id: form.
 */
function contactIdentifier(contactId: string | number): string {
  const s = String(contactId);
  return /^\d+$/.test(s) ? `id:${s}` : s;
}

export type RespondIoContact = {
  id: number;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  countryCode: string | null;
  tags?: string[];
  assignee?: { id: number } | null;
  /** Unix seconds — when the contact was created in Respond.io. */
  created_at?: number;
};

// ---------- Contacts (verified: standard Developer API) ----------

export async function getContact(contactId: string | number) {
  return request<RespondIoContact>(`/contact/${contactIdentifier(contactId)}`);
}

export async function getContactByPhone(phone: string) {
  // Contacts are addressable by identifier "phone:<E.164>"
  return request<RespondIoContact>(`/contact/phone:${encodeURIComponent(phone)}`);
}

/**
 * Create the contact if it doesn't exist, update it if it does.
 * Used by internal test sends so an allowlisted staff number that has never
 * messaged the business can still receive the approved template.
 */
export async function createOrUpdateContact(
  phone: string,
  fields: { firstName?: string; lastName?: string } = {},
) {
  const res = await request<RespondIoContact | { id: number }>(
    `/contact/create_or_update/phone:${encodeURIComponent(phone)}`,
    {
      method: "POST",
      body: JSON.stringify({
        firstName: fields.firstName ?? "Internal",
        lastName: fields.lastName ?? "Test",
        phone,
      }),
    },
  );
  // Verified live (2026-11-26): the endpoint returns { contactId: 590202925 },
  // not a full contact object.
  const body = res as { id?: number; contactId?: number };
  const cid =
    typeof body?.id === "number"
      ? body.id
      : typeof body?.contactId === "number"
        ? body.contactId
        : null;
  if (cid) return { ...(res as object), id: cid } as RespondIoContact;
  // Unknown response shape — fall back to lookup.
  return getContactByPhone(phone);
}

export async function listContacts(cursor?: string, limit = 100) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set("cursorId", cursor);
  const res = await request<{
    items: RespondIoContact[];
    pagination?: { next?: string | null };
  }>(`/contact/list?${params}`, {
    method: "POST",
    // Verified against the live workspace (2026-11-25): the API requires all
    // three fields — search (may be empty), timezone, and filter {"$and": []}.
    body: JSON.stringify({ search: "", timezone: "UTC", filter: { $and: [] } }),
  });

  // pagination.next is a FULL URL; extract its cursorId for the next call.
  let next: string | undefined;
  if (res.pagination?.next) {
    try {
      next = new URL(res.pagination.next).searchParams.get("cursorId") ?? undefined;
    } catch {
      next = undefined;
    }
  }
  return { items: res.items ?? [], pagination: { next } };
}

export async function addContactTags(
  contactId: string | number,
  tags: string[],
) {
  return request(`/contact/${contactIdentifier(contactId)}/tag`, {
    method: "POST",
    body: JSON.stringify(tags),
  });
}

// ---------- Messaging (verified: standard Developer API) ----------

/** Plain text message inside an open 24h customer-service window. */
export async function sendTextMessage(
  contactId: string | number,
  text: string,
) {
  return request<{ messageId: number }>(`/contact/${contactIdentifier(contactId)}/message`, {
    method: "POST",
    body: JSON.stringify({ message: { type: "text", text } }),
  });
}

/** Document attachment (e.g. quotation PDF) via public/signed URL. */
export async function sendDocumentMessage(
  contactId: string | number,
  fileUrl: string,
  _fileName?: string,
) {
  return request<{ messageId: number }>(`/contact/${contactIdentifier(contactId)}/message`, {
    method: "POST",
    body: JSON.stringify({
      message: { type: "attachment", attachment: { type: "file", url: fileUrl } },
    }),
  });
}

/** Image message (product sharing). */
export async function sendImageMessage(
  contactId: string | number,
  imageUrl: string,
) {
  return request<{ messageId: number }>(`/contact/${contactIdentifier(contactId)}/message`, {
    method: "POST",
    body: JSON.stringify({
      message: { type: "attachment", attachment: { type: "image", url: imageUrl } },
    }),
  });
}

/**
 * Approved WhatsApp template message (outside the 24h window).
 * Template must already be approved in the connected WABA.
 * channelId targets the WhatsApp channel (defaults to RESPOND_IO_CHANNEL_ID).
 */
export async function sendTemplateMessage(
  contactId: string | number,
  templateName: string,
  languageCode: string,
  components?: unknown[],
  channelId?: string | number,
) {
  const channel = channelId ?? respondIoConfig.channelId();
  return request<{ messageId: number }>(`/contact/${contactIdentifier(contactId)}/message`, {
    method: "POST",
    body: JSON.stringify({
      ...(channel ? { channelId: Number(channel) } : {}),
      message: {
        type: "whatsapp_template",
        template: { name: templateName, languageCode, components },
      },
    }),
  });
}

export type ChannelTemplate = {
  id: number;
  name: string;
  languageCode?: string;
  status: string;
  category?: string;
  components?: { type: string; format?: string; text?: string }[];
};

/**
 * WhatsApp templates synced on the channel (verified live 2026-11-27:
 * GET /space/channel/{id}/template). Used to populate template pickers so
 * staff never type template names by hand.
 */
export async function listChannelTemplates(
  channelId?: string | number,
): Promise<ChannelTemplate[]> {
  const channel = channelId ?? respondIoConfig.channelId();
  const res = await request<{ items: ChannelTemplate[] }>(
    `/space/channel/${channel}/template`,
  );
  return res.items ?? [];
}

/**
 * Message delivery status (verified live 2026-11-26).
 * `status` is a timeline; a "failed" entry carries Meta's reason
 * (e.g. template parameter errors). channelMessageId is set once WhatsApp
 * actually accepted the message.
 */
export async function getMessageStatus(
  contactId: string | number,
  messageId: string | number,
) {
  return request<{
    messageId: number;
    channelMessageId: string | null;
    status?: { value: string; message?: string | null; timestamp?: number }[];
  }>(`/contact/${contactIdentifier(contactId)}/message/${messageId}`);
}

// ---------- Space / channels (verified: GET /v2/space/channel tested live) ----------

export type RespondIoChannel = {
  id: number;
  name?: string;
  source?: string;
  status?: string;
};

/** List connected channels; used to verify the WhatsApp channel (582135). */
export async function listChannels() {
  return request<{ items?: RespondIoChannel[] } | RespondIoChannel[]>(
    `/space/channel`,
  );
}

/** Assign the conversation to a workspace user. verified: pending (plan-dependent). */
export async function assignConversation(
  contactId: string | number,
  assigneeId: number | null,
) {
  return request(`/contact/${contactIdentifier(contactId)}/conversation/assignee`, {
    method: "POST",
    body: JSON.stringify({ assignee: assigneeId }),
  });
}

/** Lightweight health check used by the Integrations monitor. */
export async function healthCheck(): Promise<boolean> {
  try {
    await request(`/space/users`, {}, 0);
    return true;
  } catch (e) {
    if (e instanceof RespondIoError && e.status !== 401 && e.status !== 403) {
      // 4xx other than auth may still mean the API is reachable
      return e.status < 500;
    }
    return false;
  }
}
