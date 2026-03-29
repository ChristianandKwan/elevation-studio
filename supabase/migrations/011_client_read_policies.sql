-- ══════════════════════════════════════════════════════════
--  011_client_read_policies.sql
--  Add SELECT policies so unauthenticated client portal
--  users can read the data they need via valid tokens.
--
--  Without these, the server-side anon client returns empty
--  for elevations/projects/profiles, causing the client
--  portal page to 404 for real (unauthenticated) clients.
-- ══════════════════════════════════════════════════════════

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
