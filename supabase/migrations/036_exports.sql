-- ══════════════════════════════════════════════════════════
--  036 — Somewhere to put the export pack
--
--  The export produces a zip: a markdown file plus the wall renders and the
--  artwork images. It is assembled server-side and has to get to the
--  consultant's machine.
--
--  ── Why storage rather than the response body ─────────────
--
--  A pack is a few megabytes and occasionally a few tens of them. That is
--  nothing to build in memory and far too much to send back as a serverless
--  function's response, which is capped well below it. So the route writes
--  the zip here and returns a signed URL, which is exactly what the dashboard
--  thumbnails have done since 017.
--
--  ── One pack per project ──────────────────────────────────
--
--  The object is `<project_id>.zip`, overwritten on every export. That is
--  deliberate, and it is the whole of the retention policy: a bucket keyed by
--  project cannot grow without bound, and there is never a stale pack beside
--  a current one to pick the wrong one out of.
--
--  It also keeps this bucket out of /api/admin/sweep-storage, which must not
--  be pointed at it. That sweep deletes files no database row references and
--  aborts on any bucket where *nothing* matched a live row — no row anywhere
--  points at an export, so every object here would read as an orphan and the
--  run would refuse. Overwriting in place means there is nothing to sweep.
--
--  ── The policies ──────────────────────────────────────────
--
--  Writes only ever come from the export route using the service-role client,
--  and downloads happen through a signed URL, which does not consult RLS at
--  all. These policies are therefore defence-in-depth rather than the
--  mechanism — but unlike 017's, they are scoped to the owning consultant
--  rather than to any authenticated user. A pack contains a client's name,
--  the works proposed to them and what they are being charged, so "any
--  consultant may read any of these" is not a trade worth making for a bucket
--  nothing legitimately browses.
--
--  Deploy order: ADDITIVE — run this first, then deploy. It creates a bucket
--  the deployed app does not yet know about; nothing existing reads or writes
--  it, so the gap between the two is inert.
--
--  Safe to re-run: every step is idempotent.
-- ══════════════════════════════════════════════════════════

-- ── 1. The bucket ─────────────────────────────────────────

insert into storage.buckets (id, name, public)
values ('exports', 'exports', false)
on conflict (id) do nothing;

-- ── 2. Who may touch an object in it ──────────────────────
--
-- The object name is `<project_id>.zip`. The guard matches the uuid shape
-- before casting: a stray file with any other name must fail the policy, not
-- error the query with an invalid-uuid cast.

create or replace function public.owns_export_object(object_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from projects p
    where object_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.zip$'
      and p.id = left(object_name, 36)::uuid
      and p.consultant_id = auth.uid()
  );
$$;

comment on function public.owns_export_object is
  'True when the current user is the consultant on the project an export object belongs to. See migration 036.';

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'Consultants read their own exports'
  ) then
    create policy "Consultants read their own exports"
      on storage.objects for select
      using (bucket_id = 'exports' and public.owns_export_object(name));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'Consultants write their own exports'
  ) then
    create policy "Consultants write their own exports"
      on storage.objects for insert
      with check (bucket_id = 'exports' and public.owns_export_object(name));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'Consultants replace their own exports'
  ) then
    create policy "Consultants replace their own exports"
      on storage.objects for update
      using (bucket_id = 'exports' and public.owns_export_object(name));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'Consultants delete their own exports'
  ) then
    create policy "Consultants delete their own exports"
      on storage.objects for delete
      using (bucket_id = 'exports' and public.owns_export_object(name));
  end if;
end $$;
