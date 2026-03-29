-- ══════════════════════════════════════════════════════════
--  011_client_read_policies.sql
--
--  Fixes the client_tokens RLS policy (was FOR ALL, now split
--  into separate write policies so SELECT doesn't query projects,
--  which would cause infinite recursion), then re-adds the three
--  client-facing SELECT policies safely.
-- ══════════════════════════════════════════════════════════

-- ── FIX client_tokens: split FOR ALL into explicit write policies ──
-- SELECT is already covered by "Anyone can read tokens" (USING true).
-- Keeping SELECT inside the project-joining policy caused a cycle:
--   projects SELECT → client_tokens → projects → …
DROP POLICY IF EXISTS "Consultants manage tokens via project" ON client_tokens;

CREATE POLICY "Consultants insert tokens via project"
  ON client_tokens FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = client_tokens.project_id AND projects.consultant_id = auth.uid())
  );

CREATE POLICY "Consultants update tokens via project"
  ON client_tokens FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = client_tokens.project_id AND projects.consultant_id = auth.uid())
  );

CREATE POLICY "Consultants delete tokens via project"
  ON client_tokens FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = client_tokens.project_id AND projects.consultant_id = auth.uid())
  );

-- ── Drop any previously applied (recursive) versions ─────
DROP POLICY IF EXISTS "Client token read elevations" ON elevations;
DROP POLICY IF EXISTS "Client token read project"    ON projects;
DROP POLICY IF EXISTS "Client token read profile"    ON profiles;

-- ── ELEVATIONS: client tokens can read ───────────────────
CREATE POLICY "Client token read elevations"
  ON elevations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM client_tokens ct
      WHERE ct.project_id = elevations.project_id
        AND ct.expires_at > now()
    )
  );

-- ── PROJECTS: client tokens can read ─────────────────────
CREATE POLICY "Client token read project"
  ON projects FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM client_tokens ct
      WHERE ct.project_id = projects.id
        AND ct.expires_at > now()
    )
  );

-- ── PROFILES: client tokens can read consultant profile ──
CREATE POLICY "Client token read profile"
  ON profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM client_tokens ct
      JOIN projects p ON p.id = ct.project_id
      WHERE p.consultant_id = profiles.id
        AND ct.expires_at > now()
    )
  );
