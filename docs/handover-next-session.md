# Handover — security work complete, storage cleanup outstanding

**Written:** 2026-07-28, end of implementation session.
**Supersedes the status (not the specs) in** `docs/handover-security-and-cleanup.md`.
**Owner:** Tom (product owner, non-developer — explain decisions in plain language, ask before big design changes).

---

## 1. Where things stand

The original handover listed three issues. Two are **done and live in production**.

| # | Issue | Status |
|---|-------|--------|
| 1 | Anonymous access to all projects via RLS holes | ✅ **Fixed and verified in production** |
| 2 | No enforced migration-before-deploy ordering | ✅ **Documented** (`docs/DEPLOYING.md`, `AGENTS.md`) |
| 3 | Orphaned files in Storage | ❌ **Not started** — this is the next piece of work |

Everything below the line in `docs/handover-security-and-cleanup.md` §5 (Issue 3) still
stands as the spec for the remaining work. **Its §3 and §4 are now historical** — that
work is shipped.

---

## 2. What shipped

Merged to `main` via [PR #5](https://github.com/ChristianandKwan/elevation-studio/pull/5) and deployed to
`https://elevation-studio-psi.vercel.app`. Migration 022 was applied to the live
Supabase afterwards, in that order.

- **PR-A** (`e4b1198`) — client portal reads moved to the service client; all 11
  browser-side writes moved to `POST /api/client/[token]/action`, which re-verifies
  the magic-link token and proves every ID in the payload chains back to that token's
  project before writing. Behaviour preserved 1:1.
- **PR-B** (`67ccb25`) — migration `022_lock_down_client_rls.sql` drops the 13
  offending policies. Plus `scripts/verify-rls.mjs`.
- **PR-C** (`9f24ebf`) — `docs/DEPLOYING.md` and the deploy-order note in `AGENTS.md`.
- **`c1e01d1`** — fix to `verify-rls.mjs` (its portal check gave a false pass on
  production builds). On `dev`, not yet merged to `main`.

The client portal now holds **no database credentials in the browser**. Confirm with:

```
grep -rn "supabase.from" src/components/client src/app/client   # must return nothing
```

### Verified in production after migration 022

- Anon key returns **0 rows** on all 8 tables (was: 5 magic-link tokens plus every
  project, elevation, artwork, price and activity row).
- Anon writes affect **0 rows** (was: artwork moves, project status changes and
  option approvals all succeeded with no token presented at all).
- Portal still renders, portal writes still work through the API, and a cross-project
  artwork ID returns 403 and writes nothing.

Re-check any time — read-only and safe:

```
PORTAL_BASE=https://elevation-studio-psi.vercel.app node --env-file=.env.local scripts/verify-rls.mjs <a-live-token>
```

---

## 3. Corrections to the original handover

The original document is wrong in three places. Trust this list over it.

1. **§3.2's entry for `Client tokens can read project budgets` is backwards.** That
   policy was never an anonymous hole — it matched on `request.jwt.claims->>'sub'`,
   which anon callers never have, so it granted nothing. Its real effect was that the
   portal's **Budget tab showed "Unable to load budget data" to every client**. PR-A
   fixed that by fetching the row server-side.

2. **§3.3's claim that the portal page and `ClientPortal.tsx` are the only consumers
   of the client-token policies is wrong** — it missed
   `src/components/budget/useBudgetState.ts`, which queried `project_budgets` straight
   from the browser. Re-verify consumers yourself rather than trusting such a list.

3. **§3.3's "Nothing replaces them" would have broken consultant share links.**
   Migration 011 had left `Anyone can read tokens` as the *only* SELECT policy on
   `client_tokens`, so dropping it bare would have taken consultant read access with
   it, breaking the studio's share-link display and `generateShareToken()` (whose
   `insert().select()` needs a SELECT policy for its RETURNING clause). Migration 022
   therefore adds `Consultants read tokens via project`. Do not re-add any
   client-token policy to `projects` — that recreates the recursion 011 was avoiding.

Also worth knowing: the original spec listed `unapprove` and `move_artworks` as portal
actions. **Unapprove is consultant-only** and was left out of the API. **There are no
debounced position saves** — dragging only persists via the flush inside pick/approve.

---

## 4. Outstanding work

### 4a. Verify the consultant token policy (do first, 2 minutes)

Migration 022 replaced the token SELECT policy and **nothing has exercised it since**.
In the studio: confirm an existing project's share link displays, and that generating
a link on a throwaway project works. If broken, the fix is a small SQL change — the
original policy definitions are in `supabase/migrations/001` and `011`.

### 4b. PR-D — storage sweep (the actual next feature)

Spec is `docs/handover-security-and-cleanup.md` §5, unchanged. In brief: a
`POST /api/admin/sweep-storage` route, consultant-authenticated in-route (middleware
excludes `/api/`), service client, `{ dryRun: true }` support, returning
`{ scanned, orphans, deleted }`. Also patch `useStudio.ts → uploadElevation()` to
remove the previous `image_path` after a successful replace.

**Deploy order: app first** (additive route, no migration). Follow
`src/app/api/thumbnails/[optionId]/route.ts` for the auth pattern.

### 4c. Known pre-existing bugs, none introduced by this work

- **Expired magic links return HTTP 200** while rendering the 404 page. Caused by
  `client/[token]/loading.tsx` flushing headers before `notFound()` runs. Invisible to
  visitors; wrong for crawlers and uptime monitoring.
- **`formatApprovalTimestamp`** (`src/lib/utils.ts:20`) renders 24-hour times with an
  am/pm suffix — the portal shows "Approved 21:12 pm".
- **Dragging an artwork does not save on its own**; it persists only when the client
  picks or approves. This is long-standing behaviour, deliberately preserved. Tom has
  not yet decided whether it should save on drag.
- `npm run lint` reports ~111 pre-existing errors across the codebase. This work
  reduced the count; none of them are new.

### 4d. Tom's notes

Tom has feedback from testing the production portal that had not been discussed when
this was written. Ask him.

---

## 5. Practical notes for the next session

- **The repo is public.** Never commit a live magic-link token, key, or `.env` value.
  `.env.local` is correctly gitignored.
- **There is one Supabase project.** Local dev, Vercel preview and production all share
  it, so *any* testing writes real data. Use the **Demo Residence** project. Snapshot
  before and restore after — the pattern used throughout this session was to read the
  affected rows to a JSON file, run the test, then PATCH them back and diff to confirm.
- **Migrations are applied by hand** in the Supabase SQL editor. No `supabase` CLI,
  `psql`, or Docker on this machine. `drop policy if exists` silently no-ops on a typo,
  so always confirm afterwards with a `pg_policies` query.
- Migrations **020, 021 and 022 are all applied** to the live database (verified).
  Next migration number is **023**.
- Git authenticates through the `gh` keyring. A GitHub token was previously embedded in
  the remote URL in plaintext; it has been removed and revoked.
- Guardrails from the original handover still apply: **do not touch** canvas, drag,
  calibration or homography logic; do not change consultant auth, middleware, or the
  budget calculators; stay on free tiers; migrations are append-only.
