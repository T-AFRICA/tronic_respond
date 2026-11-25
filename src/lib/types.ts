// Shared domain types — mirror of the database enums (0001_extensions_and_enums.sql)

export type AppRole =
  | "super_admin"
  | "sales_manager"
  | "sales_staff"
  | "marketing_staff";

export type ProductVisibility = "draft" | "published" | "archived";
export type ProductAvailability = "available" | "on_request" | "discontinued";
export type PriceType = "retail" | "wholesale";

export type SyncStatus =
  | "not_synced"
  | "queued"
  | "syncing"
  | "synced"
  | "failed"
  | "excluded";

export type RfqSource =
  | "whatsapp_cart"
  | "external_catalog"
  | "manual"
  | "whatsapp_message";

export type RfqStatus =
  | "new"
  | "assigned"
  | "under_review"
  | "quoted"
  | "closed"
  | "cancelled";

export type QuotationStatus =
  | "new"
  | "assigned"
  | "under_review"
  | "prepared"
  | "approved"
  | "sent"
  | "accepted"
  | "rejected"
  | "revision_requested"
  | "completed"
  | "expired"
  | "cancelled";

export type CampaignStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "scheduled"
  | "running"
  | "completed"
  | "cancelled"
  | "rejected";

export interface Product {
  id: string;
  sku: string;
  name: string;
  brand: string;
  model_number: string;
  category_id: string | null;
  description: string;
  unit_of_measure: string;
  currency: string;
  availability: ProductAvailability;
  visibility: ProductVisibility;
  meta_product_id: string | null;
  meta_sync_status: SyncStatus;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  parent_id: string | null;
  name: string;
  slug: string;
  sort_order: number;
  is_active: boolean;
}

export interface Customer {
  id: string;
  respondio_contact_id: string | null;
  whatsapp_phone: string;
  full_name: string;
  company_name: string;
  email: string | null;
  tags: string[];
  assigned_staff_id: string | null;
  last_contact_at: string | null;
}

export interface Rfq {
  id: string;
  reference: string;
  customer_id: string;
  source: RfqSource;
  status: RfqStatus;
  customer_notes: string;
  assigned_staff_id: string | null;
  submitted_at: string;
}

export interface RfqItem {
  id: string;
  rfq_id: string;
  product_id: string | null;
  sku: string;
  product_name: string;
  quantity: number;
  mapping_status: "mapped" | "unmapped" | "manual";
}

export interface Quotation {
  id: string;
  reference: string;
  rfq_id: string | null;
  customer_id: string;
  status: QuotationStatus;
  version: number;
  currency: string;
  subtotal: number;
  discount_total: number;
  tax_total: number;
  delivery_charge: number;
  grand_total: number;
  valid_until: string | null;
  prepared_by: string | null;
}
