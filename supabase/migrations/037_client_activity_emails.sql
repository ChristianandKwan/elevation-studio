-- ══════════════════════════════════════════════════════════
--  037 — Email the practice when a client acts in the portal
--
--  A client picks an option, approves one, or writes a note — and until now
--  the only way to find out was to open the project. This records those
--  three actions and emails them, gathered into one message per burst.
--
--  ── When the email goes ───────────────────────────────────
--
--  Tom's rule: the first action starts a timer, every further action resets
--  it, and the email goes once ten minutes pass with nothing new. A client
--  who picks, writes a note, then approves gets one email about all three.
--  There is deliberately no cap — a long session is one email at its end.
--
--  ── Why the database keeps the clock ──────────────────────
--
--  The website only runs while a request is being answered, so it cannot
--  wake itself up ten minutes later. pg_cron can: once a minute it checks
--  whether any project has gone quiet with unsent actions, and only then
--  asks the website (via pg_net) to send. A quiet minute costs one indexed
--  query and no request.
--
--  The email is written when it is sent, from the project as it is then —
--  not from the actions. A note is saved every few seconds while the client
--  types, so the actions only say *which* notes changed; the text comes from
--  the option at send time, and reads as the client finished it.
--
--  ── The send endpoint is not secret ───────────────────────
--
--  /api/client-activity/send takes no key. Calling it can only send what is
--  already due, to the practice's own address, and each action is claimed
--  by an atomic update before it is emailed — so calling it twice, or by
--  anyone, cannot send anything twice or early.
--
--  ── Previews ──────────────────────────────────────────────
--
--  Previews share this database, so an action taken on a preview is recorded
--  here like any other. The job always calls the production site, so those
--  emails are sent by production — once production has the send endpoint.
--
--  Deploy order: ADDITIVE — run this first, then deploy. The table is new and
--  nothing reads it until the code ships; until then the job finds nothing
--  due and makes no calls.
--
--  Safe to re-run: every step is idempotent.
-- ══════════════════════════════════════════════════════════

-- ── 1. The extensions ─────────────────────────────────────
-- Both are available on every Supabase project; this only switches them on.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- ── 2. What the client did ────────────────────────────────

create table if not exists public.client_activity (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  kind        text not null,
  elevation_id uuid references public.elevations(id) on delete cascade,
  option_id   uuid references public.elevation_options(id) on delete cascade,
  created_at  timestamptz not null default now(),
  -- Set when an email about this action is claimed for sending. Cleared again
  -- if the send fails, so the next minute retries it.
  emailed_at  timestamptz,
  -- Failed sends so far. After five the action is left alone rather than
  -- retried every minute for ever — a broken email setup should cost five
  -- tries, not a request a minute.
  attempts    int not null default 0,
  constraint client_activity_kind_check check (kind in ('pick', 'approve', 'note'))
);

create index if not exists client_activity_unsent_idx
  on public.client_activity (project_id, created_at)
  where emailed_at is null;

comment on table public.client_activity is
  'Picks, approvals and notes made in the client portal, waiting to be emailed to the practice. See migration 037.';

-- Only the server (service role) touches this table. RLS on with no policies
-- means the anon and signed-in roles can do nothing with it.
alter table public.client_activity enable row level security;

-- ── 3. Claiming what is due ───────────────────────────────
--
-- Every unsent action of every project whose most recent unsent action is at
-- least `p_quiet` old, marked as being emailed, in one statement. A second
-- caller running at the same moment waits on the row locks, then finds
-- `emailed_at` already set and claims nothing.

create or replace function public.claim_due_client_activity(p_quiet interval default interval '10 minutes')
returns setof public.client_activity
language sql
security definer
set search_path = public
as $$
  update client_activity a
     set emailed_at = now()
   where a.emailed_at is null
     and a.attempts < 5
     and a.project_id in (
       select project_id
         from client_activity
        where emailed_at is null and attempts < 5
        group by project_id
       having max(created_at) <= now() - p_quiet
     )
  returning a.*;
$$;

comment on function public.claim_due_client_activity is
  'Marks and returns the client actions whose project has been quiet for p_quiet. See migration 037.';

-- A send that failed puts its actions back, one attempt older.
create or replace function public.release_client_activity(p_ids uuid[])
returns void
language sql
security definer
set search_path = public
as $$
  update client_activity
     set emailed_at = null, attempts = attempts + 1
   where id = any(p_ids);
$$;

revoke all on function public.claim_due_client_activity(interval) from public, anon, authenticated;
revoke all on function public.release_client_activity(uuid[]) from public, anon, authenticated;
grant execute on function public.claim_due_client_activity(interval) to service_role;
grant execute on function public.release_client_activity(uuid[]) to service_role;

-- ── 4. The clock ──────────────────────────────────────────
--
-- Every minute: if anything is due, ask the site to send it. The condition
-- is the claim's own, so the site is only called when there is work.
-- Scheduling under a name replaces any earlier job of that name.

select cron.schedule(
  'client-activity-emails',
  '* * * * *',
  $job$
    select net.http_post(
      url     := 'https://studio.christianandkwan.com/api/client-activity/send',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body    := '{}'::jsonb
    )
    where exists (
      select 1
        from public.client_activity
       where emailed_at is null and attempts < 5
       group by project_id
      having max(created_at) <= now() - interval '10 minutes'
    )
  $job$
);
