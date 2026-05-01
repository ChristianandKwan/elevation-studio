-- ══════════════════════════════════════════════════════════
--  012_multi_option.sql
--  Allow elevation options beyond A and B (C, D, …)
-- ══════════════════════════════════════════════════════════

-- elevation_options.option: was CHECK (option IN ('A','B'))
ALTER TABLE elevation_options
  DROP CONSTRAINT IF EXISTS elevation_options_option_check;
ALTER TABLE elevation_options
  ADD CONSTRAINT elevation_options_option_check
    CHECK (option ~ '^[A-Z]$');

-- elevations.client_picked_option: was CHECK (client_picked_option IN ('A','B'))
ALTER TABLE elevations
  DROP CONSTRAINT IF EXISTS elevations_client_picked_option_check;
ALTER TABLE elevations
  ADD CONSTRAINT elevations_client_picked_option_check
    CHECK (client_picked_option ~ '^[A-Z]$');
