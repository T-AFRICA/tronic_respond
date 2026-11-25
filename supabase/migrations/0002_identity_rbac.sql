-- TRONIC Response — 0002: identity, RBAC, countries
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

-- Role → permission matrix
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

comment on table public.profiles is 'Staff profiles. One row per auth.users account. Customers never get profiles — they live in public.customers.';

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
