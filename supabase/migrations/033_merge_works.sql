-- ══════════════════════════════════════════════════════════
--  033 — Merging two works into one
--
--  Before 026 a work could not be shared across options, so hanging the same
--  print on two options meant uploading it twice. The 026 plan said plainly
--  that the backfill would not merge those — "a merge action is a follow-up"
--  — and left the duplicates visible in the Index rather than guessing. This
--  is that follow-up.
--
--  Nepean is the case in hand: 23 work rows for 14 actual prints, nine of
--  them uploaded twice with a file each.
--
--  ── Why a function and not four statements from the client ──
--
--  A merge touches four tables and must not half-happen. If the placements
--  move and the note sets do not, a note ends up pointing at a work that has
--  been deleted — or worse, the client fails between the update and the
--  delete and the project keeps both works with the placements piled onto
--  one. A function is one statement to the client and one transaction to
--  Postgres, which is the only way this is safe over an unreliable network.
--
--  ── The two collisions it has to absorb ───────────────────
--
--  `artworks` is unique on (option_id, work_id) and `note_works` is keyed on
--  (note_id, work_id). If both works are on the same option, or one note
--  covers both, moving the row would violate that key. In both cases the
--  answer is the same: the keeper is already there, so the loser's row is
--  redundant and is dropped rather than moved. The count comes back in the
--  result so the app can say so — dropping a placement changes what is on a
--  wall, and the consultant should be told, not surprised.
--
--  ── The image ─────────────────────────────────────────────
--
--  Normally the keeper's image wins and the loser's file is deleted by the
--  caller, using the path returned here. But a work added by hand has no
--  image, and merging an uploaded duplicate into it would otherwise throw the
--  only picture away. So if the keeper has no image and the loser does, the
--  keeper adopts the path and nothing is returned for deletion.
--
--  Deploy order: ADDITIVE — run this first, then deploy. It creates a
--  function nothing calls yet.
--
--  Safe to re-run: `create or replace`.
-- ══════════════════════════════════════════════════════════

create or replace function merge_works(p_keep uuid, p_drop uuid)
returns json
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_keep_project  uuid;
  v_drop_project  uuid;
  v_keep_path     text;
  v_drop_path     text;
  v_adopted_image boolean := false;
  v_moved         int;
  v_dropped       int;
  v_notes_moved   int;
begin
  if p_keep = p_drop then
    raise exception 'a work cannot be merged into itself';
  end if;

  select project_id, image_path into v_keep_project, v_keep_path from works where id = p_keep;
  select project_id, image_path into v_drop_project, v_drop_path from works where id = p_drop;

  if v_keep_project is null or v_drop_project is null then
    raise exception 'not found';
  end if;

  -- Two projects' works are never the same print, and merging across them
  -- would move a placement onto an option in a project it does not belong to.
  if v_keep_project <> v_drop_project then
    raise exception 'those works are in different projects';
  end if;

  -- RLS would refuse the writes below anyway; this makes the refusal explicit
  -- and gives the same 'not found' a missing work gives, so the function never
  -- reveals that a work exists in someone else's project.
  if not exists (
    select 1 from projects where id = v_keep_project and consultant_id = auth.uid()
  ) then
    raise exception 'not found';
  end if;

  -- ── Placements ──
  -- Redundant first: the keeper already hangs on that option.
  delete from artworks a
  where a.work_id = p_drop
    and exists (
      select 1 from artworks b
      where b.work_id = p_keep and b.option_id = a.option_id
    );
  get diagnostics v_dropped = row_count;

  update artworks set work_id = p_keep where work_id = p_drop;
  get diagnostics v_moved = row_count;

  -- ── Notes covering a set of works ──
  -- Same rule: if the note already covers the keeper, the loser's row goes.
  delete from note_works nw
  where nw.work_id = p_drop
    and exists (
      select 1 from note_works keep
      where keep.note_id = nw.note_id and keep.work_id = p_keep
    );

  update note_works set work_id = p_keep where work_id = p_drop;

  -- ── Notes anchored to the work itself ──
  update notes set work_id = p_keep where work_id = p_drop;
  get diagnostics v_notes_moved = row_count;

  -- ── The image ──
  if v_keep_path is null and v_drop_path is not null then
    update works set image_path = v_drop_path where id = p_keep;
    v_adopted_image := true;
  end if;

  delete from works where id = p_drop;

  return json_build_object(
    -- The file to delete, or null when there is nothing to delete: the loser
    -- had no image, or the keeper has just adopted it.
    'image_path',         case when v_adopted_image then null else v_drop_path end,
    'placements_moved',   v_moved,
    'placements_dropped', v_dropped,
    'notes_moved',        v_notes_moved,
    'adopted_image',      v_adopted_image
  );
end;
$$;

comment on function merge_works(uuid, uuid) is
  'Fold one work into another: placements, note sets and note anchors move, the loser is deleted. Returns the image path the caller should remove from storage, or null when there is none. See migration 033.';
