-- TRONIC Response — 0010: public (anon) read access for the optional
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
