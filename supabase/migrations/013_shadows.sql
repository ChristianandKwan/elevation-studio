-- Wave F: Per-artwork drop shadow controls
ALTER TABLE artworks ADD COLUMN shadow_angle float DEFAULT NULL;
ALTER TABLE artworks ADD COLUMN shadow_blur  float DEFAULT NULL;
ALTER TABLE artworks ADD COLUMN shadow_opacity float DEFAULT NULL;
