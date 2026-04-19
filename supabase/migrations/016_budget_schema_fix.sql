-- ══════════════════════════════════════════════════════════════════
--  016_budget_schema_fix.sql
--
--  Migration 015 created project_budgets with granular separate columns
--  (installation_indicative, installation_confirmed, fee_mode, fee_amount,
--  fee_shown_to_client), but the TypeScript code expects two JSONB columns:
--    • installation  — { indicative: boolean, confirmedAmount: number | null }
--    • consultant_fee — { mode, amount, shownToClient } | null
--
--  This migration drops the mismatched columns and adds the expected ones.
--  Any data in the old columns is discarded (the feature was not yet in use).
-- ══════════════════════════════════════════════════════════════════

alter table project_budgets
  drop column if exists installation_indicative,
  drop column if exists installation_confirmed,
  drop column if exists fee_mode,
  drop column if exists fee_amount,
  drop column if exists fee_shown_to_client;

alter table project_budgets
  add column if not exists installation  jsonb not null
    default '{"indicative": true, "confirmedAmount": null}'::jsonb,
  add column if not exists consultant_fee jsonb null;
