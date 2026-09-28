-- ══════════════════════════════════════════════════════════
--  040 — Proposals sent to the client, and what Claude learns from them
--
--  A consultant marks the version that went to the client as sent. If they
--  changed it after downloading — the wording, in Acrobat, say — they can
--  upload the PDF they actually sent. Claude then looks back over the whole
--  proposal: the conversation, its first draft against the one sent, and the
--  consultant's own edits. It suggests house-style rules from what it finds,
--  and writes a short note of what the proposal teaches. Christian & Kwan
--  decide on every rule, in the studio's House style page.
--
--  Sent proposals are also the examples each new proposal starts from: the
--  engine is handed the latest ones, with their notes. They stay in the
--  studio's own storage; client proposals are never copied into the
--  design-system repository.
--
--  ── The rules now live here ───────────────────────────────
--
--  An approved rule is in force from the next run: the engine reads every
--  rule in force from the studio each time it starts. It no longer writes
--  rules into the design system's README, so `applied` is kept only for any
--  rule that was. A rule C&K stop using is `retired`.
--
--  ── The bucket ────────────────────────────────────────────
--
--  The consultant's PDF is `<proposal_id>/sent/<send_id>.pdf` in the
--  `proposals` bucket (039), uploaded by the browser to a signed upload link.
--
--  Deploy order: ADDITIVE — run this first, then deploy. The live app reads
--  and writes nothing here, and widening the status check leaves every
--  existing rule valid.
--
--  Safe to re-run: every step is idempotent.
-- ══════════════════════════════════════════════════════════

-- ── 1. Sent to the client ─────────────────────────────────

create table if not exists proposal_sends (
  id               uuid primary key default gen_random_uuid(),
  proposal_id      uuid not null references proposals(id) on delete cascade,
  -- The version that went to the client.
  version          int  not null,
  sent_by          text not null default '',
  sent_by_user     uuid null references auth.users(id) on delete set null,
  sent_at          timestamptz not null default now(),
  -- The PDF the consultant actually sent, when they changed it after
  -- downloading. Null when the version went as Claude made it.
  final_pdf_path   text null,
  final_pdf_at     timestamptz null,
  -- Claude's look back: asked for when it is marked sent or a PDF arrives,
  -- done when the engine reports. `review_error` is why it could not start.
  review_asked_at  timestamptz null,
  reviewed_at      timestamptz null,
  review_error     text null,
  -- What this proposal teaches, in a few sentences, from Claude. Shown on
  -- the House style page and handed to the engine with the example.
  lesson           text null,
  created_at       timestamptz not null default now()
);

create index if not exists proposal_sends_proposal_idx on proposal_sends (proposal_id, sent_at desc);
create index if not exists proposal_sends_reviewed_idx on proposal_sends (reviewed_at desc);

comment on table proposal_sends is
  'A proposal version marked as sent to the client, the PDF actually sent, and what Claude learned from it. See 040.';

-- ── 2. Rules: where they came from, and retiring one ──────

alter table house_style_rules
  add column if not exists send_id uuid null references proposal_sends(id) on delete set null;

alter table house_style_rules drop constraint if exists house_style_rules_status_check;
alter table house_style_rules add constraint house_style_rules_status_check
  check (status in ('suggested', 'approved', 'rejected', 'applied', 'retired'));

-- ── 3. Who may see them ───────────────────────────────────

alter table proposal_sends enable row level security;

-- Every write goes through the server (service role). Consultants read the
-- sends of their own projects; the House style page reads across projects
-- through the server, because the house style belongs to the practice.
drop policy if exists "Consultants read proposal sends via project" on proposal_sends;
create policy "Consultants read proposal sends via project"
  on proposal_sends for select using (
    exists (
      select 1 from proposals pr join projects p on p.id = pr.project_id
      where pr.id = proposal_sends.proposal_id and p.consultant_id = auth.uid()
    )
  );
