-- ══════════════════════════════════════════════════════════════════
--  023_option_sort_order.sql
--
--  Options get an explicit position. Until now nothing ordered
--  elevation_options: every screen showed whatever row order Postgres
--  happened to return, and that differed between the studio (physical
--  order, roughly creation order) and the client portal (index order,
--  i.e. letter order). Deleting "D" and adding a tab reused the letter
--  D, so the new tab sat at the end in the studio and back in fourth
--  place for the client.
--
--  From here on:
--    • `sort_order` is the single source of truth for position.
--    • `option` stays as a stable per-elevation KEY (it is what
--      elevations.client_picked_option points at). It is no longer
--      shown to anyone — the display letter is worked out from
--      position by src/lib/options.ts (1st = A, 2nd = B, …).
--
--  Backfill: existing rows are numbered by creation time within each
--  elevation (ties broken by letter), which is the order the studio
--  has effectively been showing. Nothing is deleted or rewritten.
--
--  Deploy order: ADDITIVE — run this migration first, then deploy.
-- ══════════════════════════════════════════════════════════════════

alter table elevation_options
  add column if not exists sort_order int not null default 0;

with ranked as (
  select id,
         row_number() over (partition by elevation_id order by created_at, option) - 1 as rn
  from elevation_options
)
update elevation_options eo
   set sort_order = ranked.rn
  from ranked
 where ranked.id = eo.id;

create index if not exists elevation_options_elevation_sort_idx
  on elevation_options (elevation_id, sort_order);

comment on column elevation_options.option is
  'Stable per-elevation key (A–Z). Not the display letter: labels are derived from sort_order position.';
comment on column elevation_options.sort_order is
  'Position within the elevation, 0-based. The only field that decides tab order.';

-- ── create_project: the two starter options take positions 0 and 1 ──
-- (Replaces 020_create_project_rpc.sql's body; signature unchanged.)
create or replace function create_project(
  p_name         text,
  p_client_name  text,
  p_budget       numeric,
  p_elev_name    text,
  p_profile_name text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_project_id   uuid;
  v_elevation_id uuid;
begin
  insert into projects (name, client_name, consultant_id, budget)
  values (p_name, p_client_name, auth.uid(), p_budget)
  returning id into v_project_id;

  insert into elevations (project_id, name, display_order)
  values (v_project_id, p_elev_name, 0)
  returning id into v_elevation_id;

  insert into elevation_options (elevation_id, option, sort_order)
  values (v_elevation_id, 'A', 0), (v_elevation_id, 'B', 1);

  insert into activity_logs (project_id, type, text)
  values (v_project_id, 'created', 'Project created by ' || p_profile_name);

  return v_project_id;
end;
$$;

-- ── reorder_elevation_options: one batched, atomic position update ──
-- The studio calls this after a drag or "Move left / right". Each id
-- takes its array position as sort_order. Runs as the caller, so RLS
-- still decides whether they may touch these rows: an id that is not
-- theirs (or not on this elevation) simply doesn't match, the count
-- comes up short, and the whole update rolls back.
create or replace function reorder_elevation_options(
  p_elevation_id uuid,
  p_option_ids   uuid[]
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_expected int := coalesce(array_length(p_option_ids, 1), 0);
  v_updated  int;
begin
  update elevation_options eo
     set sort_order = p.ord - 1
    from unnest(p_option_ids) with ordinality as p(id, ord)
   where eo.id = p.id
     and eo.elevation_id = p_elevation_id;

  get diagnostics v_updated = row_count;

  if v_updated <> v_expected then
    raise exception 'reorder_elevation_options: % of % options matched elevation %',
      v_updated, v_expected, p_elevation_id;
  end if;
end;
$$;
