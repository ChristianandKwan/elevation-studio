-- ══════════════════════════════════════════════════════════
--  038 — Who sees a note, and a conversation on every option
--
--  Two changes that belong together, because between them they decide what
--  the client reads in the portal and what they can write back.
--
--  ── 1. A note is for the client, or for C&K ───────────────
--
--  Until now a note was 'proposal' (goes into the export) or 'private'
--  (never leaves the studio). Tom's rule replaces both: everything goes into
--  the proposal pack, and the only question is whether the client also
--  reads it in the portal.
--
--    client  shown to the client where the portal has a place for it (an
--            option's notes, for now), and in the pack. The default: most
--            of what C&K write about an option is written for the client.
--    studio  in the pack, not in the portal. Shown as "C&K" on screen.
--
--  A genuinely private note has no setting any more. Tom's reasoning: C&K
--  know the pack becomes a client proposal, and anything truly sensitive is
--  not written into Elevation Studio in the first place.
--
--  Existing notes: 'proposal' → 'client', 'private' → 'studio'. There is one
--  live project and Tom accepted that its option notes will now show in its
--  portal.
--
--  ── 2. A conversation on each option ──────────────────────
--
--  The client's notes were one text box per option, saved as they typed and
--  overwritten each time — no history, nothing in the pack, and the only
--  record was the email. They become messages: each one sent, dated and
--  kept, and C&K can reply from the studio.
--
--  Whatever each box holds now becomes the first message of its option's
--  conversation, so nothing the client wrote is lost.
--
--  ── Deploy order: ADDITIVE — run this first, then deploy ──
--
--  The code still live before the deploy keeps working against this:
--    · it writes share 'proposal'/'private', which the constraint still
--      accepts, and reads any value it does not know as 'proposal';
--    · it saves into elevation_options.client_notes, which is kept.
--  Deploy soon after running it: a note the client types into the old box in
--  between is saved, but not copied into the conversation.
--
--  Left for a later, destructive migration once the new code is live:
--  narrowing notes.share to the two new values, and dropping
--  elevation_options.client_notes. Neither is needed for anything to work.
--
--  Safe to re-run: every step is idempotent.
-- ══════════════════════════════════════════════════════════

-- ── 1. Who sees a note ────────────────────────────────────

alter table notes drop constraint if exists notes_share_check;
alter table notes
  add constraint notes_share_check
    check (share in ('client', 'studio', 'proposal', 'private'));

update notes set share = 'client' where share = 'proposal';
update notes set share = 'studio' where share = 'private';

alter table notes alter column share set default 'client';

comment on column notes.share is
  'client: shown in the portal where it has a place, and in the proposal pack. studio: the pack only ("C&K" on screen). Every note goes into the pack. See 038.';

-- ── 2. The conversation on an option ──────────────────────

create table if not exists option_messages (
  id          uuid primary key default gen_random_uuid(),
  -- Carried so the consultant policy is one lookup, like notes.
  project_id  uuid not null references projects(id) on delete cascade,
  option_id   uuid not null references elevation_options(id) on delete cascade,
  -- Who wrote it. C&K reply as the practice, not as either of them.
  author      text not null,
  body        text not null,
  created_at  timestamptz not null default now(),
  -- When C&K first saw a client's message in the studio. Null is "new".
  -- Always null for C&K's own messages.
  read_at     timestamptz null,

  constraint option_messages_author_check check (author in ('client', 'studio')),
  constraint option_messages_body_check   check (length(btrim(body)) > 0)
);

create index if not exists option_messages_option_idx
  on option_messages (option_id, created_at);
create index if not exists option_messages_project_idx
  on option_messages (project_id);

comment on table option_messages is
  'The conversation between the client and C&K on one option. The portal writes through /api/client/[token]/action; the studio writes directly. See 038.';

-- Consultants read and write their own projects' conversations. The client
-- never touches this table directly: the portal goes through the server with
-- the service role, as every other portal write does (see 022).
alter table option_messages enable row level security;

drop policy if exists "Consultants manage option messages via project" on option_messages;
create policy "Consultants manage option messages via project"
  on option_messages for all using (
    exists (select 1 from projects p where p.id = option_messages.project_id and p.consultant_id = auth.uid())
  );

-- ── 3. What each box already holds ────────────────────────
--
-- Dated by the last time the client changed it, where 037 recorded that, and
-- marked read: C&K have had the email about it. Only options with no
-- conversation yet, so a second run adds nothing.

insert into option_messages (project_id, option_id, author, body, created_at, read_at)
select e.project_id,
       o.id,
       'client',
       btrim(o.client_notes),
       coalesce(
         (select max(a.created_at) from client_activity a
           where a.option_id = o.id and a.kind = 'note'),
         now()
       ),
       now()
  from elevation_options o
  join elevations e on e.id = o.elevation_id
 where length(btrim(coalesce(o.client_notes, ''))) > 0
   and not exists (select 1 from option_messages m where m.option_id = o.id);

-- ── 4. Which message an email is about ────────────────────
--
-- 037's 'note' actions only said which option's box changed, and the email
-- read the box as it stood. A message does not change once sent, so the
-- action now names it and the email quotes exactly that. Actions recorded
-- by the old code have none and are described without a quote.
--
-- claim_due_client_activity returns setof client_activity, so the new
-- column comes back from it without the function changing.

alter table client_activity
  add column if not exists message_id uuid null references option_messages(id) on delete cascade;
