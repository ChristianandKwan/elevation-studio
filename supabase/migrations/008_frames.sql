-- ══════════════════════════════════════════════════════════
--  008_frames.sql
--  Optional frame per artwork: type and width in mm
-- ══════════════════════════════════════════════════════════

ALTER TABLE artworks
  ADD COLUMN IF NOT EXISTS frame_type text
    CHECK (frame_type IN ('black','white','pale-wood','mid-wood','dark-wood')),
  ADD COLUMN IF NOT EXISTS frame_width_mm float4;
