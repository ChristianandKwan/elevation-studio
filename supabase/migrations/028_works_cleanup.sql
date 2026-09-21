-- ══════════════════════════════════════════════════════════
--  028 — The works cleanup (DESTRUCTIVE)
--
--  The last step of the split that 026 began. 026 moved every fact about a
--  work — its artist, name, image, size, price and commercial fields — out
--  of `artworks` and into `works`, leaving `artworks` as the placement table:
--  which work hangs on which option, where, and how it is framed and lit.
--
--  The moved columns were left in place so 026 could be undone by reverting
--  the code alone. That window is closed: the app has been reading through
--  `work:works(...)` since 026 shipped, and every one of the columns below
--  is now dead weight that only invites a future session to write to it.
--
--  `framing_status` and `framing_cost` go the same way. 024 copied the cost
--  into a sub line item and stopped reading the columns, and said a later
--  migration would retire them "deployed the other way round". This is it.
--
--  ── Deploy order: DESTRUCTIVE — DEPLOY THE CODE FIRST ─────
--
--  This is the reverse of 026, 027, 029–032, all of which were additive and
--  ran before their code. Here the live app must already be the one that
--  reads through `works`. Merge `dev` → `main`, wait for Vercel, THEN run
--  this. Run it first and the production app loses the columns it is still
--  selecting.
--
--  ── Safe to re-run ────────────────────────────────────────
--
--  Every step is idempotent: `if exists` guards on the drops, `on conflict
--  do nothing` on the backfill, and a `set not null` that is a no-op once
--  it has taken.
-- ══════════════════════════════════════════════════════════


-- ── 1. Stragglers ─────────────────────────────────────────
-- A placement written by the old code in the gap between 026 running and its
-- code deploying would have no `work_id`. 026 said 028 would re-run the
-- backfill for these; at the time of writing the live database has none, but
-- the step stays because "none today" is not a guarantee and this must run
-- before the columns it reads are dropped.

insert into works (
  id, project_id, artist, name, image_path, w_cm, h_cm, price,
  vat_applies, discount_status, discount_percent, sub_line_items,
  note, note_shown_to_client, status, considered_for, display_order, created_at
)
select
  a.id, e.project_id, a.artist, a.name, a.image_path, a.w_cm, a.h_cm, a.price,
  a.vat_applies, a.discount_status, a.discount_percent, a.sub_line_items,
  a.note, a.note_shown_to_client, 'proposed', e.id, a.display_order, a.created_at
from artworks a
join elevation_options eo on eo.id = a.option_id
join elevations e on e.id = eo.elevation_id
where a.work_id is null
on conflict (id) do nothing;

update artworks
set work_id = id
where work_id is null
  and exists (select 1 from works w where w.id = artworks.id);

-- A work backfilled just now would have no `artist_id`, which is the very
-- orphaning 032 existed to stop. Mint any missing artist and point the work
-- at them, exactly as 032 does — same normalisation, same conflict rule.
insert into artist_profiles (name, name_key)
select distinct
  btrim(regexp_replace(w.artist, '\s+', ' ', 'g')),
  artist_name_key(w.artist)
from works w
where w.artist_id is null
  and artist_name_key(w.artist) <> ''
on conflict (name_key) do nothing;

update works w
set artist_id = ap.id
from artist_profiles ap
where ap.name_key = artist_name_key(w.artist)
  and w.artist_id is null
  and artist_name_key(w.artist) <> '';

update works w
set artist = ap.name
from artist_profiles ap
where ap.id = w.artist_id and w.artist is distinct from ap.name;


-- ── 2. Refuse rather than half-finish ─────────────────────
-- `set not null` would fail on its own, but it fails without saying how many
-- rows are wrong or which project they are in. A destructive migration should
-- stop with something a person can act on.

do $$
declare
  n int;
begin
  select count(*) into n from artworks where work_id is null;
  if n > 0 then
    raise exception
      '% placement(s) still have no work_id and the backfill above could not attach them. '
      'They are orphans — their option or elevation is gone. Resolve them before running 028.', n;
  end if;
end $$;


-- ── 3. A placement without a work is meaningless ──────────

alter table artworks alter column work_id set not null;


-- ── 4. The moved columns go ───────────────────────────────
-- Postgres drops a check constraint with the column it depends on, but naming
-- them makes the intent legible and keeps the migration honest if a constraint
-- is ever widened to span two columns.

alter table artworks drop constraint if exists artworks_framing_status_check;
alter table artworks drop constraint if exists artworks_discount_status_check;
alter table artworks drop constraint if exists artworks_discount_percent_check;

alter table artworks
  drop column if exists name,
  drop column if exists artist,
  drop column if exists image_path,
  drop column if exists w_cm,
  drop column if exists h_cm,
  drop column if exists price,
  drop column if exists note,
  drop column if exists note_shown_to_client,
  drop column if exists vat_applies,
  drop column if exists discount_status,
  drop column if exists discount_percent,
  drop column if exists sub_line_items,
  drop column if exists framing_status,
  drop column if exists framing_cost;

-- `display_order` stays. It is the placement's order on its wall, it is in
-- PLACEMENT_COLUMNS, and placementsToArtworks sorts on it. `works` has its
-- own display_order for the index; the two are not the same thing.


-- ── 5. delete_project, re-asserted ────────────────────────
-- 026 redefined this to collect artwork paths from `works` instead of from
-- `artworks.image_path`. If that step did not take for any reason, the column
-- it reads is about to disappear and project deletion breaks silently — the
-- function is only exercised when a consultant deletes a project. Re-asserting
-- it here costs nothing and closes the question. Body identical to 026's.

create or replace function delete_project(p_id uuid)
returns json
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_elev_paths  text[];
  v_thumb_paths text[];
  v_art_paths   text[];
begin
  if not exists (
    select 1 from projects where id = p_id and consultant_id = auth.uid()
  ) then
    raise exception 'not found';
  end if;

  select array_agg(eo.image_path) filter (where eo.image_path is not null)
  into v_elev_paths
  from elevation_options eo
  join elevations e on e.id = eo.elevation_id
  where e.project_id = p_id;

  select array_agg(eo.thumbnail_path) filter (where eo.thumbnail_path is not null)
  into v_thumb_paths
  from elevation_options eo
  join elevations e on e.id = eo.elevation_id
  where e.project_id = p_id;

  select array_agg(w.image_path) filter (where w.image_path is not null)
  into v_art_paths
  from works w
  where w.project_id = p_id;

  delete from projects where id = p_id;

  return json_build_object(
    'elev_paths',  coalesce(v_elev_paths,  '{}'),
    'thumb_paths', coalesce(v_thumb_paths, '{}'),
    'art_paths',   coalesce(v_art_paths,   '{}')
  );
end;
$$;


-- ── 6. Say what the table is now ──────────────────────────

comment on table artworks is
  'Placements: a work (works) on an elevation option — where it hangs, and how it is framed, mounted and lit. Every fact about the work itself lives on works.';
comment on column artworks.work_id is
  'The work this placement shows. Required since 028.';
