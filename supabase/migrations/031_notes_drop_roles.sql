-- ══════════════════════════════════════════════════════════
--  031 — Notes: no roles, and a budget section
--
--  030 gave every note a role — brief, space, rationale, sourcing,
--  commercial, logistics — so the export would know which section of a
--  proposal it belonged in.
--
--  That was the wrong trade. Classifying a note is cheap for a language
--  model reading the export and expensive for a consultant writing it, and
--  the picker had to be worked through before a single word could be typed.
--  What a note is attached to cannot be inferred from its prose and stays;
--  what it is for can be, and goes. The same vocabulary survives as the
--  prompt under each heading, where it invites writing instead of
--  interrupting it.
--
--  'budget' joins the anchors. It is project-scoped like 'project' and
--  carries no foreign key: the broad shape of the money, as against the
--  per-line figures that live on the budget screen.
--
--  Deploy order: this drops a column, so it would normally be deploy-code-
--  first. It is safe in either order here, and the safety is checked rather
--  than assumed: no deployed code reads `notes` — 030's tables went in on
--  their own branch and the app that uses them has not reached production.
--  The guard below refuses to run if anybody has written a note, so it
--  cannot quietly destroy someone's text if that stops being true.
--
--  Safe to re-run: every step is idempotent.
--
--  NOTE: 028 is still reserved for the destructive works cleanup described
--  in the 026 plan. It has not been written yet.
-- ══════════════════════════════════════════════════════════

-- Refuse to drop the column if anybody has written anything. Dropping a
-- column is not recoverable, and "it was empty when I wrote this" is exactly
-- the assumption worth checking at run time rather than trusting.
--
-- Empty notes do not count. Under 030 a role had to be chosen before a box
-- appeared, so opening a note and typing nothing left a row whose only
-- content was the role this migration removes — an artefact of the friction
-- being taken out, not something anybody wrote. Those are swept below.
--
-- The check is skipped once the column is gone, so a second run of this file
-- is a no-op rather than an error.
do $$
declare
  n int;
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'notes' and column_name = 'role'
  ) then
    select count(*) into n from notes where length(btrim(body)) > 0;
    if n > 0 then
      raise exception
        'notes holds % note(s) with text in them. 031 drops notes.role — read them before running this.', n;
    end if;
  end if;
end $$;

-- Sweep the empty ones. A note with no text and no set of works attached
-- carries nothing but its role, and its role is about to stop existing.
-- Anything with a work set is kept whatever its body says: somebody chose
-- those works, and that choice is content.
do $$
declare
  n int;
begin
  delete from notes
  where length(btrim(body)) = 0
    and not exists (select 1 from note_works nw where nw.note_id = notes.id);
  get diagnostics n = row_count;
  raise notice '031: removed % empty note(s) left behind by the role picker.', n;
end $$;

alter table notes drop constraint if exists notes_role_check;
alter table notes drop column     if exists role;

-- ── The anchors, with 'budget' added ──────────────────────
alter table notes drop constraint if exists notes_anchor_type_check;
alter table notes add  constraint notes_anchor_type_check
  check (anchor_type in ('project', 'budget', 'elevation', 'option', 'work', 'artist'));

-- 'budget' behaves exactly as 'project' does: project-scoped, no foreign key.
alter table notes drop constraint if exists notes_anchor_consistent_check;
alter table notes add  constraint notes_anchor_consistent_check check (
  case anchor_type
    when 'project'   then elevation_id is null and option_id is null and work_id is null and artist_key is null
    when 'budget'    then elevation_id is null and option_id is null and work_id is null and artist_key is null
    when 'elevation' then elevation_id is not null and option_id is null and work_id is null and artist_key is null
    when 'option'    then option_id is not null and elevation_id is null and work_id is null and artist_key is null
    when 'work'      then work_id is not null and elevation_id is null and option_id is null and artist_key is null
    when 'artist'    then artist_key is not null and length(artist_key) > 0
                          and elevation_id is null and option_id is null and work_id is null
    else false
  end
);

comment on table notes is
  'Consultant notes. anchor_type says what the note is about; there is no role — the export infers what a note is for from its text and its anchor. share=private never reaches the export.';
