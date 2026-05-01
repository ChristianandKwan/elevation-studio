-- ══════════════════════════════════════════════════════════════════
--  017_option_thumbnails.sql
--
--  Pre-computed, cached dashboard thumbnails.
--
--  Each elevation_option now owns a pre-composited PNG stored in a
--  dedicated `thumbnails` bucket. The studio regenerates the PNG
--  (server-side, via an authenticated route handler) after any write
--  that would change the rendered output. The dashboard then serves
--  a signed URL to the cached PNG instead of compositing on every
--  page load.
--
--  When `thumbnail_path` is null (legacy rows, or regen in flight)
--  the dashboard falls back to the plain elevation image URL.
-- ══════════════════════════════════════════════════════════════════

alter table elevation_options
  add column if not exists thumbnail_path text;

-- Storage bucket for composited thumbnails
insert into storage.buckets (id, name, public)
values ('thumbnails', 'thumbnails', false)
on conflict (id) do nothing;

-- RLS: any authenticated user (consultant) can read/write thumbnails.
-- Writes only come from the server-side regenerate route using the
-- service-role client, so these policies are a defence-in-depth net.
create policy "Consultants read thumbnails"
  on storage.objects for select
  using (
    bucket_id = 'thumbnails'
    and auth.uid() is not null
  );

create policy "Consultants upload thumbnails"
  on storage.objects for insert
  with check (
    bucket_id = 'thumbnails'
    and auth.uid() is not null
  );

create policy "Consultants update thumbnails"
  on storage.objects for update
  using (
    bucket_id = 'thumbnails'
    and auth.uid() is not null
  );

create policy "Consultants delete thumbnails"
  on storage.objects for delete
  using (
    bucket_id = 'thumbnails'
    and auth.uid() is not null
  );
