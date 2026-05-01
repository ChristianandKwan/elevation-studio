-- Phase 1: Budget screen data model
-- Adds artist/framing fields to artworks, drops price_includes,
-- adds client_budget to projects, and creates project_budgets table.

-- ── artworks ──────────────────────────────────────────────────────────────────

alter table artworks
  add column if not exists artist         text        not null default '',
  add column if not exists framing_status text        not null default 'framed',
  add column if not exists framing_cost   integer     null;

alter table artworks
  add constraint artworks_framing_status_check
    check (framing_status in ('framed', 'requires_framing'));

-- price_includes has no production data behind it; drop cleanly.
alter table artworks drop column if exists price_includes;

-- ── projects ──────────────────────────────────────────────────────────────────

alter table projects
  add column if not exists client_budget integer null;

-- ── project_budgets ───────────────────────────────────────────────────────────

create table if not exists project_budgets (
  id                  uuid        primary key default gen_random_uuid(),
  project_id          uuid        not null references projects(id) on delete cascade,
  unique (project_id),

  -- Installation block
  installation_indicative   boolean     not null default true,
  installation_confirmed    integer     null,      -- null when indicative

  -- Consultant fee (null when not set)
  fee_mode            text        null check (fee_mode in ('flat', 'percentage')),
  fee_amount          numeric     null,
  fee_shown_to_client boolean     not null default true,

  -- Custom line items stored as a jsonb array:
  -- [{ id, name, amount, vatApplies, shownToClient }]
  custom_line_items   jsonb       not null default '[]'::jsonb,

  -- VAT default the consultant has set for the client view
  vat_included_default boolean    not null default false,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- RLS: consultants own their project_budgets rows via projects FK
alter table project_budgets enable row level security;

create policy "Consultants can manage their project budgets"
  on project_budgets
  for all
  using (
    project_id in (
      select id from projects where consultant_id = auth.uid()
    )
  );

-- Client tokens get read access to budgets for their project
create policy "Client tokens can read project budgets"
  on project_budgets
  for select
  using (
    project_id in (
      select project_id from client_tokens
      where token = current_setting('request.jwt.claims', true)::jsonb->>'sub'
        and expires_at > now()
    )
  );

-- Auto-update updated_at
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger project_budgets_updated_at
  before update on project_budgets
  for each row execute function set_updated_at();
