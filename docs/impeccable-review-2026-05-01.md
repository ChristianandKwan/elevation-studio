# Elevation Studio — Impeccable review handoff

**Reviewer:** `$impeccable critique` + `$impeccable audit`, run 2026-05-01.
**Branch:** assumed `dev` (whatever was current at the time of review).
**Scope requested:** code quality & architecture, visual design & UX, performance & correctness.

This document is the full output of an impeccable review against `MEMORY.md` + `docs/budget-screen/brief.md` (used as functional `PRODUCT.md` / `DESIGN.md` since neither file exists yet). It is intended to be read by a fresh session as the single starting point for follow-up work — every finding has a file path and enough rationale to act on without re-reading the conversation.

---

## How to use this document

1. Skim **Settled / out of scope** so you don't re-suggest things the user has already decided on.
2. Skim **Already shipped** so you don't double-count the prior senior-level review.
3. Work the **Priority-ordered action list** top-down. Each item maps to an impeccable command.
4. Verify each finding against the live file before editing — line numbers drift.
5. Re-run `$impeccable audit` and `$impeccable critique` after a batch of fixes to watch the scores move.

---

## Project context (for a fresh session)

- **What it is.** Elevation Studio — a bespoke web app for Christian & Kwan, a London art consultancy. Consultants upload photos of client walls (elevations), scale them, place artwork images on them, and share a proposal link. Clients view the proposal, pick between Option A / B (or more), and approve.
- **Stack.** Next.js 16 + React 19 + Supabase (`@supabase/ssr`). TypeScript strict. Deployed on Vercel. (Tailwind v4 removed 2026-05-02.)
- **Critical context.** `AGENTS.md` says *"This is NOT the Next.js you know"* — read `node_modules/next/dist/docs/` before touching Next APIs.
- **Two registers.** The studio (consultant tool) is the **product** register — design serves the task. The client portal is closer to **brand** — gallery aesthetic, design IS the deliverable.
- **Key files.**
  - `src/hooks/useStudio.ts` (~1.97 KLOC, load-bearing — touch with care)
  - `src/app/globals.css` (tokens, reset, shared components — split into `dashboard.css`, `studio.css`, `client-portal.css`, `budget.css` 2026-05-02)
  - `src/components/client/ClientPortal.tsx`, `ClientElevation.tsx`
  - `src/components/dashboard/DashboardClient.tsx`
  - `src/components/budget/*` (newest feature, mostly clean)

---

## Settled / out of scope (do not re-suggest)

- **Fonts: keep Cormorant Garamond + Karla.** I noted Cormorant is on impeccable's 2026 reflex-reject list and prepared a comparison sheet (`font-comparison.html` at the repo root). User reviewed it and confirmed they want to stay with the current pairing. **Do not propose font changes again** unless the user reopens the question. The font-weight loading bug (P1 below) is still in scope — fix the loading, keep the faces.

---

## Already shipped (do not duplicate)

The prior senior code review (`docs/code-review-followups.md`, dated 2026-04-21) had a "Next up" list. As of this review, the following are confirmed shipped:

