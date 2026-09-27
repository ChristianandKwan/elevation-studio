-- ══════════════════════════════════════════════════════════
--  039 — Proposals built by Claude, and the conversation about them
--
--  A consultant presses Create proposal. The studio builds the export pack
--  (the same markdown and pictures the Export pack button makes), stores it
--  with the proposal, and starts the proposal engine: a Claude Code routine
--  on Tom's account that lays the proposal out with the C&K design system,
--  in the ChristianandKwan/proposal-design-system repository.
--
--  The engine sends each version back as files — the HTML it edits, the PDF,
--  a picture of every page — and the consultant talks to it in a chat beside
--  the pages until they are happy and download.
--
--  ── The tables ────────────────────────────────────────────
--
--  proposals          one per Create proposal. The pack is frozen when it is
--                     made; Refresh figures makes a new one.
--  proposal_versions  every version the engine published, never overwritten,
--                     so "go back to how it was" is always possible.
--  proposal_messages  the chat: the consultant's requests and Claude's replies.
--                     `page` is the page the consultant had selected, which is
--                     what "this" and "here" mean.
--  house_style_rules  preferences a consultant said apply to every proposal.
--                     Christian & Kwan or Tom approve them; the engine then
--                     writes them into the design system and records the
--                     commit. Not tied to a project once approved.
--
--  ── Who touches what ──────────────────────────────────────
--
--  The engine never logs in. It calls /api/engine/* with a bearer secret, and
--  those routes use the service role. Consultants reach their own projects'
--  proposals through RLS, as for notes and option_messages.
--
--  ── The bucket ────────────────────────────────────────────
--
--  `proposals`, private. Objects are `<proposal_id>/pack.zip` and
--  `<proposal_id>/v<n>/…`. Like `exports`, it must stay OUT of
--  /api/admin/sweep-storage: the sweep would read every version's files as
--  orphans. Deleting a project cascades to its proposals; their files are
--  removed first, by /api/proposals/files, which the dashboard calls before
--  it deletes the project (the browser cannot reach this bucket itself).
--
--  Deploy order: ADDITIVE — run this first, then deploy. Nothing existing
--  reads or writes these tables or the bucket.
--
--  Safe to re-run: every step is idempotent.
-- ══════════════════════════════════════════════════════════

-- ── 1. Proposals ──────────────────────────────────────────

create table if not exists proposals (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id) on delete cascade,
  created_by      uuid null references auth.users(id) on delete set null,
  -- queued: waiting for the engine · working: the engine has it
  -- ready: a version is up and the engine is listening · resting: the engine
  -- stopped after a quiet spell; the next message wakes it
  -- failed: the engine could not go on; `error` says why
  status          text not null default 'queued',
  -- What the consultant ticked: the options, the optional pages, the cover.
  brief           jsonb not null default '{}'::jsonb,
  pack_path       text null,
  current_version int null,
  -- The last time the engine was heard from. A message sent while this is
  -- recent reaches the running engine; otherwise it starts a new run.
  engine_seen_at  timestamptz null,
  -- When the studio last started a run for it, and that run's page on claude.ai.
  engine_fired_at timestamptz null,
  engine_run_url  text null,
  error           text null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint proposals_status_check
    check (status in ('queued', 'working', 'ready', 'resting', 'failed'))
);

create index if not exists proposals_project_idx on proposals (project_id, created_at desc);

comment on table proposals is
  'A proposal built by the Claude proposal engine from a frozen export pack. See 039.';

-- ── 2. Versions ───────────────────────────────────────────

create table if not exists proposal_versions (
  id           uuid primary key default gen_random_uuid(),
  proposal_id  uuid not null references proposals(id) on delete cascade,
  number       int  not null,
  -- What changed, in a sentence, from the engine.
  summary      text not null default '',
  page_count   int  null,
  -- Things the engine's checks noticed but did not stop for.
  warnings     jsonb not null default '[]'::jsonb,
  -- Paths inside the bucket: html, pdf, and one picture per page.
  files        jsonb not null default '[]'::jsonb,
  -- False while the engine is still uploading. Only finished versions show.
  finished     boolean not null default false,
  created_at   timestamptz not null default now(),

  constraint proposal_versions_number_unique unique (proposal_id, number)
);

-- ── 3. The conversation ───────────────────────────────────

create table if not exists proposal_messages (
  id           uuid primary key default gen_random_uuid(),
  proposal_id  uuid not null references proposals(id) on delete cascade,
  -- consultant: a person at C&K · engine: Claude
  author       text not null,
  body         text not null,
  -- The page the consultant had selected when they wrote, 1-based.
  page         int  null,
  -- When the engine picked the message up, and the version that answered it.
  taken_at     timestamptz null,
  answered_at  timestamptz null,
  answered_in  int  null,
  created_at   timestamptz not null default now(),

  constraint proposal_messages_author_check check (author in ('consultant', 'engine')),
  constraint proposal_messages_body_check   check (length(btrim(body)) > 0)
);

create index if not exists proposal_messages_proposal_idx
  on proposal_messages (proposal_id, created_at);

-- ── 4. House-style rules ──────────────────────────────────

create table if not exists house_style_rules (
  id              uuid primary key default gen_random_uuid(),
  -- Where it came from. Kept when the proposal goes, for the record.
  proposal_id     uuid null references proposals(id) on delete set null,
  project_id      uuid null references projects(id) on delete set null,
  rule            text not null,
  why             text not null default '',
  -- suggested → approved → applied, or suggested → rejected
  status          text not null default 'suggested',
  decided_by      text null,
  decided_at      timestamptz null,
  applied_commit  text null,
  applied_at      timestamptz null,
  created_at      timestamptz not null default now(),

  constraint house_style_rules_status_check
    check (status in ('suggested', 'approved', 'rejected', 'applied')),
  constraint house_style_rules_rule_check check (length(btrim(rule)) > 0)
);

comment on table house_style_rules is
  'Proposal preferences a consultant said apply always. Approved ones are written into the design system by the engine. See 039.';

-- ── 5. Who may see them ───────────────────────────────────

alter table proposals enable row level security;
alter table proposal_versions enable row level security;
alter table proposal_messages enable row level security;
alter table house_style_rules enable row level security;

drop policy if exists "Consultants manage proposals via project" on proposals;
create policy "Consultants manage proposals via project"
  on proposals for all using (
    exists (select 1 from projects p where p.id = proposals.project_id and p.consultant_id = auth.uid())
  );

drop policy if exists "Consultants read proposal versions via project" on proposal_versions;
create policy "Consultants read proposal versions via project"
  on proposal_versions for select using (
    exists (
      select 1 from proposals pr join projects p on p.id = pr.project_id
      where pr.id = proposal_versions.proposal_id and p.consultant_id = auth.uid()
    )
  );

drop policy if exists "Consultants manage proposal messages via project" on proposal_messages;
create policy "Consultants manage proposal messages via project"
  on proposal_messages for all using (
    exists (
      select 1 from proposals pr join projects p on p.id = pr.project_id
      where pr.id = proposal_messages.proposal_id and p.consultant_id = auth.uid()
    )
  );

-- The house style belongs to the practice, not to a project: any consultant
-- may read and decide on a rule. Approving is the one write the studio makes.
drop policy if exists "Consultants read house-style rules" on house_style_rules;
create policy "Consultants read house-style rules"
  on house_style_rules for select using (auth.uid() is not null);

drop policy if exists "Consultants decide house-style rules" on house_style_rules;
create policy "Consultants decide house-style rules"
  on house_style_rules for update using (auth.uid() is not null);

-- ── 6. The bucket ─────────────────────────────────────────

insert into storage.buckets (id, name, public)
values ('proposals', 'proposals', false)
on conflict (id) do nothing;
-- No storage policies: every read is a signed URL made by the server, every
-- write is the server or a signed upload URL it issued. With RLS on
-- storage.objects and no policy, nobody else can touch the bucket at all.
