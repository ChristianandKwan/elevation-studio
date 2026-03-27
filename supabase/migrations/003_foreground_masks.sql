-- Add foreground mask polygon data to elevation options
ALTER TABLE elevation_options
  ADD COLUMN IF NOT EXISTS foreground_masks jsonb DEFAULT NULL;
