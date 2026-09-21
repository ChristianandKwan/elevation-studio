-- ══════════════════════════════════════════════════════════
--  035 — Retire works.status (DESTRUCTIVE)
--
--  The other half of 034. That migration added `set_aside` and left `status`
--  in place so the change could be undone by reverting the code alone; this
--  drops it once the code that stopped reading it is live.
--
--  Written in the same PR as 034 on purpose. `028` was left "owed and not
--  written" for five migrations and three sessions, and every session after
--  had to re-read a plan to find out what it was meant to do. A destructive
--  follow-up that exists as a file is a step in a checklist; one that exists
--  only as a sentence in a handover is a liability.
--
--  ── Deploy order: DESTRUCTIVE — DEPLOY THE CODE FIRST ─────
--
--  Read this carefully, because 034 and 035 run on opposite sides of the
--  same merge:
--
--    1. Run 034            (additive — the app does not read set_aside yet)
--    2. Merge the PR, let Vercel finish
--    3. Run 035            (this file — nothing reads status any more)
--
--  Running this at step 1 drops a column the live app is still selecting, and
--  every Index and budget read fails until the deploy lands.
--
--  ── A note on 026 and 028 ─────────────────────────────────
--
--  Both insert `status` in their backfills, so both stop being re-runnable
--  once this has run. Both are long since applied and neither has any reason
--  to run again; their headers claim idempotency, and this is the one thing
--  that breaks it.
--
--  Safe to re-run: `if exists` on the drops.
-- ══════════════════════════════════════════════════════════

-- The guard is the point of the whole file. If any work is still leaning on
-- `status` to say it was declined — a row written by an old deploy between
-- 034 and this — carrying it across is free, and losing it is not.
update works
set set_aside = 'us'
where status = 'declined'
  and set_aside is null;

alter table works drop constraint if exists works_status_check;
alter table works drop column     if exists status;

comment on table works is
  'A work in a project. Where it stands with the client is derived from its placements; only an explicit set_aside is stored. See migrations 026 and 034.';
