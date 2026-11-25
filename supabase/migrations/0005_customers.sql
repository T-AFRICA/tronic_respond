-- TRONIC Response — 0005: customers, segments, consent
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
  -- Declarative filter (tags, last_contact window, assigned staff …) evaluated at send time
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
  source      text not null default '',            -- how consent was captured ('keyword_stop', 'staff', 'import'…)
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
