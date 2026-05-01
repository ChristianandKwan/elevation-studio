-- ══════════════════════════════════════════════════════════
--  007_budget.sql
--  Add optional project budget, used to show artwork spend % in studio
-- ══════════════════════════════════════════════════════════

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS budget numeric;
