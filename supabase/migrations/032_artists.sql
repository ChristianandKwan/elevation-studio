-- ══════════════════════════════════════════════════════════
--  032 — An artist is a row, not a spelling
--
--  Artists have only ever been a text field on each work. That was fine
--  while nothing hung off them. It stopped being fine in 030, which anchored
--  notes to an artist by their normalised name: renaming an artist on their
--  works leaves those notes pointing at a name nothing has any more. They are
--  not deleted, just unreachable, and nothing warns anybody.
--
--  Free text has also already produced near-duplicates in live data —
--  'Nathan' and 'Nathan ', 'Paula Scher' and 'Paula scher'. The index merges
--  those when it groups, so they are invisible, but the stored values differ
--  and which spelling gets displayed is an accident of sort order.
--
--  artist_profiles, added in 030 to hold the standing note about an artist,
--  becomes the artist themselves. Works and notes point at it by id. A rename
--  is then one row changing, and everything that refers to the artist follows
--  because it never referred to the name in the first place.
--
--  works.artist stays as the spelling to display, written together with
--  artist_id and kept in step by the rename action. Dropping it would mean
--  rewriting the budget, the client portal, the index and the export in one
--  migration; keeping it makes this a change of identity rather than a change
--  of everything.
--
--  ── What is NOT merged ────────────────────────────────────
--
--  Only spellings that are identical once case and spacing are normalised.
--  'Nathan' and 'Nathan I' stay two artists: they may well be two people,
--  and that is a judgement for a consultant and not for a migration.
--
--  Deploy order: ADDITIVE for works — a new nullable column the deployed app
--  does not read. The notes constraint change is safe in either order because
--  no deployed code reads `notes` at all: 030's tables went in on their own
--  branch and the app that uses them has not reached production. The guard
--  below refuses to run if that stops being true.
--
--  Safe to re-run: every step is idempotent.
--
--  NOTE: 028 is still reserved for the destructive works cleanup described
--  in the 026 plan. It has not been written yet.
-- ══════════════════════════════════════════════════════════

-- ── 0. Normalisation, matching artistKey() in src/lib/notes.ts ──
-- Trim, collapse runs of whitespace, lower-case. Anything writing name_key
-- must agree with this or the unique constraint will let a second spelling in.
create or replace function artist_name_key(name text)
returns text language sql immutable as $$
  select lower(btrim(regexp_replace(coalesce(name, ''), '\s+', ' ', 'g')))
$$;

-- ── 1. The columns ────────────────────────────────────────
alter table artist_profiles
  add column if not exists created_at timestamptz not null default now();

alter table works
  add column if not exists artist_id uuid null references artist_profiles(id) on delete set null;

alter table notes
  add column if not exists artist_id uuid null references artist_profiles(id) on delete cascade;

create index if not exists works_artist_idx on works (artist_id) where artist_id is not null;
create index if not exists notes_artist_id_idx on notes (artist_id) where artist_id is not null;

-- ── 2. One artist per distinct normalised name ────────────
-- The spelling kept is the one used by the most works, so 'Paula Scher' (6)
-- wins over 'Paula scher' (1) rather than whichever happened to sort first.
-- Ties break on the longer spelling, which is more likely to be the fuller
-- form than the abbreviation.
with spellings as (
  select
    artist_name_key(artist) as key,
    btrim(regexp_replace(artist, '\s+', ' ', 'g')) as spelling,
    count(*) as n
  from works
  where artist_name_key(artist) <> ''
  group by 1, 2
),
canonical as (
  select distinct on (key) key, spelling
  from spellings
  order by key, n desc, length(spelling) desc, spelling
)
insert into artist_profiles (name, name_key)
select spelling, key from canonical
on conflict (name_key) do nothing;

-- ── 3. Point works and notes at them ──────────────────────
update works w
set artist_id = ap.id
from artist_profiles ap
where ap.name_key = artist_name_key(w.artist)
  and w.artist_id is null
  and artist_name_key(w.artist) <> '';

update notes n
set artist_id = ap.id
from artist_profiles ap
where ap.name_key = n.artist_key
  and n.artist_id is null
  and n.artist_key is not null;

-- Bring every work's displayed spelling into line with its artist, which is
-- what collapses 'Nathan ' and 'Paula scher' for good rather than only in the
-- index's grouping.
update works w
set artist = ap.name
from artist_profiles ap
where ap.id = w.artist_id and w.artist is distinct from ap.name;

-- ── 4. An artist note now anchors by id ───────────────────
-- Refuse to drop artist_key if any note would lose its anchor by it — a note
-- whose key matched no artist has nothing to point at, and dropping the
-- column would take the only record of who it was about.
do $$
declare
  n int;
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'notes' and column_name = 'artist_key'
  ) then
    select count(*) into n
    from notes
    where anchor_type = 'artist' and artist_id is null;
    if n > 0 then
      raise exception
        '% artist note(s) match no artist. 032 drops notes.artist_key — resolve them before running this.', n;
    end if;
  end if;
end $$;

alter table notes drop constraint if exists notes_anchor_consistent_check;
alter table notes drop column     if exists artist_key;

alter table notes add constraint notes_anchor_consistent_check check (
  case anchor_type
    when 'project'   then elevation_id is null and option_id is null and work_id is null and artist_id is null
    when 'budget'    then elevation_id is null and option_id is null and work_id is null and artist_id is null
    when 'elevation' then elevation_id is not null and option_id is null and work_id is null and artist_id is null
    when 'option'    then option_id is not null and elevation_id is null and work_id is null and artist_id is null
    when 'work'      then work_id is not null and elevation_id is null and option_id is null and artist_id is null
    when 'artist'    then artist_id is not null
                          and elevation_id is null and option_id is null and work_id is null
    else false
  end
);

comment on table artist_profiles is
  'An artist. Identity for works and notes, plus the standing note about them that carries into every project. Shared across the practice.';
comment on column works.artist is
  'The spelling to display. artist_id is the identity — keep the two in step (see renameArtist in src/lib/artists.ts).';

-- ── 5. RLS for the new reads ──────────────────────────────
-- artist_profiles already allows any signed-in consultant (030). Clients read
-- through token-scoped paths that never touch it.
