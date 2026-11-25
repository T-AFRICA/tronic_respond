-- ============================================================
-- FILE: 0001_extensions_and_enums.sql
-- ============================================================
-- TRONIC Response â€” 0001: extensions and enum types
-- All enums are defined up front so later migrations can reference them.

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm"; -- trigram search for fast product lookup

-- ----- Identity / RBAC -----
create type public.app_role as enum (
  'super_admin',
  'sales_manager',
  'sales_staff',
  'marketing_staff'
);

-- ----- Products -----
create type public.product_visibility as enum ('draft', 'published', 'archived');

create type public.product_availability as enum (
  'available',          -- normally orderable (NOT live stock â€” system is independent of SAP/POS)
  'on_request',         -- availability confirmed per quotation
  'discontinued'
);

create type public.price_type as enum ('retail', 'wholesale');

create type public.import_status as enum (
  'pending', 'validating', 'processing', 'completed', 'completed_with_errors', 'failed'
);

-- ----- Meta catalog sync -----
create type public.sync_status as enum (
  'not_synced', 'queued', 'syncing', 'synced', 'failed', 'excluded'
);

create type public.sync_job_type as enum (
  'initial_full_sync', 'incremental_update', 'image_sync', 'price_sync',
  'availability_sync', 'manual_resync', 'retry_failed'
);

create type public.sync_job_status as enum (
  'queued', 'running', 'completed', 'completed_with_errors', 'failed', 'cancelled'
);

-- ----- Customers -----
create type public.consent_channel as enum ('whatsapp_marketing', 'whatsapp_transactional');
create type public.consent_status as enum ('granted', 'revoked', 'unknown');

-- ----- RFQ / Quotations -----
create type public.rfq_source as enum (
  'whatsapp_cart',      -- native WhatsApp cart submission via Respond.io webhook
  'external_catalog',   -- optional advanced digital catalog
  'manual',             -- staff-entered fallback
  'whatsapp_message'    -- free-text request converted by staff
);

create type public.rfq_status as enum (
  'new', 'assigned', 'under_review', 'quoted', 'closed', 'cancelled'
);

create type public.quotation_status as enum (
  'new', 'assigned', 'under_review', 'prepared', 'approved', 'sent',
  'accepted', 'rejected', 'revision_requested', 'completed', 'expired', 'cancelled'
);

create type public.approval_decision as enum ('pending', 'approved', 'rejected');

-- ----- Campaigns / messaging -----
create type public.campaign_type as enum (
  'single_product', 'multi_product', 'full_catalog', 'promotional', 'new_arrivals'
);

create type public.campaign_status as enum (
  'draft', 'pending_approval', 'approved', 'scheduled', 'running',
  'completed', 'cancelled', 'rejected'
);

create type public.message_direction as enum ('outbound', 'inbound');

create type public.message_status as enum (
  'queued', 'sent', 'delivered', 'read', 'failed', 'unknown'
);

create type public.message_kind as enum (
  'text', 'template', 'product', 'product_list', 'document', 'image', 'catalog_link', 'other'
);

create type public.webhook_status as enum ('received', 'processing', 'processed', 'failed', 'ignored', 'duplicate');

create type public.notification_kind as enum (
  'rfq_created', 'rfq_assigned', 'quotation_approval_requested', 'quotation_approved',
  'quotation_rejected', 'quotation_accepted', 'quotation_revision_requested',
  'campaign_approval_requested', 'sync_failed', 'integration_down', 'system'
);


-- ============================================================
-- FILE: 0002_identity_rbac.sql
-- ============================================================
-- TRONIC Response â€” 0002: identity, RBAC, countries
-- Staff identity rides on Supabase Auth (auth.users). `profiles` is the
-- application-level mirror; roles/permissions implement RBAC enforced in
-- both the API layer and RLS policies.

create table public.countries (
  id          smallint generated always as identity primary key,
  iso2        char(2) not null unique,
  name        text not null,
  currency    char(3) not null,            -- ISO 4217
  phone_code  text not null,
  is_active   boolean not null default false,
  created_at  timestamptz not null default now()
);

comment on table public.countries is 'Country-aware foundation for future international expansion.';

insert into public.countries (iso2, name, currency, phone_code, is_active)
values ('TZ', 'Tanzania', 'TZS', '+255', true);

create table public.roles (
  id          smallint generated always as identity primary key,
  key         public.app_role not null unique,
  name        text not null,
  description text not null default ''
);

insert into public.roles (key, name, description) values
  ('super_admin',     'Super Admin',     'Complete control over products, users, permissions, customers, integrations, campaigns, quotations, analytics and settings.'),
  ('sales_manager',   'Sales Manager',   'Manage staff, assign RFQs, approve quotations, authorize discounts and monitor performance.'),
  ('sales_staff',     'Sales Staff',     'Search products, share products, review assigned RFQs, prepare quotations and communicate with customers.'),
  ('marketing_staff', 'Marketing Staff', 'Prepare campaigns, select products, manage customer segments and monitor campaign results.');

create table public.permissions (
  id          smallint generated always as identity primary key,
  key         text not null unique,        -- e.g. 'products.write', 'quotations.approve'
  description text not null default ''
);

