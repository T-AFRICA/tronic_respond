-- TRONIC Response — 0006: RFQs and quotations
-- A native WhatsApp cart submission becomes an RFQ — never a confirmed purchase.
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
  -- Historical price snapshot — list price at preparation time
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
