-- TRONIC Response — 0008: Row Level Security
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
