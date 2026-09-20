-- ══════════════════════════════════════════════════════════
--  027 — Mounts
--
--  A mount (the card window between the artwork and the frame) is part of
--  how a piece is presented, so it belongs to the placement — the same row
--  that already carries frame_type and frame_width_mm — and not to the work.
--  The same print can be mounted one way in the boardroom and another way
--  in reception.
--
--  Widths are per side. The studio offers one figure for all four and opens
--  the sides individually when they need to differ, but the database keeps
--  four so there is never a question of which one wins.
--
--  A mount is drawn when mount_color is set AND at least one side is wider
--  than zero — the same pairing as frame_type with frame_width_mm.
--
--  Deploy order: ADDITIVE — run this first, then deploy. Old code neither
--  reads nor writes these columns, so the gap between the two is harmless
--  and there is no rush to merge.
--
--  Safe to re-run: every step is idempotent.
--
--  NOTE: the destructive works cleanup described in the 026 plan is now 028.
-- ══════════════════════════════════════════════════════════

alter table artworks
  add column if not exists mount_color     text   null,
  add column if not exists mount_top_mm    float4 not null default 0,
  add column if not exists mount_right_mm  float4 not null default 0,
  add column if not exists mount_bottom_mm float4 not null default 0,
  add column if not exists mount_left_mm   float4 not null default 0;

-- The five card colours the consultants work in. Null means no mount.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'artworks_mount_color_check') then
    alter table artworks add constraint artworks_mount_color_check
      check (mount_color is null or mount_color in ('bright-white', 'ivory', 'cream', 'grey', 'black'));
  end if;
end $$;

-- A negative mount would draw the frame through the artwork.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'artworks_mount_widths_check') then
    alter table artworks add constraint artworks_mount_widths_check
      check (
        mount_top_mm    >= 0 and mount_top_mm    <= 500 and
        mount_right_mm  >= 0 and mount_right_mm  <= 500 and
        mount_bottom_mm >= 0 and mount_bottom_mm <= 500 and
        mount_left_mm   >= 0 and mount_left_mm   <= 500
      );
  end if;
end $$;

comment on column artworks.mount_color is
  'Mount card colour, or null for no mount. Drawn only when a side is wider than zero.';