create table public.role_permissions (
  role_id       smallint not null references public.roles(id) on delete cascade,
  permission_id smallint not null references public.permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

insert into public.permissions (key, description) values
  ('products.read',        'View products'),
  ('products.write',       'Create/edit products, imports, images'),
  ('products.publish',     'Publish/archive products'),
  ('catalog.sync',         'Trigger and manage Meta catalog synchronization'),
  ('customers.read',       'View customers and segments'),
  ('customers.write',      'Edit customers, segments, consents'),
  ('sharing.send',         'Share products directly with customers'),
  ('campaigns.read',       'View campaigns'),
  ('campaigns.write',      'Prepare campaigns'),
  ('campaigns.approve',    'Approve/reject campaigns'),
  ('rfqs.read',            'View quotation requests'),
  ('rfqs.write',           'Create/edit quotation requests'),
  ('rfqs.assign',          'Assign RFQs to staff'),
  ('quotations.read',      'View quotations'),
  ('quotations.write',     'Prepare quotations'),
  ('quotations.approve',   'Approve quotations and discounts'),
  ('quotations.send',      'Send quotations to customers'),
  ('staff.manage',         'Manage staff users'),
  ('reports.read',         'View reports and analytics'),
  ('integrations.manage',  'Manage integration settings'),
  ('audit.read',           'View audit logs'),
  ('settings.manage',      'Manage application settings');

-- Role â†’ permission matrix
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.key = 'super_admin';

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key in (
  'products.read','products.write','products.publish','customers.read','customers.write',
  'sharing.send','campaigns.read','campaigns.approve','rfqs.read','rfqs.write','rfqs.assign',
  'quotations.read','quotations.write','quotations.approve','quotations.send',
  'staff.manage','reports.read','audit.read'
) where r.key = 'sales_manager';

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key in (
  'products.read','customers.read','sharing.send',
  'rfqs.read','rfqs.write','quotations.read','quotations.write','quotations.send'
) where r.key = 'sales_staff';

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key in (
  'products.read','customers.read','customers.write',
  'campaigns.read','campaigns.write','reports.read'
) where r.key = 'marketing_staff';

create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  full_name     text not null,
  email         text not null unique,
  phone         text,
  role_id       smallint not null references public.roles(id),
  country_id    smallint not null references public.countries(id),
  is_active     boolean not null default true,
  avatar_url    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.profiles is 'Staff profiles. One row per auth.users account. Customers never get profiles â€” they live in public.customers.';

create index idx_profiles_role on public.profiles(role_id);

-- Helper: current user's role key (used by RLS policies)
create or replace function public.current_role_key()
returns public.app_role
language sql stable security definer set search_path = public
as $$
  select r.key from public.profiles p join public.roles r on r.id = p.role_id
  where p.id = auth.uid() and p.is_active;
$$;

-- Helper: does the current user hold a permission?
create or replace function public.has_permission(perm text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.profiles pr
    join public.role_permissions rp on rp.role_id = pr.role_id
    join public.permissions pe on pe.id = rp.permission_id
    where pr.id = auth.uid() and pr.is_active and pe.key = perm
  );
$$;

-- Generic updated_at trigger
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_profiles_updated before update on public.profiles
for each row execute function public.set_updated_at();


-- ============================================================
-- FILE: 0003_products.sql
-- ============================================================
-- TRONIC Response â€” 0003: product catalog domain
-- Supabase is the AUTHORITATIVE product database (10,000+ products).
-- No live stock levels: this system is independent of SAP/POS.

create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  parent_id   uuid references public.categories(id) on delete restrict,
  name        text not null,
  slug        text not null unique,
  description text not null default '',
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint categories_no_self_parent check (parent_id is distinct from id)
);

create index idx_categories_parent on public.categories(parent_id);

