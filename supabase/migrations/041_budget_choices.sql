-- ══════════════════════════════════════════════════════════
--  041 — Choices on the budget
--
--  A choice is a budget line the client picks one alternative of: framing
--  from two framers at three levels each, say, or two shippers at different
--  speeds. The consultant writes the alternatives and their prices on the
--  Budget page, and the client picks one on the portal's Budget tab, once
--  for the whole project.
--
--  ── Where each part lives ─────────────────────────────────
--
--  The choices themselves (names, groups, alternatives, prices) are one
--  jsonb array on project_budgets, beside custom_line_items, and are saved
--  the same way: the whole budget row, once the consultant stops typing.
--
--  The picks are rows of their own. The consultant's budget saver writes the
--  whole budget row, so a pick kept inside it would be overwritten by any
--  consultant who had the Budget page open from before the client picked.
--  One row per choice also means a client pick and a consultant pick can
--  never write over each other's other picks.
--
--  ── Email ─────────────────────────────────────────────────
--
--  A client's pick is emailed like a wall pick (037): a new kind, `choice`,
--  naming the choice by its id inside the budget's jsonb.
--
--  Deploy order: ADDITIVE — run this first, then deploy. The live app never
--  reads the new column or table, and widening the kind check leaves every
--  existing row valid.
--
--  Safe to re-run: every step is idempotent.
-- ══════════════════════════════════════════════════════════

-- ── 1. The choices ────────────────────────────────────────

alter table project_budgets
  add column if not exists choices jsonb not null default '[]'::jsonb;

comment on column project_budgets.choices is
  'Budget choices: [{ id, name, kind, pricing, shownToClient, groups: [{ id, label, internalNote, alternatives: [{ id, name, description, vatApplies, prices: { workId: pounds }, amount }] }] }]. See 041.';

-- ── 2. The picks ──────────────────────────────────────────

create table if not exists budget_choice_picks (
  project_id      uuid not null references projects(id) on delete cascade,
  -- The choice's id inside project_budgets.choices.
  choice_id       text not null,
  alternative_id  text not null,
  -- 'client' from the portal, 'us' when a consultant picked on their behalf.
  picked_by       text not null,
  picked_at       timestamptz not null default now(),
  primary key (project_id, choice_id),
  constraint budget_choice_picks_by_check check (picked_by in ('client', 'us'))
);

comment on table budget_choice_picks is
  'The alternative picked for each budget choice, and who picked it. See 041.';

alter table budget_choice_picks enable row level security;

-- The portal never touches this table directly: its writes go through the
-- server with the service role, as every other portal write does (see 022).
drop policy if exists "Consultants manage choice picks via project" on budget_choice_picks;
create policy "Consultants manage choice picks via project"
  on budget_choice_picks for all using (
    exists (select 1 from projects p where p.id = budget_choice_picks.project_id and p.consultant_id = auth.uid())
  );

-- ── 3. Emailing a client's pick ───────────────────────────

alter table client_activity
  add column if not exists choice_id text null;

alter table client_activity drop constraint if exists client_activity_kind_check;
alter table client_activity add constraint client_activity_kind_check
  check (kind in ('pick', 'approve', 'note', 'choice'));
