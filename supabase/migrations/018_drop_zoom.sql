-- ══════════════════════════════════════════════════════════════════
--  018_drop_zoom.sql
--
--  Zoom is now a per-user, per-device viewing preference stored in
--  localStorage. The canvas always loads fitted to the viewport, and
--  the displayed percentage is relative to that fit baseline. The
--  stored DB value is no longer consulted.
-- ══════════════════════════════════════════════════════════════════

alter table elevation_options
  drop column if exists zoom;
