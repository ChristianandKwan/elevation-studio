-- Wave E: Per-artwork brightness effect
ALTER TABLE artworks ADD COLUMN brightness float NOT NULL DEFAULT 1.0;
