-- ══════════════════════════════════════════════════════════
--  034 — Where a work stands, said once and attributed
--
--  `works.status` has been proposed / considered / declined since 026. It
--  conflates two different questions and derives a third badly.
--
--  **It confuses where a work stands with us and where it stands with the
--  client.** "Declined" never says who declined. The live data shows the
--  cost: the only two declined works are both still hanging on options, so
--  the record says a work is declined and on a wall at the same time and
--  nothing reconciles the two.
--
--  **Most of it is derivable, and derived facts go stale the moment they are
--  stored.** A work on a client-visible option *is* proposed. A work on no
--  option *is* under consideration. Storing that as a column means a work can
--  be taken off a wall and go on claiming it was proposed.
--
--  So the derivable part stops being stored — the Index computes it from the
--  placements, where it cannot go stale — and what is left is the one thing
--  that genuinely has to be recorded: somebody set this work aside, and it
--  matters who.
--
--    null      — live. The default, and no badge.
--    'us'      — ruled out by us.
--    'client'  — passed by the client.
--
--  The *why* is not a column. It goes in the note, where it can be a sentence
--  instead of an enum, and where the export already picks it up.
--
--  ── What is deliberately NOT derived ──────────────────────
--
--  Picking option B does not decline the works on option A. Options are
--  alternatives; a work on the option that was not chosen has not been
--  rejected by anybody, and inferring that would put words in the client's
--  mouth. Only an explicit set-aside says a work is out.
--
--  ── considered_for ────────────────────────────────────────
--
--  Kept — an earmark ("this one is for the boardroom") is real and is not
--  derivable. But 026's backfill set it on every work from its own elevation,
--  so 26 of 27 rows carry a value nobody chose. It is only ever displayed
--  when a work is unplaced, so today it is invisible; the moment a work is
--  taken off a wall it would surface a claim no consultant made.
--
--  So it is cleared for works that are currently placed. Going forward it is
--  only ever set by hand, which is what makes it worth showing.
--
--  Deploy order: ADDITIVE — run this first, then deploy. It adds a nullable
--  column and clears a field the deployed app only reads for unplaced works.
--
--  NOTE: `works.status` is left in place so this can be undone by reverting
--  the code. A later destructive migration retires it, deployed the other way
--  round — the same pattern 024 → 028 followed.
--
--  Safe to re-run: every step is idempotent.
-- ══════════════════════════════════════════════════════════

-- ── 1. The column ─────────────────────────────────────────

alter table works
  add column if not exists set_aside text null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'works_set_aside_check') then
    alter table works add constraint works_set_aside_check
      check (set_aside is null or set_aside in ('us', 'client'));
  end if;
end $$;

comment on column works.set_aside is
  'Who set this work aside: us, the client, or null for live. The reason goes in the note. See migration 034.';

-- ── 2. Carry the old declines across ──────────────────────
--
-- 'us' rather than 'client' because the old value cannot say which, and
-- claiming the client rejected something they may never have seen would be
-- the worse error of the two. Both live rows are in a test project, so
-- nothing real rests on the choice — but the rule is the point.
--
-- 'considered' is not carried: it means "on no wall", which the Index now
-- works out for itself. Live data has none in any case.

update works
set set_aside = 'us'
where status = 'declined'
  and set_aside is null;

-- ── 3. Stop the backfilled earmarks going stale ───────────
--
-- Only the rows 026 filled in automatically: a work that is on a wall cannot
-- meaningfully be "being considered for" somewhere, and that is the only
-- state in which the field is shown.

update works w
set considered_for = null
where w.considered_for is not null
  and exists (select 1 from artworks a where a.work_id = w.id);
