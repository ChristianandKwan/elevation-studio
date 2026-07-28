-- ══════════════════════════════════════════════════════════
--  022_lock_down_client_rls.sql
--
--  Closes the anonymous-access hole in the client portal.
--
--  The Supabase anon key ships in the browser bundle by design, so RLS
--  is the only thing standing between an anonymous caller and the data.
--  The "Client token …" policies below were all written as
--
--      exists (select 1 from client_tokens ct where ct.project_id = … )
--
--  which asks "does *a* valid token exist for this project?" — never
--  "did the caller present that token?". Combined with "Anyone can read
--  tokens" (using (true)), any anonymous person could dump every magic
--  link, read every project, and move artworks, approve options and flip
--  project status on any project with a live link.
--
--  Nothing replaces them: as of PR-A the client portal never touches
--  Supabase from the browser. Reads run through the service client in
--  src/app/client/[token]/page.tsx and writes through
--  src/app/api/client/[token]/action/route.ts, both of which verify the
--  token themselves and check that every ID belongs to that token's
--  project.
--
--  DEPLOY ORDER — destructive change, so app code goes FIRST:
--    1. Deploy PR-A to Vercel.
--    2. Confirm the client portal works in production.
--    3. Only then run this migration.
--  Running this before the app is deployed breaks every live client link.
-- ══════════════════════════════════════════════════════════

-- ── CLIENT TOKENS ────────────────────────────────────────
-- "Anyone can read tokens" was using (true) — the worst of the set.
drop policy if exists "Anyone can read tokens" on client_tokens;

-- ── PROJECTS ─────────────────────────────────────────────
drop policy if exists "Client token read project"          on projects;
drop policy if exists "Client token update project status" on projects;

-- ── PROFILES ─────────────────────────────────────────────
drop policy if exists "Client token read profile" on profiles;

-- ── ELEVATIONS ───────────────────────────────────────────
drop policy if exists "Client token read elevations" on elevations;
drop policy if exists "Client token update pick"     on elevations;

-- ── ELEVATION OPTIONS ────────────────────────────────────
drop policy if exists "Client token read options"   on elevation_options;
drop policy if exists "Client token update options" on elevation_options;

-- ── ARTWORKS ─────────────────────────────────────────────
drop policy if exists "Client token read artworks"           on artworks;
drop policy if exists "Client token update artwork position" on artworks;

-- ── ACTIVITY LOGS ────────────────────────────────────────
drop policy if exists "Client token read activity"   on activity_logs;
drop policy if exists "Client token insert activity" on activity_logs;

-- ── PROJECT BUDGETS ──────────────────────────────────────
-- Note: unlike the others this one was never an anonymous hole — it
-- matched on request.jwt.claims->>'sub', which is never set for anon
-- callers, so it granted nothing and instead broke the portal's Budget
-- tab (fixed in PR-A by fetching the row server-side). Dropped here for
-- tidiness so no "Client token …" policy survives.
drop policy if exists "Client tokens can read project budgets" on project_budgets;


-- ══════════════════════════════════════════════════════════
--  Restore consultant SELECT on client_tokens
--
--  Migration 011 split "Consultants manage tokens via project" into
--  INSERT / UPDATE / DELETE only, leaving "Anyone can read tokens" as the
--  sole SELECT policy on this table. Dropping that above would therefore
--  leave consultants unable to read their own tokens, which breaks:
--
--    • src/app/(consultant)/projects/[id]/page.tsx — reads the existing
--      share link to display in the studio, and
--    • StudioScreen.tsx → generateShareToken() — inserts with .select(),
--      whose RETURNING clause needs a SELECT policy to hand the new token
--      back to the UI.
--
--  011 avoided a consultant SELECT policy here because it recursed:
--    client_tokens SELECT → projects → "Client token read project"
--                        → client_tokens → …
--  That cycle is gone now that "Client token read project" is dropped
--  above, so this policy is safe. If a client-token policy is ever added
--  back to `projects`, this will recurse again — don't.
-- ══════════════════════════════════════════════════════════
create policy "Consultants read tokens via project"
  on client_tokens for select
  using (
    exists (
      select 1 from projects
      where projects.id = client_tokens.project_id
        and projects.consultant_id = auth.uid()
    )
  );
