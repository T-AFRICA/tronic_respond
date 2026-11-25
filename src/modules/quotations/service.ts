import type { QuotationStatus } from "@/lib/types";

/**
 * Quotation domain rules: totals computation, the status machine, and the
 * approval policy. Pure functions — persistence lives in the server actions.
 */

export type QuotationLineInput = {
  id?: string; // existing quotation_items id (absent for new lines)
  product_id: string | null;
  sku: string;
  product_name: string;
  quantity: number;
  list_price: number;
  price_type: "retail" | "wholesale";
  unit_price: number;
  discount_pct: number;
  tax_pct: number;
  availability_note: string;
};

export type QuotationTotals = {
  subtotal: number;
  discount_total: number;
  tax_total: number;
  grand_total: number;
  lines: (QuotationLineInput & { line_total: number })[];
};

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Per line: base = qty × unit_price; discount = base × disc%;
 * tax = (base − discount) × tax%; line_total = base − discount + tax.
 * Quotation: subtotal = Σ base; grand = subtotal − discounts + taxes + delivery.
 */
export function computeTotals(
  lines: QuotationLineInput[],
  deliveryCharge: number,
): QuotationTotals {
  let subtotal = 0;
  let discountTotal = 0;
  let taxTotal = 0;

  const computed = lines.map((line) => {
    const base = line.quantity * line.unit_price;
    const discount = base * (line.discount_pct / 100);
    const tax = (base - discount) * (line.tax_pct / 100);
    subtotal += base;
    discountTotal += discount;
    taxTotal += tax;
    return { ...line, line_total: round2(base - discount + tax) };
  });

  return {
    subtotal: round2(subtotal),
    discount_total: round2(discountTotal),
    tax_total: round2(taxTotal),
    grand_total: round2(subtotal - discountTotal + taxTotal + (deliveryCharge || 0)),
    lines: computed,
  };
}

/** Statuses in which line items and terms may still be edited. */
export const EDITABLE_STATUSES: QuotationStatus[] = [
  "new",
  "assigned",
  "under_review",
  "prepared",
  "revision_requested",
];

/** Allowed transitions of the quotation status machine (spec §12). */
const TRANSITIONS: Record<QuotationStatus, QuotationStatus[]> = {
  new: ["assigned", "under_review", "cancelled"],
  assigned: ["under_review", "cancelled"],
  under_review: ["prepared", "cancelled"],
  prepared: ["approved", "under_review", "cancelled"],
  approved: ["sent", "under_review", "cancelled"],
  sent: ["accepted", "rejected", "revision_requested", "expired", "cancelled"],
  accepted: ["completed"],
  rejected: [],
  revision_requested: ["under_review", "cancelled"],
  completed: [],
  expired: ["under_review", "cancelled"],
  cancelled: [],
};

export function canTransition(
  from: QuotationStatus,
  to: QuotationStatus,
): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Approval policy: any discount (line % or implicit — unit price below list
 * price) requires manager approval. Undiscounted quotations may be approved
 * by their preparer directly.
 */
export function requiresManagerApproval(lines: QuotationLineInput[]): boolean {
  return lines.some(
    (l) => l.discount_pct > 0 || l.unit_price < l.list_price,
  );
}
