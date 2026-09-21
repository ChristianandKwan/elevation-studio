# Handover: Security Fix, Deploy Ordering & Storage Cleanup

**Audience:** an AI coding agent (or developer) picking up this codebase cold.
**Author:** senior-engineer review session, 2026-07-28.
**Owner:** Tom (product owner, non-developer — explain decisions in plain language, ask before big design changes).

---

## 1. Project context (read first)

**Elevation Studio** is an art-placement and client-approval tool for Christian & Kwan, an art consultancy with exactly **two consultant users** (Petra Kwan, Chloe Christian). Consultants arrange artworks on wall photos ("elevations"), each with Option A/B variants; **clients access via magic links** (secret URLs, no login) to view, pick options, and approve. Strict project isolation is a core requirement: a client link must expose only that client's project.

**Stack:** Next.js 16 (App Router) on Vercel free tier · Supabase free tier (Postgres + RLS, Storage, Auth). No test framework installed. TypeScript, `tsc --noEmit` currently passes clean.

**Repo layout (relevant parts):**

```
src/app/client/[token]/page.tsx        ← client portal server page (token check + data fetch)
src/components/client/ClientPortal.tsx ← client portal browser component (contains direct DB writes — the problem)
src/components/dashboard/DashboardClient.tsx ← consultant dashboard incl. deleteProject()
src/app/api/thumbnails/[optionId]/route.ts   ← EXISTING API route: copy this auth pattern
src/app/api/feedback/route.ts
src/lib/supabase/server.ts             ← createClient() (user-scoped) + createServiceClient() (service role)
src/lib/supabase/client.ts             ← browser client (anon key)
src/hooks/useStudio.ts                 ← studio logic incl. storage upload paths
supabase/migrations/001…021            ← migrations; NEXT NUMBER IS 022
middleware.ts                          ← protects /dashboard, /projects; excludes /api/ and /client/
```

**Branches:** work on `dev`, merge to `main`. Recent unmerged work (PR4 CSS split, PR5 delete RPC) is reviewed and mergeable.

**Golden rule for every change:** run migrations against Supabase **before** deploying the app code that uses them (see §4).

---

## 2. The three issues, in priority order

| # | Issue | Severity | Effort |
|---|-------|----------|--------|
| 1 | Anonymous users can read/write every project via RLS holes | **Critical** | ~1–2 sessions |
| 2 | No enforced migration-before-deploy ordering | Process risk | Minutes |
| 3 | Deleted/replaced images orphan in Storage forever | Slow leak | ~1 session |

---

## 3. Issue 1 — Critical security hole: anonymous access to all projects

### 3.1 What is wrong

The Supabase **anon key ships in the browser bundle** (by design). Anyone can use it to query the database directly; only RLS policies stand in the way. Several policies are written as "allow if *a* valid token exists for this project" — they never check that the **caller** presented that token. And one policy exposes the tokens table itself to everyone.

Net effect: any anonymous person with the anon key can (a) dump every magic-link token, (b) read every project, elevation, artwork, price, and budget, and (c) move artworks, approve/unapprove options, and change project status on **any** project.

### 3.2 Exhaustive list of the offending policies

These must ALL be dropped in the fix migration (`drop policy if exists "<name>" on <table>;`):

| Policy name | Table | Defined in | Problem |
|---|---|---|---|
| `Anyone can read tokens` | `client_tokens` | 001 (line ~153) | `using (true)` — anyone can dump all tokens |
| `Client token read options` | `elevation_options` | 001 (~173) | token-existence check, caller not verified |
| `Client token read artworks` | `artworks` | 001 (~195) | same |
| `Client token update artwork position` | `artworks` | 001 (~206) | same — anon can move artworks |
| `Client token read activity` | `activity_logs` | 001 (~224) | same |
| `Client token insert activity` | `activity_logs` | 001 (~233) | same — anon can forge activity entries |
| `Client token update pick` | `elevations` | 006 | same — anon can pick options |
| `Client token update options` | `elevation_options` | 006 | same — anon can approve/unapprove |
| `Client token update project status` | `projects` | 006 | same — anon can flip project status |
| `Client token read elevations` | `elevations` | 011 | same |
| `Client token read project` | `projects` | 011 | same |
| `Client token read profile` | `profiles` | 011 | same |
| `Client tokens can read project budgets` | `project_budgets` | 015 (~64) | same — check exact name in file before dropping |

