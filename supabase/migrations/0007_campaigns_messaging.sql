-- TRONIC Response — 0007: campaigns, message logs, webhooks, notifications,
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

-- Meta multi-product messages support up to 30 products — enforced here as a hard stop.
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
-- (AES-256-GCM with a server-held key) — never plaintext.
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
  action      text not null,                          -- 'product.update', 'quotation.approve', …
  entity_type text not null,
  entity_id   text,
  before      jsonb,
  after       jsonb,
  ip_address  inet,
  created_at  timestamptz not null default now()
);

create index idx_audit_logs_entity on public.audit_logs(entity_type, entity_id);
create index idx_audit_logs_actor on public.audit_logs(actor_id, created_at desc);
