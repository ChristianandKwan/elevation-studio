-- Per-artwork fade effect (opacity blend with elevation background).
-- Displayed to user as 0.00–1.00 in 0.05 steps; rendered as 0–25 %
-- reduction in artwork opacity so the wall behind shows through.
ALTER TABLE artworks ADD COLUMN fade float DEFAULT NULL;
