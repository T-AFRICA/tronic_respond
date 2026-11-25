-- TRONIC Response — 0003: product catalog domain
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
