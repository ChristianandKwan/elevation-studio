-- ══════════════════════════════════════════════════════════
--  011_client_read_policies.sql  (v2 — fixed infinite recursion)
--
--  The original version of this migration created policies on
--  `projects` and `profiles` that queried `client_tokens`.
--  `client_tokens` has a policy that queries `projects`.
--  This caused infinite recursion, crashing ALL queries to
--  `projects` across the entire app.
--
--  Fix: drop those three policies. The client portal page now
--  uses the service-role client (bypasses RLS) after manually
--  verifying the token, so no extra SELECT policies are needed.
-- ══════════════════════════════════════════════════════════

-- Drop the recursive policies if they were already applied
DROP POLICY IF EXISTS "Client token read elevations" ON elevations;
DROP POLICY IF EXISTS "Client token read project"    ON projects;
DROP POLICY IF EXISTS "Client token read profile"    ON profiles;
