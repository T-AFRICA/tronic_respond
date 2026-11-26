/**
 * Meta Commerce Manager / Product Catalog adapter.
 *
 * Uses the official Graph API catalog batch endpoint
 * (POST /{catalog_id}/items_batch) with retailer_id = internal SKU.
 * Only PUBLIC, eligible product data is ever pushed:
 *  - retail price only — wholesale prices NEVER leave the backend
 *  - published products only
 *  - price is labeled as subject to quotation confirmation in the description
 */

const GRAPH_VERSION = process.env.META_GRAPH_API_VERSION ?? "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

export class MetaApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(message);
    this.name = "MetaApiError";
  }
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not configured`);
  return v;
}

async function graphRequest<T>(
  path: string,
  init: RequestInit = {},
  retries = 2,
): Promise<T> {
  const token = requireEnv("META_ACCESS_TOKEN");
  const url = new URL(`${GRAPH_BASE}${path}`);

  const res = await fetch(url.toString(), {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });

  if ((res.status === 429 || res.status >= 500) && retries > 0) {
    await new Promise((r) => setTimeout(r, 2000 * (3 - retries)));
    return graphRequest<T>(path, init, retries - 1);
  }

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new MetaApiError(
      `Meta Graph API ${init.method ?? "GET"} ${path} failed (${res.status})`,
      res.status,
      body,
    );
  }
  return body as T;
}

/** The public shape of a catalog item we push. NO wholesale data. */
export type CatalogItemInput = {
  retailerId: string; // internal SKU — the stable mapping key
  name: string;
  description: string;
  imageUrl: string;
  /** Retail price in minor units is not required by batch API; use "12345.00 TZS" format. */
  price: string;
  currency: string;
  availability: "in stock" | "available for order" | "discontinued";
  brand?: string;
  url?: string; // optional external catalog deep link
};

type BatchRequestEntry = {
  method: "UPDATE" | "DELETE";
  data: Record<string, unknown>;
};

/** Public catalog product page — the feed `link` field is required by Meta. */
const DEFAULT_LINK_BASE = "https://tronic-respond.vercel.app";

/**
 * Create or update items (UPDATE acts as upsert on the feed `id` — this is
 * the core of duplicate prevention: one retailer id, one catalog item).
 *
 * Verified live (2026-11-26): items_batch requires FEED-style field names
 * (id/title/image_link/link) — retailer_id/name/image_url is rejected with
 * "Can not find required field id".
 */
export async function upsertCatalogItems(items: CatalogItemInput[]) {
  const catalogId = requireEnv("META_CATALOG_ID");
  const requests: BatchRequestEntry[] = items.map((item) => ({
    method: "UPDATE",
    data: {
      id: item.retailerId,
      title: item.name,
      description: item.description,
      image_link: item.imageUrl,
      link:
        item.url ??
        `${DEFAULT_LINK_BASE}/catalog/p/${encodeURIComponent(item.retailerId)}`,
      price: item.price,
      availability: item.availability,
      condition: "new",
      ...(item.brand ? { brand: item.brand } : {}),
    },
  }));

  return graphRequest<{ handles: string[] }>(`/${catalogId}/items_batch`, {
    method: "POST",
    body: JSON.stringify({ item_type: "PRODUCT_ITEM", requests }),
  });
}

/** Remove items from the catalog (product archived/excluded). */
export async function deleteCatalogItems(retailerIds: string[]) {
  const catalogId = requireEnv("META_CATALOG_ID");
  const requests: BatchRequestEntry[] = retailerIds.map((retailerId) => ({
    method: "DELETE",
    data: { id: retailerId },
  }));
  return graphRequest<{ handles: string[] }>(`/${catalogId}/items_batch`, {
    method: "POST",
    body: JSON.stringify({ item_type: "PRODUCT_ITEM", requests }),
  });
}

/** Check batch handle status (per-item errors for the retry queue). */
export async function getBatchStatus(handle: string) {
  const catalogId = requireEnv("META_CATALOG_ID");
  return graphRequest<{
    data: { status: string; errors?: { message: string }[] }[];
  }>(`/${catalogId}/check_batch_request_status?handle=${encodeURIComponent(handle)}`);
}

/** Look up a catalog product by retailer_id (SKU) — used for mapping & verification. */
export async function findProductByRetailerId(retailerId: string) {
  const catalogId = requireEnv("META_CATALOG_ID");
  const filter = encodeURIComponent(JSON.stringify({ retailer_id: { eq: retailerId } }));
  const res = await graphRequest<{ data: { id: string; retailer_id: string }[] }>(
    `/${catalogId}/products?filter=${filter}&fields=id,retailer_id,name`,
  );
  return res.data[0] ?? null;
}

/** Catalog health check for the Integrations monitor. */
export async function healthCheck(): Promise<boolean> {
  try {
    const catalogId = requireEnv("META_CATALOG_ID");
    await graphRequest(`/${catalogId}?fields=id,name`);
    return true;
  } catch {
    return false;
  }
}
