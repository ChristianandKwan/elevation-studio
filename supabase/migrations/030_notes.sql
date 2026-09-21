-- ══════════════════════════════════════════════════════════
--  030 — Notes
--
--  Everything a consultant knows about a project that is not a number or a
--  picture: what the client asked for, what the room is like, why a work was
--  proposed or declined, who represents an artist and what their lead time
--  is, how a price was put together, how the thing gets delivered.
--
--  These used to live in a proposal deck and never came back. They are what
--  the export has to assemble, and they cannot be assembled from prices and
--  positions.
--
--  ── The shape ────────────────────────────────────────────
--
--  A note is one body of text with two independent properties:
--
--    * what it is ABOUT  — the project, an elevation, an option, one work,
--                          or an artist
--    * what it is FOR    — brief, space, rationale, sourcing, commercial,
--                          or logistics
--
--  These are separate on purpose. "Why this pair is discounted" and "why
--  this pair suits the room" are both notes on an option; they differ only
--  in what they are for. Modelling them as different kinds of note would
--  mean a table and an editor each, and they would drift.
--
--  An artist note can be narrowed to some of that artist's works through
--  note_works — "these four came from the same consignment" — without that
--  set having to be an elevation or an option.
--
--  ── What is deliberately NOT here ────────────────────────
--
--  The budget's own notes (artworks.note, works.note, sub_line_items, the
--  option consultant_note from 024) stay exactly where they are. They are
--  load-bearing in the budget screen and already visible to clients. The
--  export rejoins the two sets; migrating them would mean a destructive
--  migration through working, client-facing code for no gain today.
--
--  Deploy order: ADDITIVE — run this first, then deploy. Three new tables
--  that no deployed code reads.
--
--  Safe to re-run: every step is idempotent.
--
--  NOTE: 028 is still reserved for the destructive works cleanup described
--  in the 026 plan. It has not been written yet.
-- ══════════════════════════════════════════════════════════

-- ── 1. Notes ──────────────────────────────────────────────
--
-- The anchor is four nullable foreign keys rather than one polymorphic id,
-- so Postgres can cascade: delete an elevation and its notes go with it.
-- A polymorphic anchor_id would take no foreign key at all and would leave
-- notes pointing at rows that no longer exist.
create table if not exists notes (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references projects(id) on delete cascade,

  anchor_type   text not null,
  elevation_id  uuid null references elevations(id)         on delete cascade,
  option_id     uuid null references elevation_options(id)  on delete cascade,
  work_id       uuid null references works(id)              on delete cascade,
  -- Artists are a name on a work, not a row, so an artist note is keyed by
  -- the same normalised name the artist picker already groups on.
  artist_key    text null,

  role          text not null,
  body          text not null default '',

  -- Some of what a consultant writes is never for the client: what a gallery
  -- owes them, why they steered a client off something. The export reads
  -- 'proposal' notes only. This exists from the first row rather than being
  -- added once the export is built and the notes are already written.
  share         text not null default 'proposal',

  display_order int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint notes_anchor_type_check
    check (anchor_type in ('project', 'elevation', 'option', 'work', 'artist')),

  -- Six roles, chosen to match the sections a proposal actually has rather
  -- than to describe the text. Lead times are sourcing; delivery, access and
  -- installation are logistics.
  constraint notes_role_check
    check (role in ('brief', 'space', 'rationale', 'sourcing', 'commercial', 'logistics')),

  constraint notes_share_check
    check (share in ('proposal', 'private')),

  -- Exactly the column the anchor names, and no other. Without this a note
  -- could claim to be about an elevation while carrying a work id.
  constraint notes_anchor_consistent_check check (
    case anchor_type
      when 'project'   then elevation_id is null and option_id is null and work_id is null and artist_key is null
      when 'elevation' then elevation_id is not null and option_id is null and work_id is null and artist_key is null
      when 'option'    then option_id is not null and elevation_id is null and work_id is null and artist_key is null
      when 'work'      then work_id is not null and elevation_id is null and option_id is null and artist_key is null
      when 'artist'    then artist_key is not null and length(artist_key) > 0
                            and elevation_id is null and option_id is null and work_id is null
      else false
    end
  )
);

create index if not exists notes_project_idx   on notes (project_id);
create index if not exists notes_elevation_idx on notes (elevation_id) where elevation_id is not null;
create index if not exists notes_option_idx    on notes (option_id)    where option_id    is not null;
create index if not exists notes_work_idx      on notes (work_id)      where work_id      is not null;
create index if not exists notes_artist_idx    on notes (project_id, artist_key) where artist_key is not null;

comment on table notes is
  'Consultant notes. anchor_type says what the note is about; role says what it is for. share=private never reaches the export.';
comment on column notes.artist_key is
  'lower(trim(artist)) — artists are a name on works, not a row. See artistKey() in src/lib/notes.ts.';

-- ── 2. Narrowing an artist note to some of their works ────
--
-- "These four are from the same consignment." The set is chosen by hand and
-- has nothing to do with which option the works sit on, which is why it
-- cannot be expressed by any of the anchors above.
create table if not exists note_works (
  note_id uuid not null references notes(id) on delete cascade,
  work_id uuid not null references works(id) on delete cascade,
  primary key (note_id, work_id)
);

comment on table note_works is
  'Optional narrowing for an artist note: the works it applies to. Empty means the note is about the artist generally.';

-- ── 3. Standing notes about an artist ─────────────────────
--
-- Who represents them, what their lead times run to, the history with the
-- gallery — true of the artist wherever they hang, so it is written once and
-- carried into every project. A project can still add its own artist note on
-- top; this is the part that would otherwise be retyped.
--
-- Studio-wide rather than per consultant: a gallery relationship belongs to
-- the practice, not to whoever happened to open the project.
create table if not exists artist_profiles (
  id         uuid primary key default gen_random_uuid(),
  -- As the consultant spells it, for display.
  name       text not null,
  -- lower(trim(name)), so two spellings of one artist are one artist.
  name_key   text not null unique,
  note       text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint artist_profiles_name_key_check check (length(name_key) > 0)
);

comment on table artist_profiles is
  'Standing note about an artist, shared by every project. Keyed by normalised name because artists are a text field on works, not a table.';

-- ── 4. RLS ────────────────────────────────────────────────
--
-- Clients read through the token-scoped views only (see 022), and notes are
-- not shown in the portal at all in this piece, so there is no client policy
-- here.
alter table notes          enable row level security;
alter table note_works     enable row level security;
alter table artist_profiles enable row level security;

drop policy if exists "Consultants manage notes via project" on notes;
create policy "Consultants manage notes via project"
  on notes for all using (
    exists (select 1 from projects p where p.id = notes.project_id and p.consultant_id = auth.uid())
  );

drop policy if exists "Consultants manage note_works via note" on note_works;
create policy "Consultants manage note_works via note"
  on note_works for all using (
    exists (
      select 1 from notes n
      join projects p on p.id = n.project_id
      where n.id = note_works.note_id and p.consultant_id = auth.uid()
    )
  );

-- Shared across the practice: any signed-in consultant reads and writes them.
drop policy if exists "Consultants manage artist profiles" on artist_profiles;
create policy "Consultants manage artist profiles"
  on artist_profiles for all using (auth.uid() is not null);