**Keep untouched:** all `Consultants …` policies (001, 011) — consultant auth is sound. Storage policies (002, 017) require an authenticated user; acceptable for now.

### 3.3 The fix — move token verification server-side

Design principle: **the browser never talks to Supabase directly in the client portal.** Only server code (which can hold secrets and verify the token on every request) touches the DB, using `createServiceClient()` from `src/lib/supabase/server.ts` (service role key bypasses RLS — that is fine because the server verifies the token itself).

**Step A — Reads** (`src/app/client/[token]/page.tsx`):
Already server-side, but currently uses the anon client and relies on the open policies. Change every query in this file to use `supabaseService` (already imported and used for signed URLs). Verify the token first with the service client:

```
token row must exist in client_tokens with expires_at > now()  → else notFound()
```

Then fetch project/profile/elevations with the service client, filtered by the token's `project_id`. The queries themselves don't change — only which client runs them.

**Step B — Writes** (`src/components/client/ClientPortal.tsx`):
There are 11 direct Supabase calls in the browser (lines ~233–396 as of this writing): artwork visibility toggle, client notes, artwork x/y position (two places), pick option, unpick, approve (sets `approved`/`approved_at`), project status update, and 3 `activity_logs` inserts.

Replace them with `fetch()` calls to a new API route:

```
POST /api/client/[token]/action
Body: { action: 'toggle_visibility' | 'save_notes' | 'move_artworks' | 'pick_option'
              | 'unpick_option' | 'approve' | 'unapprove', payload: {...} }
```

The route handler (new file `src/app/api/client/[token]/action/route.ts`) must, in order:
1. Look up the token with `createServiceClient()`; 404 if missing/expired.
2. **Verify every ID in the payload belongs to the token's project** (e.g. an artwork ID must chain artwork → elevation_option → elevation → project_id = token's project). Without this, a valid client could modify another project by sending foreign IDs — this check replaces what RLS used to (badly) do.
3. Perform the write(s) with the service client, mirroring current logic exactly (e.g. `approve` also writes the activity log and, when all elevations approved, sets project status — read the current ClientPortal code carefully and preserve behaviour 1:1, including the position-flush before approve at lines ~287/358).
4. Return JSON the component uses to update local state.

Follow the auth-pattern and structure of `src/app/api/thumbnails/[optionId]/route.ts` (`runtime = 'nodejs'`, `dynamic = 'force-dynamic'`, params as Promise). Note `middleware.ts` matcher already excludes `/api/` — no middleware changes needed.

Keep the drag/canvas UX untouched: only the persistence calls change, not the interaction logic. Debounced position saves should remain debounced (batch them into one `move_artworks` call).

**Step C — Migration `022_lock_down_client_rls.sql`:**
Drop all policies in the table above. Nothing replaces them — client access now flows exclusively through server code. Grep the app first to confirm nothing else depends on them: the ONLY consumers of these policies are `client/[token]/page.tsx` reads and `ClientPortal.tsx` writes (verified 2026-07-28; re-verify with `grep -rn "supabase.from" src/components/client src/app/client`).

**Deploy order for this fix (critical):**
1. Deploy app code (Steps A+B). It uses the service client, so it works with policies still in place.
2. Verify the portal works in production.
3. THEN run migration 022. (Reverse order = broken portal.)

### 3.4 Acceptance criteria

- With only the anon key (no token), `select * from client_tokens` / `projects` / `artworks` etc. via the Supabase REST API returns **zero rows**, and all updates fail.
- A valid magic link still: loads the portal, drags artworks (positions persist on refresh), toggles visibility, saves notes, picks/unpicks, approves/unapproves (locking positions), shows Approval History.
- A request to `/api/client/[token]/action` with a valid token but an artwork ID from a *different* project returns 403/404 and writes nothing.
- Expired token → 404.
- Consultant dashboard and studio completely unaffected.
- `tsc --noEmit` passes.

---

## 4. Issue 2 — Deploy ordering discipline

**Problem:** app code and DB migrations deploy independently (Vercel vs Supabase). If code that calls a new DB function (e.g. `rpc('delete_project')`, migration 021) deploys before the migration runs, the feature errors for every user until the DB catches up.