create table public.products (
  id                uuid primary key default gen_random_uuid(),
  sku               text not null unique,
  name              text not null,
  brand             text not null default '',
  model_number      text not null default '',
  category_id       uuid references public.categories(id) on delete set null,
  description       text not null default '',
  unit_of_measure   text not null default 'pc',
  currency          char(3) not null default 'TZS',
  availability      public.product_availability not null default 'available',
  visibility        public.product_visibility not null default 'draft',
  country_id        smallint not null references public.countries(id),
  -- Meta catalog linkage (denormalized convenience; detail lives in meta_catalog_products)
  meta_product_id   text,
  meta_sync_status  public.sync_status not null default 'not_synced',
  search_text       text generated always as (
    lower(coalesce(sku,'') || ' ' || coalesce(name,'') || ' ' || coalesce(brand,'') || ' ' || coalesce(model_number,''))
  ) stored,
  created_by        uuid references public.profiles(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index idx_products_category on public.products(category_id);
create index idx_products_visibility on public.products(visibility);
create index idx_products_sync_status on public.products(meta_sync_status);
create index idx_products_search_trgm on public.products using gin (search_text gin_trgm_ops);
create unique index idx_products_meta_id on public.products(meta_product_id) where meta_product_id is not null;

create trigger trg_products_updated before update on public.products
for each row execute function public.set_updated_at();

create table public.product_images (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products(id) on delete cascade,
  storage_path text not null,               -- Supabase Storage object path
  public_url  text not null,
  alt_text    text not null default '',
  is_primary  boolean not null default false,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

create index idx_product_images_product on public.product_images(product_id);
-- At most one primary image per product
create unique index idx_product_images_primary on public.product_images(product_id) where is_primary;

create table public.product_specifications (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products(id) on delete cascade,
  spec_key    text not null,                -- e.g. 'Voltage', 'Current rating'
  spec_value  text not null,
  unit        text not null default '',
  sort_order  int not null default 0,
  unique (product_id, spec_key)
);

create index idx_product_specs_product on public.product_specifications(product_id);
create index idx_product_specs_kv on public.product_specifications(spec_key, spec_value);

-- Price history: a new row per change; current price = latest effective row.
-- Wholesale prices are CONFIDENTIAL and never leave the backend (see RLS + sync rules).
create table public.product_prices (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references public.products(id) on delete cascade,
  price_type    public.price_type not null,
  amount        numeric(14,2) not null check (amount >= 0),
  currency      char(3) not null default 'TZS',
  effective_from timestamptz not null default now(),
  created_by    uuid references public.profiles(id),
  created_at    timestamptz not null default now()
);

create index idx_product_prices_lookup on public.product_prices(product_id, price_type, effective_from desc);

-- Convenience view: current retail/wholesale price per product
create or replace view public.current_product_prices as
select distinct on (product_id, price_type)
  product_id, price_type, amount, currency, effective_from
from public.product_prices
where effective_from <= now()
order by product_id, price_type, effective_from desc;

-- Excel/CSV import batches
create table public.product_imports (
  id            uuid primary key default gen_random_uuid(),
  file_name     text not null,
  storage_path  text,
  status        public.import_status not null default 'pending',
  total_rows    int not null default 0,
  created_rows  int not null default 0,
  updated_rows  int not null default 0,
  skipped_rows  int not null default 0,
  error_rows    int not null default 0,
  errors        jsonb not null default '[]'::jsonb,  -- [{row, sku, message}]
  started_at    timestamptz,
  finished_at   timestamptz,
  created_by    uuid not null references public.profiles(id),
  created_at    timestamptz not null default now()
);

create index idx_product_imports_status on public.product_imports(status);


-- ============================================================
-- FILE: 0004_meta_catalog.sql
-- ============================================================
-- TRONIC Response â€” 0004: Meta Product Catalog synchronization
-- Tracks the mapping between internal products and Meta catalog items,
-- plus every sync job for observability, retry and duplicate prevention.

create table public.meta_catalog_products (
  id                 uuid primary key default gen_random_uuid(),
  product_id         uuid not null unique references public.products(id) on delete cascade,
  meta_catalog_id    text not null,               -- the catalog this item lives in
  meta_product_id    text,                        -- Meta's product id (set after first push)
  retailer_id        text not null,               -- our SKU, Meta's retailer_id field â€” the stable mapping key
  sync_status        public.sync_status not null default 'not_synced',
  last_synced_at     timestamptz,
  last_payload_hash  text,                        -- skip pushes when nothing changed
  last_error         text,
  retry_count        int not null default 0,
  is_eligible        boolean not null default false,  -- passed catalog eligibility validation
  eligibility_issues jsonb not null default '[]'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (meta_catalog_id, retailer_id)           -- duplicate prevention inside a catalog
);

create index idx_meta_products_status on public.meta_catalog_products(sync_status);
create trigger trg_meta_products_updated before update on public.meta_catalog_products
for each row execute function public.set_updated_at();

create table public.catalog_sync_jobs (
  id             uuid primary key default gen_random_uuid(),
  job_type       public.sync_job_type not null,
  status         public.sync_job_status not null default 'queued',
  triggered_by   uuid references public.profiles(id),   -- null = system/scheduled
  total_items    int not null default 0,
  synced_items   int not null default 0,
  failed_items   int not null default 0,
  skipped_items  int not null default 0,
  error_summary  jsonb not null default '[]'::jsonb,
  queue_job_id   text,                                   -- BullMQ job id
  started_at     timestamptz,
  finished_at    timestamptz,
  created_at     timestamptz not null default now()
);

create index idx_sync_jobs_status on public.catalog_sync_jobs(status, created_at desc);

-- Per-item results of a sync job (drill-down + failed-product retry)
create table public.catalog_sync_job_items (
  id          uuid primary key default gen_random_uuid(),
  job_id      uuid not null references public.catalog_sync_jobs(id) on delete cascade,
  product_id  uuid not null references public.products(id) on delete cascade,
  status      public.sync_status not null,
  error       text,
  created_at  timestamptz not null default now()
);

create index idx_sync_job_items_job on public.catalog_sync_job_items(job_id);
create index idx_sync_job_items_failed on public.catalog_sync_job_items(product_id) where status = 'failed';


-- ============================================================
-- FILE: 0005_customers.sql
-- ============================================================
-- TRONIC Response â€” 0005: customers, segments, consent
-- Customers are WhatsApp contacts mirrored from Respond.io. They are NOT auth users.

create table public.customers (
  id                   uuid primary key default gen_random_uuid(),
  respondio_contact_id text unique,                -- mapping key to Respond.io
  whatsapp_phone       text not null,              -- E.164
  full_name            text not null default '',
  company_name         text not null default '',
  email                text,
  country_id           smallint not null references public.countries(id),
  tags                 text[] not null default '{}',
  notes                text not null default '',
  assigned_staff_id    uuid references public.profiles(id),
  last_contact_at      timestamptz,
  is_blocked           boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- Duplicate prevention: one customer per WhatsApp number per country
create unique index idx_customers_phone on public.customers(whatsapp_phone);
create index idx_customers_assigned on public.customers(assigned_staff_id);
create index idx_customers_tags on public.customers using gin(tags);

create trigger trg_customers_updated before update on public.customers
for each row execute function public.set_updated_at();

create table public.customer_segments (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  description text not null default '',
  -- Declarative filter (tags, last_contact window, assigned staff â€¦) evaluated at send time
  filter      jsonb not null default '{}'::jsonb,
  is_dynamic  boolean not null default false,      -- dynamic = filter re-evaluated; static = explicit members
  created_by  uuid not null references public.profiles(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger trg_segments_updated before update on public.customer_segments
for each row execute function public.set_updated_at();

create table public.customer_segment_members (
  segment_id  uuid not null references public.customer_segments(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  added_at    timestamptz not null default now(),
  primary key (segment_id, customer_id)
);

-- Marketing consent + opt-out suppression. Latest row per (customer, channel) wins.
create table public.customer_consents (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  channel     public.consent_channel not null,
  status      public.consent_status not null,
  source      text not null default '',            -- how consent was captured ('keyword_stop', 'staff', 'import'â€¦)
  recorded_by uuid references public.profiles(id), -- null = automated
  recorded_at timestamptz not null default now()
);

create index idx_consents_lookup on public.customer_consents(customer_id, channel, recorded_at desc);

-- Helper: current consent per customer/channel
create or replace view public.current_customer_consents as
select distinct on (customer_id, channel)
  customer_id, channel, status, recorded_at
from public.customer_consents
order by customer_id, channel, recorded_at desc;


-- ============================================================
-- FILE: 0006_rfq_quotations.sql
-- ============================================================
-- TRONIC Response â€” 0006: RFQs and quotations
-- A native WhatsApp cart submission becomes an RFQ â€” never a confirmed purchase.
-- An accepted quotation is never treated as a payment or completed sale.

-- Sequential human-readable references: RFQ-2026-00001, QT-2026-00001
create sequence public.rfq_ref_seq;
create sequence public.quotation_ref_seq;

create or replace function public.next_rfq_ref() returns text language sql as $$
  select 'RFQ-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.rfq_ref_seq')::text, 5, '0');
$$;

create or replace function public.next_quotation_ref() returns text language sql as $$
  select 'QT-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.quotation_ref_seq')::text, 5, '0');
$$;

create table public.rfqs (
  id                   uuid primary key default gen_random_uuid(),
  reference            text not null unique default public.next_rfq_ref(),
  customer_id          uuid not null references public.customers(id),
  respondio_contact_id text,
  source               public.rfq_source not null,
  status               public.rfq_status not null default 'new',
  customer_notes       text not null default '',
  assigned_staff_id    uuid references public.profiles(id),
  assigned_at          timestamptz,
  assigned_by          uuid references public.profiles(id),
  -- Idempotency: hash of the originating webhook/cart payload prevents duplicate RFQs
  source_message_id    text,
  idempotency_key      text unique,
  submitted_at         timestamptz not null default now(),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index idx_rfqs_status on public.rfqs(status, submitted_at desc);
create index idx_rfqs_customer on public.rfqs(customer_id);
create index idx_rfqs_assigned on public.rfqs(assigned_staff_id);

create trigger trg_rfqs_updated before update on public.rfqs
for each row execute function public.set_updated_at();

create table public.rfq_items (
  id              uuid primary key default gen_random_uuid(),
  rfq_id          uuid not null references public.rfqs(id) on delete cascade,
  product_id      uuid references public.products(id),    -- null if SKU could not be mapped
  sku             text not null,
  product_name    text not null,                          -- snapshot at submission time
  quantity        numeric(12,2) not null check (quantity > 0),
  meta_product_id text,                                   -- raw id from the WhatsApp cart payload
  raw_item        jsonb,                                  -- original payload item for audit
  mapping_status  text not null default 'mapped'
    check (mapping_status in ('mapped', 'unmapped', 'manual')),
  created_at      timestamptz not null default now()
);

create index idx_rfq_items_rfq on public.rfq_items(rfq_id);

create table public.quotations (
  id                 uuid primary key default gen_random_uuid(),
  reference          text not null unique default public.next_quotation_ref(),
  rfq_id             uuid references public.rfqs(id),
  customer_id        uuid not null references public.customers(id),
  status             public.quotation_status not null default 'new',
  version            int not null default 1,
  currency           char(3) not null default 'TZS',
  subtotal           numeric(14,2) not null default 0,
  discount_total     numeric(14,2) not null default 0,
  tax_total          numeric(14,2) not null default 0,
  delivery_charge    numeric(14,2) not null default 0,
  grand_total        numeric(14,2) not null default 0,
  valid_until        date,
  terms_conditions   text not null default '',
  internal_notes     text not null default '',
  prepared_by        uuid references public.profiles(id),
  pdf_storage_path   text,                                -- private bucket; served via signed URLs only
  sent_at            timestamptz,
  decided_at         timestamptz,                         -- accepted/rejected timestamp
  decision_notes     text not null default '',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index idx_quotations_status on public.quotations(status, created_at desc);
create index idx_quotations_customer on public.quotations(customer_id);
create index idx_quotations_rfq on public.quotations(rfq_id);

create trigger trg_quotations_updated before update on public.quotations
for each row execute function public.set_updated_at();

create table public.quotation_items (
  id              uuid primary key default gen_random_uuid(),
  quotation_id    uuid not null references public.quotations(id) on delete cascade,
  product_id      uuid references public.products(id),
  sku             text not null,
  product_name    text not null,
  quantity        numeric(12,2) not null check (quantity > 0),
  -- Historical price snapshot â€” list price at preparation time
  list_price      numeric(14,2) not null check (list_price >= 0),
  price_type      public.price_type not null default 'retail',
  unit_price      numeric(14,2) not null check (unit_price >= 0),  -- actual quoted price
  discount_pct    numeric(5,2) not null default 0 check (discount_pct between 0 and 100),
  tax_pct         numeric(5,2) not null default 0 check (tax_pct between 0 and 100),
  line_total      numeric(14,2) not null default 0,
  availability_note text not null default '',
  sort_order      int not null default 0
);

create index idx_quotation_items_quotation on public.quotation_items(quotation_id);

-- Immutable snapshots of every version sent/approved
create table public.quotation_versions (
  id            uuid primary key default gen_random_uuid(),
  quotation_id  uuid not null references public.quotations(id) on delete cascade,
  version       int not null,
  snapshot      jsonb not null,            -- full quotation + items at that moment
  pdf_storage_path text,
  created_by    uuid references public.profiles(id),
  created_at    timestamptz not null default now(),
  unique (quotation_id, version)
);

create table public.quotation_approvals (
  id            uuid primary key default gen_random_uuid(),
  quotation_id  uuid not null references public.quotations(id) on delete cascade,
  version       int not null,
  requested_by  uuid not null references public.profiles(id),
  approver_id   uuid references public.profiles(id),
  decision      public.approval_decision not null default 'pending',
  comments      text not null default '',
  requested_at  timestamptz not null default now(),
  decided_at    timestamptz
);

create index idx_quotation_approvals_pending on public.quotation_approvals(approver_id) where decision = 'pending';


-- ============================================================
-- FILE: 0007_campaigns_messaging.sql
-- ============================================================
-- TRONIC Response â€” 0007: campaigns, message logs, webhooks, notifications,
-- integration settings, audit logs, product sharing history.

create table public.campaigns (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  campaign_type  public.campaign_type not null,
  status         public.campaign_status not null default 'draft',
  -- Approved WhatsApp template reference (name/id in Respond.io / Meta)
  template_name  text not null default '',
  message_body   text not null default '',
  segment_id     uuid references public.customer_segments(id),
  scheduled_at   timestamptz,
  approved_by    uuid references public.profiles(id),
  approved_at    timestamptz,
  rejected_reason text not null default '',
  executed_via   text not null default 'respondio_native'
    check (executed_via in ('respondio_native', 'api')),  -- native Broadcast module is the initial engine
  started_at     timestamptz,
  finished_at    timestamptz,
  created_by     uuid not null references public.profiles(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index idx_campaigns_status on public.campaigns(status, created_at desc);
create trigger trg_campaigns_updated before update on public.campaigns
for each row execute function public.set_updated_at();

create table public.campaign_products (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  product_id  uuid not null references public.products(id) on delete cascade,
  sort_order  int not null default 0,
  primary key (campaign_id, product_id)
);

-- Meta multi-product messages support up to 30 products â€” enforced here as a hard stop.
create or replace function public.check_campaign_product_limit()
returns trigger language plpgsql as $$
begin
  if (select count(*) from public.campaign_products where campaign_id = new.campaign_id) >= 30 then
    raise exception 'Campaign % already has 30 products (Meta multi-product message limit)', new.campaign_id;
  end if;
  return new;
end;
$$;

create trigger trg_campaign_product_limit before insert on public.campaign_products
for each row execute function public.check_campaign_product_limit();

create table public.campaign_recipients (
  id            uuid primary key default gen_random_uuid(),
  campaign_id   uuid not null references public.campaigns(id) on delete cascade,
  customer_id   uuid not null references public.customers(id) on delete cascade,
  status        public.message_status not null default 'queued',
  suppressed    boolean not null default false,       -- opted-out at send time
  suppressed_reason text not null default '',
  sent_at       timestamptz,
  delivered_at  timestamptz,
  read_at       timestamptz,
  error         text,
  unique (campaign_id, customer_id)                    -- duplicate broadcast prevention
);

create index idx_campaign_recipients_campaign on public.campaign_recipients(campaign_id, status);

-- Every WhatsApp message we know about (sends + relevant inbound), for audit + analytics
create table public.message_logs (
  id                   uuid primary key default gen_random_uuid(),
  customer_id          uuid references public.customers(id) on delete set null,
  respondio_contact_id text,
  respondio_message_id text unique,          -- dedupe on provider message id
  direction            public.message_direction not null,
  kind                 public.message_kind not null default 'text',
  status               public.message_status not null default 'unknown',
  body_preview         text not null default '',
  payload              jsonb,
  campaign_id          uuid references public.campaigns(id) on delete set null,
  quotation_id         uuid references public.quotations(id) on delete set null,
  sent_by              uuid references public.profiles(id),
  occurred_at          timestamptz not null default now(),
  created_at           timestamptz not null default now()
);

create index idx_message_logs_customer on public.message_logs(customer_id, occurred_at desc);
create index idx_message_logs_campaign on public.message_logs(campaign_id);

-- Direct product sharing history
create table public.product_shares (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references public.customers(id) on delete cascade,
  shared_by    uuid not null references public.profiles(id),
  share_kind   text not null check (share_kind in
    ('product_message', 'image_description', 'catalog_link', 'filtered_catalog_link', 'full_catalog')),
  product_ids  uuid[] not null default '{}',
  message_log_id uuid references public.message_logs(id),
  created_at   timestamptz not null default now()
);

create index idx_product_shares_customer on public.product_shares(customer_id, created_at desc);
create index idx_product_shares_staff on public.product_shares(shared_by, created_at desc);

-- Raw webhook inbox: store-then-process with deduplication
create table public.webhook_events (
  id             uuid primary key default gen_random_uuid(),
  provider       text not null check (provider in ('respondio', 'meta')),
  event_type     text not null,
  external_id    text,                       -- provider event/message id when present
  dedupe_key     text not null unique,       -- provider + external id (or payload hash)
  status         public.webhook_status not null default 'received',
  payload        jsonb not null,
  headers        jsonb,
  error          text,
  received_at    timestamptz not null default now(),
  processed_at   timestamptz
);

create index idx_webhook_events_status on public.webhook_events(status, received_at);

create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  kind        public.notification_kind not null,
  title       text not null,
  body        text not null default '',
  link        text not null default '',     -- in-app route, e.g. /rfqs/{id}
  is_read     boolean not null default false,
  created_at  timestamptz not null default now()
);

create index idx_notifications_user on public.notifications(user_id, is_read, created_at desc);

-- Integration credentials/config. Secrets are stored ENCRYPTED by the app layer
-- (AES-256-GCM with a server-held key) â€” never plaintext.
create table public.integration_settings (
  id           uuid primary key default gen_random_uuid(),
  provider     text not null unique check (provider in ('respondio', 'meta', 'redis', 'other')),
  config       jsonb not null default '{}'::jsonb,   -- non-secret config
  secrets_enc  text,                                  -- encrypted blob of secret values
  is_enabled   boolean not null default false,
  health_status text not null default 'unknown'
    check (health_status in ('unknown', 'healthy', 'degraded', 'down')),
  last_health_check_at timestamptz,
  updated_by   uuid references public.profiles(id),
  updated_at   timestamptz not null default now()
);

create table public.audit_logs (
  id          bigint generated always as identity primary key,
  actor_id    uuid references public.profiles(id),   -- null = system
  action      text not null,                          -- 'product.update', 'quotation.approve', â€¦
  entity_type text not null,
  entity_id   text,
  before      jsonb,
  after       jsonb,
  ip_address  inet,
  created_at  timestamptz not null default now()
);

create index idx_audit_logs_entity on public.audit_logs(entity_type, entity_id);
create index idx_audit_logs_actor on public.audit_logs(actor_id, created_at desc);


-- ============================================================
-- FILE: 0008_rls_policies.sql
-- ============================================================
-- TRONIC Response â€” 0008: Row Level Security
-- Defense in depth: permissions are enforced in the API layer AND here.
-- Staff access the database through the anon/authenticated key via the app;
-- background workers and webhook handlers use the service role (bypasses RLS).

-- Enable RLS everywhere
alter table public.countries              enable row level security;
alter table public.roles                  enable row level security;
alter table public.permissions            enable row level security;
alter table public.role_permissions       enable row level security;
alter table public.profiles               enable row level security;
alter table public.categories             enable row level security;
alter table public.products               enable row level security;
alter table public.product_images         enable row level security;
alter table public.product_specifications enable row level security;
alter table public.product_prices         enable row level security;
alter table public.product_imports        enable row level security;
alter table public.meta_catalog_products  enable row level security;
alter table public.catalog_sync_jobs      enable row level security;
alter table public.catalog_sync_job_items enable row level security;
alter table public.customers              enable row level security;
alter table public.customer_segments      enable row level security;
alter table public.customer_segment_members enable row level security;
alter table public.customer_consents      enable row level security;
alter table public.rfqs                   enable row level security;
alter table public.rfq_items              enable row level security;
alter table public.quotations             enable row level security;
alter table public.quotation_items        enable row level security;
alter table public.quotation_versions     enable row level security;
alter table public.quotation_approvals    enable row level security;
alter table public.campaigns              enable row level security;
alter table public.campaign_products      enable row level security;
alter table public.campaign_recipients    enable row level security;
alter table public.message_logs           enable row level security;
alter table public.product_shares         enable row level security;
alter table public.webhook_events         enable row level security;
alter table public.notifications          enable row level security;
alter table public.integration_settings   enable row level security;
alter table public.audit_logs             enable row level security;

-- ---------- Reference data: readable by all authenticated staff ----------
create policy ref_read_countries on public.countries for select to authenticated using (true);
create policy ref_read_roles on public.roles for select to authenticated using (true);
create policy ref_read_permissions on public.permissions for select to authenticated using (true);
create policy ref_read_role_permissions on public.role_permissions for select to authenticated using (true);

-- ---------- Profiles ----------
create policy profiles_read on public.profiles for select to authenticated
  using (true);  -- staff directory is visible to all active staff
create policy profiles_self_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid() and role_id = (select role_id from public.profiles where id = auth.uid()));
create policy profiles_admin_all on public.profiles for all to authenticated
  using (public.has_permission('staff.manage')) with check (public.has_permission('staff.manage'));

-- ---------- Products domain ----------
create policy products_read on public.products for select to authenticated
  using (public.has_permission('products.read'));
create policy products_write on public.products for insert to authenticated
  with check (public.has_permission('products.write'));
create policy products_update on public.products for update to authenticated
  using (public.has_permission('products.write'));
create policy products_delete on public.products for delete to authenticated
  using (public.has_permission('products.publish'));

create policy categories_read on public.categories for select to authenticated
  using (public.has_permission('products.read'));
create policy categories_write on public.categories for all to authenticated
  using (public.has_permission('products.write')) with check (public.has_permission('products.write'));

create policy product_images_read on public.product_images for select to authenticated
  using (public.has_permission('products.read'));
create policy product_images_write on public.product_images for all to authenticated
  using (public.has_permission('products.write')) with check (public.has_permission('products.write'));

create policy product_specs_read on public.product_specifications for select to authenticated
  using (public.has_permission('products.read'));
create policy product_specs_write on public.product_specifications for all to authenticated
  using (public.has_permission('products.write')) with check (public.has_permission('products.write'));

-- Prices: retail readable by product readers; WHOLESALE only for quotation/product writers.
create policy product_prices_read_retail on public.product_prices for select to authenticated
  using (price_type = 'retail' and public.has_permission('products.read'));
create policy product_prices_read_wholesale on public.product_prices for select to authenticated
  using (price_type = 'wholesale'
         and (public.has_permission('quotations.write') or public.has_permission('products.write')));
create policy product_prices_write on public.product_prices for insert to authenticated
  with check (public.has_permission('products.write'));

create policy product_imports_rw on public.product_imports for all to authenticated
  using (public.has_permission('products.write')) with check (public.has_permission('products.write'));

-- ---------- Meta sync ----------
create policy meta_products_read on public.meta_catalog_products for select to authenticated
  using (public.has_permission('products.read'));
create policy meta_products_write on public.meta_catalog_products for all to authenticated
  using (public.has_permission('catalog.sync')) with check (public.has_permission('catalog.sync'));
create policy sync_jobs_read on public.catalog_sync_jobs for select to authenticated
  using (public.has_permission('products.read'));
create policy sync_jobs_write on public.catalog_sync_jobs for all to authenticated
  using (public.has_permission('catalog.sync')) with check (public.has_permission('catalog.sync'));
create policy sync_job_items_read on public.catalog_sync_job_items for select to authenticated
  using (public.has_permission('products.read'));

-- ---------- Customers ----------
create policy customers_read on public.customers for select to authenticated
  using (public.has_permission('customers.read'));
create policy customers_write on public.customers for all to authenticated
  using (public.has_permission('customers.write')) with check (public.has_permission('customers.write'));

create policy segments_read on public.customer_segments for select to authenticated
  using (public.has_permission('customers.read'));
create policy segments_write on public.customer_segments for all to authenticated
  using (public.has_permission('customers.write')) with check (public.has_permission('customers.write'));
create policy segment_members_read on public.customer_segment_members for select to authenticated
  using (public.has_permission('customers.read'));
create policy segment_members_write on public.customer_segment_members for all to authenticated
  using (public.has_permission('customers.write')) with check (public.has_permission('customers.write'));

create policy consents_read on public.customer_consents for select to authenticated
  using (public.has_permission('customers.read'));
create policy consents_write on public.customer_consents for insert to authenticated
  with check (public.has_permission('customers.write'));

-- ---------- RFQs ----------
-- Sales staff see RFQs assigned to them or unassigned; managers/admins see all.
create policy rfqs_read on public.rfqs for select to authenticated
  using (
    public.has_permission('rfqs.assign')
    or (public.has_permission('rfqs.read')
        and (assigned_staff_id = auth.uid() or assigned_staff_id is null))
  );
create policy rfqs_write on public.rfqs for insert to authenticated
  with check (public.has_permission('rfqs.write'));
create policy rfqs_update on public.rfqs for update to authenticated
  using (
    public.has_permission('rfqs.assign')
    or (public.has_permission('rfqs.write') and assigned_staff_id = auth.uid())
  );

create policy rfq_items_read on public.rfq_items for select to authenticated
  using (exists (select 1 from public.rfqs r where r.id = rfq_id));  -- visibility follows parent policy
create policy rfq_items_write on public.rfq_items for all to authenticated
  using (public.has_permission('rfqs.write')) with check (public.has_permission('rfqs.write'));

-- ---------- Quotations ----------
create policy quotations_read on public.quotations for select to authenticated
  using (
    public.has_permission('quotations.approve')
    or (public.has_permission('quotations.read') and prepared_by = auth.uid())
    or (public.has_permission('quotations.read') and prepared_by is null)
  );
create policy quotations_write on public.quotations for insert to authenticated
  with check (public.has_permission('quotations.write'));
create policy quotations_update on public.quotations for update to authenticated
  using (
    public.has_permission('quotations.approve')
    or (public.has_permission('quotations.write') and prepared_by = auth.uid())
  );

create policy quotation_items_rw on public.quotation_items for all to authenticated
  using (exists (select 1 from public.quotations q where q.id = quotation_id))
  with check (public.has_permission('quotations.write'));

create policy quotation_versions_read on public.quotation_versions for select to authenticated
  using (public.has_permission('quotations.read'));
create policy quotation_versions_write on public.quotation_versions for insert to authenticated
  with check (public.has_permission('quotations.write'));

create policy quotation_approvals_read on public.quotation_approvals for select to authenticated
  using (public.has_permission('quotations.read'));
create policy quotation_approvals_request on public.quotation_approvals for insert to authenticated
  with check (public.has_permission('quotations.write'));
create policy quotation_approvals_decide on public.quotation_approvals for update to authenticated
  using (public.has_permission('quotations.approve'));

-- ---------- Campaigns ----------
create policy campaigns_read on public.campaigns for select to authenticated
  using (public.has_permission('campaigns.read'));
create policy campaigns_write on public.campaigns for insert to authenticated
  with check (public.has_permission('campaigns.write'));
create policy campaigns_update on public.campaigns for update to authenticated
  using (public.has_permission('campaigns.write') or public.has_permission('campaigns.approve'));

create policy campaign_products_rw on public.campaign_products for all to authenticated
  using (public.has_permission('campaigns.read'))
  with check (public.has_permission('campaigns.write'));
create policy campaign_recipients_read on public.campaign_recipients for select to authenticated
  using (public.has_permission('campaigns.read'));

-- ---------- Messaging / sharing ----------
create policy message_logs_read on public.message_logs for select to authenticated
  using (public.has_permission('customers.read'));
create policy product_shares_read on public.product_shares for select to authenticated
  using (public.has_permission('customers.read'));
create policy product_shares_write on public.product_shares for insert to authenticated
  with check (public.has_permission('sharing.send') and shared_by = auth.uid());

-- ---------- System tables: service-role only (no authenticated policies) ----------
-- webhook_events: written/read only by service role (webhook handlers, workers).
create policy webhook_events_admin_read on public.webhook_events for select to authenticated
  using (public.has_permission('integrations.manage'));

create policy notifications_own on public.notifications for select to authenticated
  using (user_id = auth.uid());
create policy notifications_mark_read on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy integration_settings_admin on public.integration_settings for all to authenticated
  using (public.has_permission('integrations.manage'))
  with check (public.has_permission('integrations.manage'));

create policy audit_logs_read on public.audit_logs for select to authenticated
  using (public.has_permission('audit.read'));
-- audit_logs inserts happen via service role / security-definer functions only.


-- ============================================================
-- FILE: 0009_storage_buckets.sql
-- ============================================================
-- TRONIC Response â€” 0009: Supabase Storage buckets
-- product-images: public read (served in catalogs and WhatsApp messages)
-- quotations:     PRIVATE â€” PDFs served only via short-lived signed URLs
-- imports:        PRIVATE â€” uploaded Excel/CSV files

insert into storage.buckets (id, name, public)
values
  ('product-images', 'product-images', true),
  ('quotations', 'quotations', false),
  ('imports', 'imports', false)
on conflict (id) do nothing;

-- Product images: anyone can read, staff with products.write can manage
create policy "product images public read" on storage.objects
  for select using (bucket_id = 'product-images');
create policy "product images staff write" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'product-images' and public.has_permission('products.write'));
create policy "product images staff update" on storage.objects
  for update to authenticated
  using (bucket_id = 'product-images' and public.has_permission('products.write'));
create policy "product images staff delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'product-images' and public.has_permission('products.write'));

-- Quotation PDFs: only staff who can read quotations; customers get signed URLs
create policy "quotation pdfs staff read" on storage.objects
  for select to authenticated
  using (bucket_id = 'quotations' and public.has_permission('quotations.read'));
create policy "quotation pdfs staff write" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'quotations' and public.has_permission('quotations.write'));

-- Import files: product writers only
create policy "imports staff rw" on storage.objects
  for all to authenticated
  using (bucket_id = 'imports' and public.has_permission('products.write'))
  with check (bucket_id = 'imports' and public.has_permission('products.write'));


-- ============================================================
-- FILE: 0010_public_catalog_policies.sql
-- ============================================================
-- TRONIC Response â€” 0010: public (anon) read access for the optional
-- external customer catalog. Customers browse WITHOUT registration, so the
-- anon role may read ONLY public data of PUBLISHED products:
--   - published products, their images and specifications
--   - active categories
--   - RETAIL prices only (wholesale remains staff-only, never public)
-- Everything else stays closed to anon.

create policy catalog_public_products on public.products
  for select to anon
  using (visibility = 'published');

create policy catalog_public_categories on public.categories
  for select to anon
  using (is_active);

create policy catalog_public_images on public.product_images
  for select to anon
  using (
    exists (
      select 1 from public.products p
      where p.id = product_id and p.visibility = 'published'
    )
  );

create policy catalog_public_specs on public.product_specifications
  for select to anon
  using (
    exists (
      select 1 from public.products p
      where p.id = product_id and p.visibility = 'published'
    )
  );

create policy catalog_public_retail_prices on public.product_prices
  for select to anon
  using (
    price_type = 'retail'
    and exists (
      select 1 from public.products p
      where p.id = product_id and p.visibility = 'published'
    )
  );


-- ============================================================
-- FILE: 0011_offers_and_broadcast_engine.sql
-- ============================================================
-- TRONIC Response â€” 0011: Offers domain, pilot product bridge, API broadcast engine.
-- NON-DESTRUCTIVE: never drops or rewrites existing tables or imported data.
--
-- Adds:
--   * pilot_products        (created ONLY if absent â€” production already has ~98 imported rows)
--   * offers / offer_products + active_offer_products view + status sweep
--   * campaign_jobs         (BullMQ-backed execution: dry-run / internal test / live)
--   * message_templates     (approval tracking for WhatsApp templates, e.g. tronic_special_offers)
--   * system_settings       (test allowlist, live-broadcast secondary approval)
--   * offers.* permissions, campaign/recipient execution columns, RLS policies

-- ====================================================================
-- Pilot products (pre-existing in production â€” preserved, never altered)
-- ====================================================================
create table if not exists public.pilot_products (
  id                  bigint generated by default as identity primary key,
  sku                 text not null unique,
  description         text not null default '',
  category            text not null default '',
  reference_price_tzs numeric(14,2),
  offer_price_tzs     numeric(14,2),
  discount_percent    numeric(6,2),
  image_url           text,
  price_verified      boolean not null default false,
  is_published        boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table public.pilot_products is
  'Imported pilot offer list (~98 products). Source data for the Offers module â€” read-only for the app; synced into products/offers via the dashboard action.';

-- ====================================================================
-- Enums
-- ====================================================================
create type public.offer_pricing_mode as enum ('percentage', 'fixed_price', 'individual');

create type public.offer_status as enum (
  'draft', 'scheduled', 'active', 'paused', 'expired', 'cancelled'
);

create type public.campaign_job_kind as enum ('dry_run', 'test', 'live');

create type public.campaign_job_status as enum (
  'queued', 'running', 'paused', 'cancelled', 'completed', 'failed'
);

create type public.template_status as enum ('unknown', 'pending', 'approved', 'rejected');

-- ====================================================================
-- Offers
-- ====================================================================
create table public.offers (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  description    text not null default '',
  pricing_mode   public.offer_pricing_mode not null,
  -- percentage: discount %, fixed_price: price applied to every product, individual: unused
  discount_value numeric(14,2) check (discount_value is null or discount_value >= 0),
  status         public.offer_status not null default 'draft',
  starts_at      timestamptz,
  ends_at        timestamptz,
  activated_by   uuid references public.profiles(id),
  activated_at   timestamptz,
  created_by     uuid not null references public.profiles(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint offers_window_valid check (
    ends_at is null or starts_at is null or ends_at > starts_at
  )
);

create index idx_offers_status on public.offers(status, ends_at);
create trigger trg_offers_updated before update on public.offers
for each row execute function public.set_updated_at();

create table public.offer_products (
  id              uuid primary key default gen_random_uuid(),
  offer_id        uuid not null references public.offers(id) on delete cascade,
  product_id      uuid not null references public.products(id) on delete cascade,
  offer_price     numeric(14,2) not null check (offer_price >= 0),
  reference_price numeric(14,2) check (reference_price is null or reference_price >= 0),
  currency        char(3) not null default 'TZS',
  -- Pilot pricing (RE price + 2x reference + 50% badge) is an ASSUMPTION until a
  -- human verifies it. Unverified rows are never shown to customers.
  price_verified  boolean not null default false,
  verified_by     uuid references public.profiles(id),
  verified_at     timestamptz,
  created_at      timestamptz not null default now(),
  unique (offer_id, product_id)
);

create index idx_offer_products_offer on public.offer_products(offer_id);
create index idx_offer_products_product on public.offer_products(product_id);

-- One effective offer price per product: latest-activated active offer wins.
-- (The app additionally refuses to ACTIVATE an offer that overlaps an active
--  one on the same products â€” this view is the defensive tie-break.)
create or replace view public.active_offer_products as
select distinct on (op.product_id)
  op.product_id,
  p.sku,
  p.name        as product_name,
  p.category_id,
  p.visibility,
  p.search_text,
  o.id   as offer_id,
  o.name as offer_name,
  o.ends_at,
  op.offer_price,
  op.reference_price,
  op.currency,
  op.price_verified,
  case
    when op.reference_price is not null and op.reference_price > 0
    then round((1 - op.offer_price / op.reference_price) * 100)
  end as discount_percent
from public.offer_products op
join public.offers o on o.id = op.offer_id
join public.products p on p.id = op.product_id
where o.status = 'active'
  and (o.starts_at is null or o.starts_at <= now())
  and (o.ends_at is null or o.ends_at > now())
order by op.product_id, o.activated_at desc nulls last;

grant select on public.active_offer_products to anon, authenticated;

-- Scheduled activation + automatic expiry (invoked by the worker sweep / dashboard)
create or replace function public.sweep_offer_statuses()
returns void
language sql
security definer
set search_path = public
as $$
  update public.offers
     set status = 'expired'
   where status in ('active', 'scheduled')
     and ends_at is not null and ends_at <= now();

  update public.offers
     set status = 'active'
   where status = 'scheduled'
     and (starts_at is null or starts_at <= now());
$$;

-- ====================================================================
-- Campaign execution (API-based sending via Redis/BullMQ worker)
-- ====================================================================
alter table public.campaigns
  add column if not exists description text not null default '',
  add column if not exists objective   text not null default '',
  add column if not exists banner_url  text not null default '',
  add column if not exists offer_id    uuid references public.offers(id) on delete set null,
  add column if not exists is_test     boolean not null default false;

alter table public.campaign_recipients
  add column if not exists attempts             int not null default 0,
  add column if not exists last_attempt_at      timestamptz,
  add column if not exists respondio_message_id text;

create table public.campaign_jobs (
  id               uuid primary key default gen_random_uuid(),
  campaign_id      uuid not null references public.campaigns(id) on delete cascade,
  kind             public.campaign_job_kind not null,
  status           public.campaign_job_status not null default 'queued',
  batch_size       int not null default 20 check (batch_size between 1 and 200),
  batch_delay_ms   int not null default 3000 check (batch_delay_ms between 0 and 60000),
  params           jsonb not null default '{}'::jsonb,  -- e.g. {"test_numbers": ["+2557â€¦"]}
  total_recipients int not null default 0,
  processed        int not null default 0,
  sent             int not null default 0,
  failed           int not null default 0,
  skipped          int not null default 0,
  error            text,
  requested_by     uuid not null references public.profiles(id),
  started_at       timestamptz,
  finished_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index idx_campaign_jobs_campaign on public.campaign_jobs(campaign_id, created_at desc);
-- Idempotent execution: at most ONE live job ever per campaign, and at most one
-- unfinished job of any kind at a time.
create unique index idx_campaign_jobs_one_unfinished on public.campaign_jobs(campaign_id)
  where status in ('queued', 'running', 'paused');
create unique index idx_campaign_jobs_one_live on public.campaign_jobs(campaign_id)
  where kind = 'live' and status <> 'cancelled';

create trigger trg_campaign_jobs_updated before update on public.campaign_jobs
for each row execute function public.set_updated_at();

-- ====================================================================
-- WhatsApp message templates (approval verified manually against Meta/Respond.io)
-- ====================================================================
create table public.message_templates (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  language_code   text not null default 'en',
  category        text not null default 'marketing',
  status          public.template_status not null default 'unknown',
  components      jsonb,                 -- as reported by the provider, when retrievable
  channel_id      text not null default '',
  notes           text not null default '',
  last_checked_at timestamptz,
  updated_by      uuid references public.profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (name, language_code)
);

create trigger trg_message_templates_updated before update on public.message_templates
for each row execute function public.set_updated_at();

insert into public.message_templates (name, language_code, category, status, channel_id, notes)
values (
  'tronic_special_offers', 'en', 'marketing', 'pending', '582135',
  'Submitted to Meta for approval. Uses quick-reply buttons (View Offers / Request Quotation / Stop Offers) â€” quick replies do NOT open URLs; Respond.io workflows must handle the replies. Mark approved here only after verifying in Meta/Respond.io.'
)
on conflict (name, language_code) do nothing;

-- ====================================================================
-- System settings
-- ====================================================================
create table public.system_settings (
  key         text primary key,
  value       jsonb not null default '{}'::jsonb,
  description text not null default '',
  updated_by  uuid references public.profiles(id),
  updated_at  timestamptz not null default now()
);

insert into public.system_settings (key, value, description) values
  ('test_whatsapp_allowlist', '[]'::jsonb,
   'Internal WhatsApp numbers (E.164, with +) allowed to receive TEST campaign messages. Test sends to any other number are refused.'),
  ('live_broadcasting_approved', 'false'::jsonb,
   'Secondary in-app switch for live campaign sends. The server env flag ENABLE_LIVE_BROADCASTING must ALSO be true â€” both are required (fail closed).')
on conflict (key) do nothing;

-- ====================================================================
-- Permissions
-- ====================================================================
insert into public.permissions (key, description) values
  ('offers.read',     'View offers'),
  ('offers.write',    'Create/edit offers and offer prices'),
  ('offers.activate', 'Verify prices, activate/pause/cancel offers');

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r
join public.permissions p on p.key in ('offers.read', 'offers.write', 'offers.activate')
where r.key in ('super_admin', 'sales_manager')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r
join public.permissions p on p.key in ('offers.read', 'offers.write')
where r.key = 'marketing_staff'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r
join public.permissions p on p.key = 'offers.read'
where r.key = 'sales_staff'
on conflict do nothing;

-- ====================================================================
-- Row Level Security
-- ====================================================================
alter table public.pilot_products    enable row level security;
alter table public.offers            enable row level security;
alter table public.offer_products    enable row level security;
alter table public.campaign_jobs     enable row level security;
alter table public.message_templates enable row level security;
alter table public.system_settings   enable row level security;

-- pilot_products: read-only reference data for staff; writes via service role only.
create policy pilot_products_read on public.pilot_products for select to authenticated
  using (public.has_permission('products.read'));

create policy offers_read on public.offers for select to authenticated
  using (public.has_permission('offers.read'));
create policy offers_insert on public.offers for insert to authenticated
  with check (public.has_permission('offers.write'));
create policy offers_update on public.offers for update to authenticated
  using (public.has_permission('offers.write'));
create policy offers_delete on public.offers for delete to authenticated
  using (public.has_permission('offers.activate'));

create policy offer_products_read on public.offer_products for select to authenticated
  using (public.has_permission('offers.read'));
create policy offer_products_write on public.offer_products for all to authenticated
  using (public.has_permission('offers.write'))
  with check (public.has_permission('offers.write'));

create policy campaign_jobs_read on public.campaign_jobs for select to authenticated
  using (public.has_permission('campaigns.read'));
create policy campaign_jobs_insert on public.campaign_jobs for insert to authenticated
  with check (public.has_permission('campaigns.write'));
create policy campaign_jobs_update on public.campaign_jobs for update to authenticated
  using (public.has_permission('campaigns.write'));

create policy message_templates_read on public.message_templates for select to authenticated
  using (public.has_permission('campaigns.read'));
create policy message_templates_write on public.message_templates for all to authenticated
  using (public.has_permission('integrations.manage'))
  with check (public.has_permission('integrations.manage'));

create policy system_settings_read on public.system_settings for select to authenticated
  using (true);
create policy system_settings_write on public.system_settings for all to authenticated
  using (public.has_permission('settings.manage'))
  with check (public.has_permission('settings.manage'));


