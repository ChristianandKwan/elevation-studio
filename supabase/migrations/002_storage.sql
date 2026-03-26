-- ══════════════════════════════════════════════════════════
--  ELEVATION STUDIO — Storage Buckets + Policies
-- ══════════════════════════════════════════════════════════

-- Create storage buckets
insert into storage.buckets (id, name, public)
values
  ('elevation-images', 'elevation-images', false),
  ('artwork-images',   'artwork-images',   false)
on conflict (id) do nothing;

-- ── ELEVATION IMAGES ─────────────────────────────────────
-- Consultants can upload/delete their own files
create policy "Consultants upload elevation images"
  on storage.objects for insert
  with check (
    bucket_id = 'elevation-images'
    and auth.uid() is not null
  );

create policy "Consultants read elevation images"
  on storage.objects for select
  using (
    bucket_id = 'elevation-images'
    and auth.uid() is not null
  );

create policy "Consultants delete elevation images"
  on storage.objects for delete
  using (
    bucket_id = 'elevation-images'
    and auth.uid() is not null
  );

-- ── ARTWORK IMAGES ───────────────────────────────────────
create policy "Consultants upload artwork images"
  on storage.objects for insert
  with check (
    bucket_id = 'artwork-images'
    and auth.uid() is not null
  );

create policy "Consultants read artwork images"
  on storage.objects for select
  using (
    bucket_id = 'artwork-images'
    and auth.uid() is not null
  );

create policy "Consultants delete artwork images"
  on storage.objects for delete
  using (
    bucket_id = 'artwork-images'
    and auth.uid() is not null
  );
