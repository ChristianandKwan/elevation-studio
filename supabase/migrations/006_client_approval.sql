-- ══════════════════════════════════════════════════════════
--  006_client_approval.sql
--  Two-stage client approval flow:
--    Stage 1 — "Pick": client picks Option A or B per elevation
--    Stage 2 — "Approve": client locks their picked option
-- ══════════════════════════════════════════════════════════

-- Add pick state to elevations (null = not yet picked)
ALTER TABLE elevations
  ADD COLUMN IF NOT EXISTS client_picked_option char(1)
    CHECK (client_picked_option IN ('A', 'B'));

-- ── RLS: client tokens can update client_picked_option on elevations ──
CREATE POLICY "Client token update pick"
  ON elevations FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM client_tokens ct
      WHERE ct.project_id = elevations.project_id
        AND ct.expires_at > now()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM client_tokens ct
      WHERE ct.project_id = elevations.project_id
        AND ct.expires_at > now()
    )
  );

-- ── RLS: client tokens can update approved/approved_at/client_notes on elevation_options ──
CREATE POLICY "Client token update options"
  ON elevation_options FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM elevations e
      JOIN client_tokens ct ON ct.project_id = e.project_id
      WHERE e.id = elevation_options.elevation_id
        AND ct.expires_at > now()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM elevations e
      JOIN client_tokens ct ON ct.project_id = e.project_id
      WHERE e.id = elevation_options.elevation_id
        AND ct.expires_at > now()
    )
  );

-- ── RLS: client tokens can update project status ──
CREATE POLICY "Client token update project status"
  ON projects FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM client_tokens ct
      WHERE ct.project_id = projects.id
        AND ct.expires_at > now()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM client_tokens ct
      WHERE ct.project_id = projects.id
        AND ct.expires_at > now()
    )
  );
