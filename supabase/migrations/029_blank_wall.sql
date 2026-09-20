-- ══════════════════════════════════════════════════════════
--  029 — Blank-wall elevations
--
--  An elevation is normally a photograph of a real wall. It can now also be
--  a wall that exists only as a measurement — "the east wall is 420 × 260,
--  painted off-white" — with no photograph at all. The room is often not
--  built yet, or nobody took a usable picture of it.
--
--  A plain wall stores its real size and its colour. Everything else about
--  it is derived: the pixel dimensions in orig_w / orig_h and the
--  scale_px_per_cm that follows from them are written at the same time by
--  src/lib/wall.ts, so a plain wall needs no calibration line — it already
--  knows how big it is. Nothing is uploaded; the wall is drawn as flat
--  colour by each of the four renderers.
--
--  image_path stays null for a plain wall, and that is what tells the two
--  kinds apart: a photograph has a path, a plain wall has a colour.
--
--  Deploy order: ADDITIVE — run this first, then deploy. The currently
--  deployed code neither reads nor writes these columns, and an option with
--  no image_path already renders as an empty canvas there, so the gap
--  between the two is harmless.
--
--  Safe to re-run: every step is idempotent.
--
--  NOTE: 028 is still reserved for the destructive works cleanup described
--  in the 026 plan. It has not been written yet.
-- ══════════════════════════════════════════════════════════

alter table elevation_options
  add column if not exists wall_w_cm  float4 null,
  add column if not exists wall_h_cm  float4 null,
  add column if not exists wall_color text   null;

-- Bounds match WALL_MIN_CM / WALL_MAX_CM in src/lib/wall.ts. Twenty metres is
-- past any wall anyone hangs pictures on, and ten centimetres is past any wall
-- worth drawing; both are here to catch a typo, not to express taste.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'elevation_options_wall_size_check') then
    alter table elevation_options add constraint elevation_options_wall_size_check
      check (
        (wall_w_cm is null or (wall_w_cm >= 10 and wall_w_cm <= 2000)) and
        (wall_h_cm is null or (wall_h_cm >= 10 and wall_h_cm <= 2000))
      );
  end if;
end $$;

-- Any colour can be chosen, so this is a format check rather than a list.
-- Stored lower-case six-digit hex so two spellings of one colour compare equal.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'elevation_options_wall_color_check') then
    alter table elevation_options add constraint elevation_options_wall_color_check
      check (wall_color is null or wall_color ~ '^#[0-9a-f]{6}$');
  end if;
end $$;

-- A plain wall is a colour *and* a size: half of one is a row no renderer can
-- draw. A photographed wall has none of the three.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'elevation_options_wall_complete_check') then
    alter table elevation_options add constraint elevation_options_wall_complete_check
      check (
        (wall_color is null and wall_w_cm is null and wall_h_cm is null) or
        (wall_color is not null and wall_w_cm is not null and wall_h_cm is not null)
      );
  end if;
end $$;

comment on column elevation_options.wall_color is
  'Plain-wall paint colour as lower-case hex, or null when this option is a photograph. Set together with wall_w_cm and wall_h_cm.';
comment on column elevation_options.wall_w_cm is
  'Real width of a plain wall in centimetres. orig_w and scale_px_per_cm are derived from it — see src/lib/wall.ts.';