**Fix (process, not code):**
1. Add a short `docs/DEPLOYING.md`: *"Rule: for additive changes (new tables/columns/functions), apply the Supabase migration first, then deploy to Vercel. For destructive changes (dropping policies/columns the live app still uses — e.g. migration 022 above), deploy the app first, then migrate. Every PR description must state its deploy order."*
2. Add the same note at the top of `AGENTS.md` so future agent sessions see it.
3. Check whether migrations 020 and 021 have been applied to the live Supabase project before merging `dev` → `main`; apply them first if not.

No code changes required. Optional later upgrade: Supabase CLI migration step in CI.

---

## 5. Issue 3 — Orphaned files in Storage

### 5.1 What is wrong

Storage files are cleaned up **best-effort from the browser** after DB deletion (`DashboardClient.tsx → deleteProject()`): if the tab closes mid-flight, files orphan forever. Additionally, `useStudio.ts → uploadElevation()` uploads each replacement to a **new** timestamped path (`{projectId}/{optionId}/elevation-{Date.now()}.{ext}`) — confirm whether the old file is ever removed; if not (likely), every re-upload orphans a file. Free tier = 1 GB; this is a slow leak, not an emergency.

Storage layout (all three buckets are private):
- `elevation-images`: `{projectId}/{optionId}/elevation-{timestamp}.{ext}`
- `artwork-images`: `{projectId}/{optionId}/art-{uuid}.{ext}`
- `thumbnails`: `{optionId}.png` (NOT project-prefixed)

### 5.2 The fix — a sweep endpoint

Create `src/app/api/admin/sweep-storage/route.ts` (POST):
1. Auth: require a logged-in consultant (same pattern as the thumbnails route). Middleware excludes `/api/`, so do the check in-route.
2. With the service client: list top-level folders in `elevation-images` and `artwork-images`; delete any folder whose name is not a current `projects.id`. For `thumbnails`, delete any `{optionId}.png` where optionId is not in `elevation_options`.
3. Also sweep *within* live projects: any file in `elevation-images` not matching a current `elevation_options.image_path`, and any in `artwork-images` not matching an `artworks.image_path`, is an orphan from re-uploads. (Supabase `storage.list()` is per-folder — recurse project → option folders.)
4. **Dry-run first:** support `{ "dryRun": true }` returning the would-delete list without deleting. Tom should eyeball this list on first run in production.
5. Return counts: `{ scanned, orphans, deleted }`.

Trigger: a small "Tidy storage" action in the consultant dashboard, or run manually. A cron (Vercel free tier allows daily) can come later — get the manual version right first.

Also patch the direct leak if confirmed: in `uploadElevation`, after a successful upload and DB update, remove the previous `image_path` (it's known before overwrite).

### 5.3 Acceptance criteria

- Dry run on production lists plausible orphans and deletes nothing.
- Real run deletes only listed paths; every image still referenced by any `image_path` / `thumbnail_path` column survives (spot-check dashboard, studio, and a client portal afterwards).
- Unauthenticated POST → 401.

---

## 6. Guardrails for the implementing agent

- **Do not touch** canvas/drag/calibration/homography logic (`useStudio.ts` interaction code, `homography.ts`, `StudioCanvas.tsx`) beyond the specific persistence calls named above. This logic is hard-won.
- Do not change consultant auth, middleware behaviour, or the budget calculators.
- Preserve behaviour 1:1 when moving client writes server-side — including activity logging and the approval/lock semantics. Read the existing code path fully before rewriting it.
- Stay on free tiers; no new paid services or heavyweight dependencies.
- After each change: `npx tsc --noEmit` and `npm run lint` must pass; `npm run dev` and click through all three surfaces (dashboard, studio, client portal).
- Migrations are append-only: never edit files 001–021; new work starts at `022_…`.
- Suggested PR sequence: **PR-A** portal server-side reads+writes (Issue 1 Steps A+B) → deploy → **PR-B** migration 022 (Step C) → **PR-C** deploy docs (Issue 2) → **PR-D** storage sweep (Issue 3). Keep them separate; each states its deploy order.
- If anything here contradicts what you find in the code, trust the code, and flag the discrepancy to Tom in plain language.
