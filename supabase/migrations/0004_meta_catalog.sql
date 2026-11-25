-- TRONIC Response — 0004: Meta Product Catalog synchronization
-- Tracks the mapping between internal products and Meta catalog items,
-- plus every sync job for observability, retry and duplicate prevention.

create table public.meta_catalog_products (
  id                 uuid primary key default gen_random_uuid(),
  product_id         uuid not null unique references public.products(id) on delete cascade,
  meta_catalog_id    text not null,               -- the catalog this item lives in
  meta_product_id    text,                        -- Meta's product id (set after first push)
  retailer_id        text not null,               -- our SKU, Meta's retailer_id field — the stable mapping key
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
