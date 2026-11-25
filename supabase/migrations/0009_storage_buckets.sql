-- TRONIC Response — 0009: Supabase Storage buckets
-- product-images: public read (served in catalogs and WhatsApp messages)
-- quotations:     PRIVATE — PDFs served only via short-lived signed URLs
-- imports:        PRIVATE — uploaded Excel/CSV files

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
