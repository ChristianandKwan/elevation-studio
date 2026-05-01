-- Perspective skew corners stored as fractional coordinates (0-1) relative to elevation image
ALTER TABLE elevation_options
  ADD COLUMN IF NOT EXISTS skew_tl_x float,
  ADD COLUMN IF NOT EXISTS skew_tl_y float,
  ADD COLUMN IF NOT EXISTS skew_tr_x float,
  ADD COLUMN IF NOT EXISTS skew_tr_y float,
  ADD COLUMN IF NOT EXISTS skew_br_x float,
  ADD COLUMN IF NOT EXISTS skew_br_y float,
  ADD COLUMN IF NOT EXISTS skew_bl_x float,
  ADD COLUMN IF NOT EXISTS skew_bl_y float,
  ADD COLUMN IF NOT EXISTS skew_active boolean NOT NULL DEFAULT true;
