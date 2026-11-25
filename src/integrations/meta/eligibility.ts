import type { CatalogItemInput } from "./catalog-client";

/**
 * Catalog eligibility validation — a product may only be pushed to the Meta
 * Product Catalog when it has everything Meta requires AND nothing
 * confidential. Products that fail stay in the internal database and the
 * optional external RFQ catalog instead.
 */

export type ProductForSync = {
  id: string;
  sku: string;
  name: string;
  brand: string;
  description: string;
  currency: string;
  availability: "available" | "on_request" | "discontinued";
  visibility: "draft" | "published" | "archived";
  retail_price: number | null;
  primary_image_url: string | null;
};

export type EligibilityResult = {
  eligible: boolean;
  issues: string[];
};

const PRICE_DISCLAIMER =
  "Price is indicative and subject to quotation confirmation. Request a quotation on WhatsApp for final pricing.";

export function validateEligibility(p: ProductForSync): EligibilityResult {
  const issues: string[] = [];

  if (p.visibility !== "published") issues.push("Product is not published");
  if (!p.name || p.name.trim().length < 2) issues.push("Missing product name");
  if (!p.primary_image_url) issues.push("Missing primary product image");
  // Meta requires a published price; we comply using the retail price with
  // a quotation disclaimer. Products without a publishable retail price are
  // excluded and belong in the external RFQ catalog only.
  if (p.retail_price === null || p.retail_price <= 0)
    issues.push("No publishable retail price (use external RFQ catalog)");
  if (p.availability === "discontinued") issues.push("Product is discontinued");

  return { eligible: issues.length === 0, issues };
}

export function toCatalogItem(
  p: ProductForSync,
  catalogLinkBase?: string,
): CatalogItemInput {
  const description = [p.description?.trim(), PRICE_DISCLAIMER]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 4900);

  return {
    retailerId: p.sku,
    name: p.name.slice(0, 200),
    description,
    imageUrl: p.primary_image_url!,
    price: `${p.retail_price!.toFixed(2)} ${p.currency}`,
    currency: p.currency,
    availability: p.availability === "available" ? "in stock" : "available for order",
    brand: p.brand || undefined,
    url: catalogLinkBase ? `${catalogLinkBase}/catalog/p/${encodeURIComponent(p.sku)}` : undefined,
  };
}

/** Deterministic hash of the public payload — used to skip no-op syncs. */
export function payloadHash(item: CatalogItemInput): string {
  const str = JSON.stringify(item);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0;
  }
  return String(hash >>> 0);
}