- **A1** — Dashboard thumbnail pre-compute (cached PNG in `thumbnails` bucket, signed on demand). `(consultant)/dashboard/page.tsx`.
- **A2** — Logo compression + `next/image` for the four wordmark assets.
- **A3** — `cache()`-wrapped `getCurrentUser` in `src/lib/supabase/auth.ts`. Used by consultant layout, dashboard page, project page.
- **A4** — Batched `createSignedUrls` on both client portal (`src/app/client/[token]/page.tsx`) and consultant project page (`src/app/(consultant)/projects/[id]/page.tsx`). Two RPCs per bucket instead of N.
- **B1** — `loadOption` failed-image path. Artworks now have a `loadFailed` flag; failed images are surfaced via toast (`useStudio.ts` ~line 1052–1056).
- **B2** — `finalize` RAF cap. 60-frame ceiling with warn-and-bail (`useStudio.ts` ~line 1022–1031).
- **B3** — Client portal error handling. `ClientPortal.tsx` now has `inFlightRef`, snapshot rollback, and toasts on `toggleVisibility`, `handlePick`, `handleClearPick`, `handleApprove`. Activity log writes are non-critical (warn, don't fail).
- **Service-role client fix.** `src/lib/supabase/server.ts:31` uses plain `@supabase/supabase-js` `createClient` with `auth: { persistSession: false }` — no longer pinned to user cookies.

**PR 1 — A11y & correctness** (shipped to `dev` 2026-05-02, commit `c0a15eb`):

- **P1-1** — Font weights. Cormorant now loads `['300','400','500','600']`, Karla loads `['300','400','500','700']` in `layout.tsx`. No more synthesised bold on the budget screen.
- **P1-3** — Dashboard modal label wiring. All 5 inputs in the New Project and Rename modals now have `htmlFor`/`id` pairs (`np-name`, `np-client`, `np-budget`, `np-elev`, `rn-name`).
- **P1-4** — Undefined tokens. `var(--muted)` replaced with `var(--mid)` in 6 places (`DashboardClient.tsx` ×2, `ClientElevation.tsx` ×4); `var(--bg-hover)` replaced with `var(--cream)` in `globals.css`.
- **P2-1** — Escape-to-close on dashboard modals. Single `useEffect` on `document` handles all three modals (New Project, Rename, Delete); respects in-progress operations.
- **P2-2** — Heading hierarchy. `DashboardClient.tsx` "Your Work" `<div>` → `<h1>`; `StudioScreen.tsx` project name `<div>` → `<h2>`. Visually unchanged.
- **P2-5** — `--mid` contrast. `#7A746E` → `#6E6862`; contrast against cream ~3.96:1 → ~4.7:1 (passes WCAG AA).
- **P2-6 (partial)** — `createProject` is now an atomic Postgres RPC (`create_project`, migration `020_create_project_rpc.sql`). **`deleteProject` still uses the client-side pattern** — still open, see finding below. **Migration must be applied to Supabase manually** before the new flow works in production.

**PR 2 — Mobile polish** (shipped to `dev` 2026-05-02, commit `481b3b8`):

- **P1-2** — Client portal touch targets. `.client-art-eye` and `.client-zoom-btn` bumped to 36×36px hit areas; visible glyphs unchanged via flex-centering. Inline `width: 32` override removed from the Fit zoom button.

**PR 3 — Performance** (shipped to `dev` 2026-05-02, commit `cfea6ea`):

- **P2-3** — Dashboard thumbnail signing batched. `dashboard/page.tsx` now makes two `createSignedUrls` RPCs (thumbnails bucket + elevation-images bucket) regardless of project count, replacing the per-project loop.
- **P2-4 (partial)** — `next/image` on LCP surfaces. Dashboard project card thumbnails use `<Image fill unoptimized>`; client portal elevation uses `<NextImage width={orig_w} height={orig_h} unoptimized>`. Artwork sidebar thumbs (36×36) and studio upload previews left as raw `<img>` per the review recommendation.

**Spinner fixes** (shipped to `dev` 2026-05-02, commits `40fccf9`, `47fdb0d`):

- `ArcSpinner` and `DrawLoader` keyframes moved from inline JSX `<style>` tags to `globals.css`. Previously, any re-render of `ArcSpinner` (e.g. the luminance-sample `setVariant` call) replaced the `<style>` node and reset the animation clock, causing a stutter.
- `ck-arc-dash` loop-boundary stutter fixed. The `100%` keyframe previously used `stroke-dashoffset: -224`, placing the arc at ~320° just before the loop reset to 0° — a visible ~40° jump each cycle. Changed to `dashoffset: 0` so start and end positions match exactly.

**PR 4 — CSS architecture** (shipped to `dev` 2026-05-02, commit `2fa1d32`):

- **P2-8** — `globals.css` split into four per-surface files (`dashboard.css`, `studio.css`, `client-portal.css`, `budget.css`). `globals.css` now contains only tokens, reset, shared components (buttons, modals, status bar), keyframes, and login styles. Tailwind v4 and `@tailwindcss/postcss` uninstalled (18 packages removed). Pure CSS going forward.

**PR 5 — Delete project RPC** (shipped to `dev` 2026-05-02, commit `4e772a1`):

- **P2-6 (complete)** — `deleteProject` replaced with atomic `delete_project()` Postgres RPC (migration `021_delete_project_rpc.sql`). Collects elevation, thumbnail, and artwork storage paths, deletes the project row (cascade handles all child records), returns paths for best-effort client-side storage cleanup. Also fixes a pre-existing gap: thumbnails bucket was never cleaned up on deletion. **Migration 021 must be applied in Supabase SQL editor.**

If you spot any of the above and think it's open, double-check before editing.

---

## Findings

### P1 — Must fix

#### ~~P1-1 Font weights used in CSS aren't loaded by `next/font`~~ ✓ SHIPPED

- **Shipped:** `layout.tsx` now loads Cormorant `['300','400','500','600']` and Karla `['300','400','500','700']`. (PR 1, 2026-05-02)

#### ~~P1-2 Client portal touch targets below 44×44~~ ✓ SHIPPED

- **Shipped:** `.client-art-eye` and `.client-zoom-btn` bumped to 36×36px. Inline `width: 32` override removed from the Fit zoom button. Studio `.icon-btn` (24px) intentionally left — deferred until reported. (PR 2, 2026-05-02)

#### ~~P1-3 Dashboard form labels disconnected from inputs~~ ✓ SHIPPED

- **Shipped:** All 5 modal inputs have `htmlFor`/`id` pairs (`np-name`, `np-client`, `np-budget`, `np-elev`, `rn-name`). (PR 1, 2026-05-02)

#### ~~P1-4 `var(--muted)` and `var(--bg-hover)` are referenced but not defined~~ ✓ SHIPPED

- **Shipped:** All 6 call sites replaced with canonical tokens (`--mid`, `--cream`) — `globals.css` ×2, `DashboardClient.tsx` ×2, `ClientElevation.tsx` ×4. Note: the review identified 4 call sites; 4 additional ones in `ClientElevation.tsx` were found and fixed in the same pass. (PR 1, 2026-05-02)

---

### P2 — Should fix before next major release

#### ~~P2-1 Modals on the dashboard have no Escape-to-close~~ ✓ SHIPPED

- **Shipped:** Single `useEffect` on `document` handles Escape for all three modals; guards `!renaming` and `!deleting` so in-progress operations can't be cancelled. Shared `<Modal>` component not extracted — inline listener sufficient for three modals. (PR 1, 2026-05-02)

#### ~~P2-2 Heading hierarchy missing on dashboard and studio~~ ✓ SHIPPED

- **Shipped:** `DashboardClient.tsx` "Your Work" → `<h1>`; `StudioScreen.tsx` project name → `<h2>` (subordinate to page nav, not a page title). `BudgetScreen.tsx` was already correct. CSS unchanged — visual appearance identical. (PR 1, 2026-05-02)

#### ~~P2-3 Dashboard thumbnail signing is still N+1~~ ✓ SHIPPED

- **Shipped:** `dashboard/page.tsx` now makes two `createSignedUrls` RPCs (thumbnails + elevation-images buckets) replacing the per-project loop. (PR 3, 2026-05-02)

#### ~~P2-4 Raw `<img>` on dynamic surfaces~~ ✓ SHIPPED (high-value surfaces)

- **Shipped:** Dashboard thumbnails → `<Image fill unoptimized>`; client portal elevation → `<NextImage width={orig_w} height={orig_h} unoptimized>`. `globals.css` `.project-card-thumb` gains `position: relative`; `.client-elev-img` gains `width: 100%; height: auto`. (PR 3, 2026-05-02)
- **Still open (low priority):** `StudioSidebar.tsx` artwork thumbs (34×34) and `AddArtworkModal.tsx` upload previews — intentionally left per the review recommendation.

#### ~~P2-5 Mid-grey on cream is borderline AA~~ ✓ SHIPPED

- **Shipped:** `--mid` changed from `#7A746E` to `#6E6862` in `globals.css`. Contrast against cream is now ~4.7:1. (PR 1, 2026-05-02)

#### ~~P2-6 `createProject` / `deleteProject` non-atomic~~ ✓ SHIPPED

- **Shipped:** Both `createProject` and `deleteProject` replaced with atomic Postgres RPCs (`create_project` migration 020, `delete_project` migration 021). Both use `security invoker`. Migrations must be applied in Supabase SQL editor. `deleteProject` also fixed a pre-existing gap where thumbnails bucket paths were never cleaned up.

#### P2-7 Strict TypeScript posture undermined by `any` casts in SSR pages

- **Where:** `client/[token]/page.tsx` and `(consultant)/projects/[id]/page.tsx` — many `(art as any).artist`, `(opt as any).client_notes` chains.
- **Why it matters:** Was probably needed when migrations 009/010 landed without regenerated types, but it's now load-bearing — a column rename would be silent.
- **Fix:** Regenerate Supabase types (`supabase gen types typescript --local > src/types/db.ts` or equivalent), import the Database generic, and remove the casts.
- **Command:** `$impeccable harden`.

#### ~~P2-8 `globals.css` is 57 KB and monolithic; Tailwind v4 set up but barely used~~ ✓ SHIPPED

- **Shipped:** Split into `dashboard.css`, `studio.css`, `client-portal.css`, `budget.css`. Tailwind removed. (PR 4, 2026-05-02)

#### ~~P2-9 Token expiry~~ — CLOSED / WILL NOT FIX

- **Decision (2026-05-02):** User reviewed this finding and confirmed 90 days is the correct default. Do not re-raise.

---

### P3 — Polish

#### P3-1 Heavy drop shadow on `.elev-wrap` contradicts the brief

- **Where:** `globals.css:529` — `box-shadow: 0 8px 48px rgba(0,0,0,.18)`.
- **Brief says:** "thin 1px borders rather than shadows (shadows only on floating panels)". The elevation wrapper isn't a floating panel.
- **Fix:** Replace with `1px solid var(--border)` plus a tighter shadow like `0 1px 0 rgba(0,0,0,.06), 0 12px 24px rgba(0,0,0,.06)`.
- **Command:** `$impeccable polish`.

#### P3-2 Glassmorphism traces

- **Where:** `.modal-bg` uses `backdrop-filter: blur(2px)`; `.client-zoom-controls` uses `blur(4px)`.
- **Why it matters:** Mild glass tells. The 2px modal blur is below most perceptual thresholds; the zoom-chip is the more visible one.
- **Fix:** Remove both `backdrop-filter` declarations. Use solid `var(--warm-white)` panels.
- **Command:** `$impeccable polish` or `$impeccable quieter`.

#### P3-3 Inline styles where classes belong

- **Where:**
  - `(auth)/login/page.tsx:42–51` — the login screen wrapper is inline-styled.
  - `ClientPortal.tsx:473` — tab-bar dividers (`<div style={{ display: 'flex', alignItems: 'center' }}>`).
  - `ClientPortal.tsx:454–458` — view-toggle container.
  - `StudioCanvas.tsx:152–163` — client-pick stamp.
- **Why it matters:** Tightens the CSS surface. Theming changes become one-touch.
- **Fix:** Promote each to a class in `globals.css`. Names like `.login-screen`, `.client-tab-bar-group`, `.client-view-pane`, `.studio-pick-stamp`.
- **Command:** `$impeccable polish`.

#### P3-4 No keyboard shortcuts beyond nudge

- **Where:** Studio. Rubber-band select, shift-multi-select, and arrow-key nudge exist (per `MEMORY.md`). No Cmd+S, no `1`/`2` to switch options, no `Esc` to deselect (currently requires clicking a background pixel).
- **Why it matters:** Power-user friction for the consultant. Heuristic 7 (flexibility & efficiency) is the lowest score in the critique.
- **Fix:** Add `Esc` to deselect; `1`/`2`/`3`… to switch options on the active elevation; optionally `Cmd+S` to flush the debounce-save immediately. Keep onboarding-friendly defaults — none of these should be required to use the app.
- **Command:** `$impeccable delight` (under "thoughtful affordances for the people who live in the tool").

#### P3-5 Promote MEMORY.md + brief.md into proper PRODUCT.md / DESIGN.md

- **Where:** Repo root has neither file. `MEMORY.md` and `docs/budget-screen/brief.md` are the de-facto equivalents.
- **Why it matters:** The impeccable skill expects these and produces sharper output when they're present. Future sessions / collaborators get the same grounding instantly.
- **Fix:** Run `$impeccable teach` once to interview the user (skip the parts already covered by MEMORY.md), then `$impeccable document` to extract `DESIGN.md` from the existing CSS tokens.
- **Command:** `$impeccable document` (then optionally `$impeccable teach` if `teach` still wants to run).

#### P3-6 `localStorage` zoom keys leak after option deletion

- **Where:** `ClientPortal.tsx:138–158` — keyed by `optionId`. Studio likely similar.
- **Why it matters:** Keys accumulate forever in `localStorage`. Storage isn't unbounded but the budget grows over a project's lifetime.
- **Fix:** Sweep stale keys on app load — compare every `elevZoom:*` key against the current set of option IDs and delete orphans. Or move to a single object keyed by project ID with sub-keys per option.
- **Command:** `$impeccable polish`.

---

## Priority-ordered action list

This is the order to attack things in. Each item maps to one impeccable command. Group consecutive items with the same command into a single run.

| # | Priority | Finding | Command | Status |
|---|---|---|---|---|
| 1 | P1-1 | Add `'600'` to Cormorant, `'700'` to Karla weights in `layout.tsx` | `$impeccable harden` | ✓ PR 1 |
| 2 | P1-3 | Add `htmlFor` / `id` to dashboard modal labels | `$impeccable harden` | ✓ PR 1 |
| 3 | P1-4 | Replace `var(--muted)` / `var(--bg-hover)` references | `$impeccable harden` | ✓ PR 1 |
| 4 | P2-1 | Escape-to-close on dashboard modals | `$impeccable harden` | ✓ PR 1 |
| 5 | P2-2 | Promote dashboard / studio titles to `<h1>` / `<h2>` | `$impeccable harden` | ✓ PR 1 |
| 6 | P2-5 | Darken `--mid` to `#6E6862` for AA contrast | `$impeccable harden` | ✓ PR 1 |
| 7 | P2-6 | `createProject` → Postgres RPC (migration 020) | `$impeccable harden` | ✓ PR 1 (apply migration in Supabase) |
| 7b | P2-6 | `deleteProject` → Postgres RPC | `$impeccable harden` | ✓ PR 5 (apply migration 021 in Supabase) |
| 8 | P2-9 | Token expiry 90 → 42 days | — | ✗ will not fix (user decision) |
| 9 | P1-2 | Bump client portal touch targets to ≥36px | `$impeccable adapt` | ✓ PR 2 |
| 10 | P2-3 | Batch dashboard thumbnail signing | `$impeccable optimize` | ✓ PR 3 |
| 11 | P2-4 | `next/image` + `unoptimized` on dashboard thumbs and client elevation | `$impeccable optimize` | ✓ PR 3 (low-pri studio thumbs deferred) |
| 12 | P2-7 | Regenerate Supabase types; remove `as any` casts | `$impeccable harden` | open |
| 13 | P2-8 | Either split `globals.css` per surface or commit to Tailwind v4 + `@theme` | `$impeccable distill` or `$impeccable extract` | ✓ PR 4 |
| 14 | P3-5 | Run `$impeccable document` to generate `DESIGN.md` from current tokens | `$impeccable document` | open |
| 15 | P3-1 | Replace `.elev-wrap` heavy shadow with border + softer shadow | `$impeccable polish` | open |
| 16 | P3-2 | Remove `backdrop-filter: blur` from `.modal-bg` and `.client-zoom-controls` | `$impeccable polish` | open |
| 17 | P3-3 | Promote inline styles to classes | `$impeccable polish` | open |
| 18 | P3-6 | Sweep stale `elevZoom:*` `localStorage` keys | `$impeccable polish` | open |
| 19 | P3-4 | Add `Esc` to deselect; option-switch hotkeys | `$impeccable delight` | open |
| 20 | — | Final pass | `$impeccable polish` | open |

**Batches:**
1. **PR 1 — A11y & correctness** ✓ shipped to `main` 2026-05-02. Migration 020 applied to Supabase.
2. **PR 2 — Mobile polish** ✓ shipped to `main` 2026-05-02.
3. **PR 3 — Performance** ✓ shipped to `main` 2026-05-02. Low-priority studio thumbs deferred.
4. **Spinner fixes** ✓ shipped to `main` 2026-05-02 (keyframes to globals.css + loop-boundary dashoffset fix).
5. **PR 4 — CSS architecture** ✓ shipped to `dev` 2026-05-02. Globals split, Tailwind removed.
6. **PR 5 — Delete project RPC** ✓ shipped to `dev` 2026-05-02. **Pending:** apply migration 021 in Supabase SQL editor; PRs 4+5 not yet merged to `main`.
7. **Next — Type hygiene** (row 12): regen Supabase types + remove `as any` casts. Test `npm run build` carefully.
8. **After that — Polish** (rows 14–20): can ship as smaller commits or one polish PR.

---

## Scores recorded at this review

For comparison after fixes.

**Audit health: 14 / 20 (Good)**

| # | Dimension | Score |
|---|---|---|
| 1 | Accessibility | 2 |
| 2 | Performance | 3 |
| 3 | Responsive | 2 |
| 4 | Theming | 3 |
| 5 | Anti-patterns | 4 |

**Heuristic health: 30 / 40 (Good)**

| # | Heuristic | Score |
|---|---|---|
| 1 | Visibility of system status | 3 |
| 2 | Match system / real world | 4 |
| 3 | User control & freedom | 3 |
| 4 | Consistency | 3 |
| 5 | Error prevention | 3 |
| 6 | Recognition vs recall | 3 |
| 7 | Flexibility & efficiency | 2 |
| 8 | Aesthetic & minimalist | 4 |
| 9 | Error recovery | 3 |
| 10 | Help & documentation | 2 |

---

## Notes for the new session

- **Run `$impeccable critique` and `$impeccable audit` first thing.** Don't re-read this file looking for findings; re-derive them and use this file as a sanity check. If the new run disagrees, trust the new run — line numbers will have drifted and code will have changed.
- **Always read `node_modules/next/dist/docs/`** before touching Next 16 APIs. The repo's `AGENTS.md` is explicit about this.
- **`useStudio.ts` is load-bearing.** Don't refactor it speculatively. If you must edit, open the file end-to-end first, and run the happy-path manually after.
- **Production migrations don't auto-apply.** After merging a migration to `main`, `supabase db push` (or paste into the SQL editor) against each Supabase project before the corresponding code will work.
- **The user is non-technical.** Explain trade-offs in plain English; avoid jargon when offering choices.
