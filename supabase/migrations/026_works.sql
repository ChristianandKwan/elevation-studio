-- ══════════════════════════════════════════════════════════
--  026 — Works belong to the project
--
--  Until now an artwork row belonged to one elevation option and carried
--  everything: image, size, price, notes AND where it sits on the wall. The
--  same print hung on two options was two uploads and two prices, and a work
--  the consultant had only considered had nowhere to live at all.
--
--  This migration introduces `works` — one row per work, owned by the
--  project — and turns `artworks` into the placement table: a work on an
--  option, with its position, frame and lighting. The table keeps its name
--  so the live app keeps working while this runs; its work-level columns
--  are retired by a later destructive migration (027), deployed the other
--  way round.
--
--  Deploy order: ADDITIVE — run this first, then deploy the app. Merge
--  straight after running it: until the new build is live the old code
--  inserts artworks without a work_id and writes prices to the old columns.
--  027 attaches any such stragglers.
--
--  Safe to re-run: every step is idempotent.
-- ══════════════════════════════════════════════════════════

-- ── 1. works ──────────────────────────────────────────────
create table if not exists works (
  id                    uuid primary key default gen_random_uuid(),
  project_id            uuid not null references projects(id) on delete cascade,
  artist                text not null default '',
  name                  text not null default 'Untitled',
  image_path            text null,
  w_cm                  float4 not null default 40,
  h_cm                  float4 not null default 60,
  price                 int not null default 0,
  vat_applies           boolean not null default true,
  discount_status       text not null default 'none',
  discount_percent      numeric null,
  sub_line_items        jsonb not null default '[]'::jsonb,
  note                  text not null default '',
  note_shown_to_client  boolean not null default true,
  -- Sourcing detail the proposal deck carries and the studio never held.
  year                  text null,
  medium                text null,
  edition               text null,
  source                text null,
  -- Everything the consultant looked at lives here, not only what they
  -- propose: a declined work keeps the note saying why.
  status                text not null default 'proposed',
  -- The wall a work is in mind for, whether or not it is hung on one yet.
  considered_for        uuid null references elevations(id) on delete set null,
  display_order         int not null default 0,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint works_discount_status_check
    check (discount_status in ('none', 'confirmed', 'tbc')),
  constraint works_discount_percent_check
    check (discount_percent is null or (discount_percent >= 0 and discount_percent <= 100)),
  constraint works_status_check
    check (status in ('proposed', 'considered', 'declined'))
);

create index if not exists works_project_idx on works(project_id);
-- Every read joins placements by option, and it has never had an index.
create index if not exists artworks_option_idx on artworks(option_id);

drop trigger if exists works_updated_at on works;
create trigger works_updated_at
  before update on works
  for each row execute procedure set_updated_at();

-- ── 2. RLS ─────────────────────────────────────────────────
-- Consultants only. The client portal reads through the service role (see
-- 022), so there is no client-token policy here — and never one on projects.
alter table works enable row level security;

drop policy if exists "Consultants manage works via project" on works;
create policy "Consultants manage works via project"
  on works for all using (
    exists (select 1 from projects p where p.id = works.project_id and p.consultant_id = auth.uid())
  );

-- ── 3. artworks becomes the placement table ────────────────
alter table artworks add column if not exists work_id uuid null references works(id) on delete cascade;
-- The image lives on the work now; a placement written by the new code has none.
alter table artworks alter column image_path drop not null;
-- A work is on an option at most once.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'artworks_option_work_unique') then
    alter table artworks add constraint artworks_option_work_unique unique (option_id, work_id);
  end if;
end $$;

comment on table artworks is
  'Placements: a work (see works) on an elevation option — position, frame, lighting. The work-level columns still here are legacy until migration 027 drops them.';

-- ── 4. Backfill: one work per existing artwork row ─────────
-- The work reuses the artwork row's uuid, so the two are trivially matched
-- and this block can be re-run without creating duplicates.
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

-- ── 5. delete_project collects artwork paths from works ────
-- Identical to 021 except the artwork image paths, which now hang off the
-- project rather than off its options.
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
  -- Verify the caller owns this project
  if not exists (
    select 1 from projects where id = p_id and consultant_id = auth.uid()
  ) then
    raise exception 'not found';
  end if;

  -- Collect elevation image paths
  select array_agg(eo.image_path) filter (where eo.image_path is not null)
  into v_elev_paths
  from elevation_options eo
  join elevations e on e.id = eo.elevation_id
  where e.project_id = p_id;

  -- Collect thumbnail paths
  select array_agg(eo.thumbnail_path) filter (where eo.thumbnail_path is not null)
  into v_thumb_paths
  from elevation_options eo
  join elevations e on e.id = eo.elevation_id
  where e.project_id = p_id;

  -- Collect artwork image paths — they belong to the project's works
  select array_agg(w.image_path) filter (where w.image_path is not null)
  into v_art_paths
  from works w
  where w.project_id = p_id;

  -- Delete the project; cascade removes all child rows
  delete from projects where id = p_id;

  return json_build_object(
    'elev_paths',  coalesce(v_elev_paths,  '{}'),
    'thumb_paths', coalesce(v_thumb_paths, '{}'),
    'art_paths',   coalesce(v_art_paths,   '{}')
  );
end;
$$;
