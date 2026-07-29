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
| 3 | Orphaned files in Storage | ⚠️ **Built 2026-07-29, not yet run** — see §6.4 |

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
  production builds).

Two unrelated studio bugs were found while testing the deployed portal and fixed in
the same session. Neither was caused by the security work.

- **`dbbde03`** — `deleteOption` destroyed the other option's elevation photo.
  Options of one elevation **deliberately share a single wall photo**: `handleSwitch`
  (`StudioScreen.tsx:310`) copies `image_path` into an empty option so A and B show the
  same room. `deleteOption` then deleted that file unconditionally. The routine way to
  end up with a single-option elevation — upload to A, click over to B, delete B —
  therefore destroyed A's photo and left its `image_path` dangling, which the client
  portal renders as an empty canvas. Now guarded by a reference check.
- **`9196d14`** — the add-artwork confirm button had no in-flight guard, so clicking
  during upload placed the whole batch again (three clicks, three copies). The client
  portal already guarded its actions this way; the studio did not.

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
actions. **Unapprove is consultant-only** and was left out of the API. There were no
debounced position saves at the time of writing — dragging persisted only via the flush
inside pick/approve. **That changed on 2026-07-29; see §6.3.**

---

## 4. Outstanding work

**4a and 4b are closed.** Tom confirmed on 2026-07-29 that share links generate and
display correctly (so migration 022's consultant token policy is good), and that the
"Test, test, test" / "The Big Room." dangling image was throwaway test data he would
delete himself. Both are struck from this list.

**4c is implemented — see §6.** Everything in §6 is written and building but
**not yet exercised against a signed-in session.**

### 4c. PR-D — storage sweep (implemented, see §6.4)

Spec is `docs/handover-security-and-cleanup.md` §5, unchanged. In brief: a
`POST /api/admin/sweep-storage` route, consultant-authenticated in-route (middleware
excludes `/api/`), service client, `{ dryRun: true }` support, returning
`{ scanned, orphans, deleted }`. Also patch `useStudio.ts → uploadElevation()` to
remove the previous `image_path` after a successful replace.

**Deploy order: app first** (additive route, no migration). Follow
`src/app/api/thumbnails/[optionId]/route.ts` for the auth pattern.

Two things learned this session that sharpen the spec:

- **`deleteArtwork` (`useStudio.ts:1597`) deletes the database row and nothing else**,
  so every removed artwork leaks its file permanently. This is the main way orphans
  accumulate, more than the re-upload path the original spec emphasises.
- **An elevation image may be referenced by more than one option** (see `dbbde03`
  above). Any sweep must treat a file as live if *any* row references it, and must not
  assume one file per option.

### 4d. Known pre-existing bugs, none introduced by this work

- **Expired magic links return HTTP 200** while rendering the 404 page. Caused by
  `client/[token]/loading.tsx` flushing headers before `notFound()` runs. Invisible to
  visitors; wrong for crawlers and uptime monitoring.
- **`formatApprovalTimestamp`** (`src/lib/utils.ts:20`) renders 24-hour times with an
  am/pm suffix — the portal shows "Approved 21:12 pm".
- ~~Dragging an artwork does not save on its own.~~ **Resolved 2026-07-29** — Tom asked
  for it to persist; the client portal now saves on drop. The consultant side always
  did. See §6.2.
- `npm run lint` reports ~111 pre-existing errors across the codebase. This work
  reduced the count; none of them are new.

### 4e. Tom's notes — received 2026-07-29, all actioned in §6.

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

---

## 6. Session of 2026-07-29 — Tom's feedback round

Twelve items from Tom after testing production. All are **app-only changes — no
migration, so deploy order does not matter for any of them.** `npx tsc --noEmit`,
`npx next build` and `npx eslint` all pass, with the lint count unchanged from
before (11 problems, all pre-existing).

### 6.1 Decisions Tom made this session

- **Corner rounding: 4px on controls.** Panels/cards 6px, badges 3px — held in
  `--radius` / `--radius-sm` / `--radius-xs` in `globals.css`. Change those three
  values to retune the whole app. Canvas, artwork overlays and image thumbnails
  stay square deliberately: rounding them clips artwork.
- **Regenerating a client link kills the old one immediately.** Implemented by
  setting `expires_at` to now, *not* by deleting the row — see §6.7. Both gates
  test `expires_at > now()`, so the link dies either way, but a surviving row is
  what lets the old URL show the explanation instead of a bare 404.
- **Expired links get an explanation page only** — no contact form, no email
  address, no notification back to the consultant.

### 6.2 Diagnoses worth keeping

- **Consultant drag already persisted.** `useStudio.ts` saves on mouse-up via
  `debounceSave`. §4d of this document said dragging "does not save on its own" —
  that was only ever true of the **client portal**. Corrected.
- **"Shown to client" only ever leaked on Installation.** `CustomLineItems` and
  `ConsultantFeeRow` filtered correctly; `InstallationRow` rendered its row
  regardless and hid only the controls. `TotalsPanel` already excluded it from the
  client's total, so the client saw a line that wasn't in the sum.
- **The Active / Archived tabs were in the wrong font** because `.dash-view-tab`
  never set `font-family` and buttons do not inherit it. They were the only two
  controls in the app rendering in the browser's default UI font.
- **The eye icon felt slow because of the canvas, not the network.** Every toggle
  bumped `rerenderKey`, which tore down and rebuilt all overlays and re-decoded the
  elevation image behind a spinner. An in-flight lock also swallowed clicks until
  the previous round trip returned.
- **The header title overlaps at ~1285px, not 900px.** Measured against the real
  markup: the right-hand group is ~530px wide in the approved state (it gains the
  "✓ Approved" chip and Unapprove) and the title is 185px at its new size. The old
  900px breakpoint was sized for the *unapproved* header only.

### 6.3 What changed

| Item | Where |
|---|---|
| Client drag now persists on drop (debounced 600ms) | `ClientPortal.tsx`, `ClientElevation.tsx` |
| Eye icon snaps instantly; write debounced 500ms; decoded images cached | `ClientPortal.tsx`, `ClientElevation.tsx` |
| Installation row hidden from client when "Shown to client" is off | `InstallationRow.tsx` |
| Consultant header title 15px → 22px, matching the client portal | `studio.css` |
| Header title hides before it can overlap (two content-aware breakpoints) | `studio.css`, `StudioScreen.tsx` |
| Active / Archived font fixed | `dashboard.css` |
| 4px rounding system | `globals.css` + all four stylesheets, `FeedbackButton.tsx` |
| "Prepared by C&K" replaces the shared login's profile name | `ClientPortal.tsx` |
| Budget field label gains "exc VAT" | `DashboardClient.tsx` |
| "Generate a different link", with a confirm step | `ShareModal.tsx`, `StudioScreen.tsx` |
| Expired-link warning bar in the studio | `StudioScreen.tsx`, `studio.css` |
| Expired-link explanation page for clients | `ClientLinkExpired.tsx`, `client/[token]/page.tsx` |
| Storage sweep endpoint (PR-D) | `api/admin/sweep-storage/route.ts` |
| Elevation re-upload and `deleteArtwork` stop leaking files | `useStudio.ts` |

Two details in there are easy to undo by accident:

- `regenerateShareToken` **inserts the new token before deleting the old rows.** If
  the delete fails the project has two working links, which is recoverable; the
  other order can leave it with none.
- `removeUnreferencedElevationImage` and the `deleteArtwork` cleanup both **check
  for other rows referencing the same path first.** Options of one elevation share
  a wall photo (see `dbbde03`); an unconditional delete reintroduces that bug.

### 6.4 The storage sweep — how to run it

`POST /api/admin/sweep-storage`, signed in as a consultant. **Defaults to a dry
run**: only an explicit `{"dryRun": false}` deletes anything. There is no UI yet —
call it from the browser console while logged in:

```js
await (await fetch('/api/admin/sweep-storage', {
  method: 'POST', headers: {'Content-Type':'application/json'},
  body: JSON.stringify({ dryRun: true })
})).json()
```

Returns `{ scanned, orphans, deleted, skippedRecent, paths }`.

**Eyeball `paths` on the first production dry run before ever passing
`dryRun: false`.**

### 6.4b The nightly cron

`vercel.json` schedules a **GET** on the same route at 03:00 UTC daily. Tom asked
for this on 2026-07-29 having been told it deletes with nobody reviewing first.

Two environment variables, both set in Vercel → Settings → Environment Variables:

| Variable | Required | Effect |
|---|---|---|
| `CRON_SECRET` | **Yes** | Vercel sends it as `Authorization: Bearer …`. Without it the GET returns 503 and the cron does nothing. |
| `CRON_MAX_DELETIONS` | No | Overrides the 200-file cap on a single unattended run. |

**The GET fails closed.** No `CRON_SECRET` configured → 503, every time, for
everyone. An unauthenticated GET that deletes files is the one mistake worth
engineering against, so absence of config disables the feature rather than
opening it.

Four rails protect the unattended run:

1. Files younger than 24h are never touched — uploads write the file before the
   row, so a sweep landing in that gap would otherwise eat a fresh upload.
2. If the database reports no live image paths at all, the sweep aborts. That
   reads as a failed query, not an empty system.
3. More than `CRON_MAX_DELETIONS` orphans in one run → it deletes nothing and
   returns 409 with the list. A schema change or a bug in path-matching looks
   exactly like "everything is an orphan", and this is what stops that from
   emptying the buckets overnight.
4. **Any bucket where nothing at all matched a live row aborts the run.** Added
   2026-07-29 after the first dry run (§7.3). Storage keys and the paths held in
   the database are compared as plain strings; if the two formats ever drift,
   every file in that bucket is reported as an orphan — and that failure looks
   exactly like a plausible list of real paths. One match proves the comparison
   still works. Zero matches on a non-empty bucket is refused, 409
   `no-matches-in-bucket`.

Rails 1, 2 and 4 also apply to manual POSTs. Rail 3 does not — a person can read
the list first.

Outcomes go to the Vercel function logs, tagged `[sweep-storage]` with `manual`
or `cron`. **There is no notification**: if the cron aborts on rail 3, nothing
tells Tom. Worth revisiting once it has run a few times.

Note that Vercel's free tier runs crons **once daily and only against
production**, so the preview deployment will not sweep anything.

### 6.5 Not yet verified — the honest list

The dev server cannot be signed into from an agent session, so everything behind
the consultant login is **code-complete but untested at runtime**. Confirmed
working: the login page, the expired-link page (rendered via a temporary route,
since removed), an unauthenticated sweep POST returning 401, and the full build.

Still to try by hand:

1. Dashboard — Active/Archived font and the rounding.
2. Studio header at ~1200px wide with an elevation approved — the title should
   vanish rather than collide.
3. Budget — untick "Shown to client" on Installation, then check a client link.
4. Client portal — click the eye icon rapidly; it should keep up. Drag an artwork,
   reload without picking; the position should hold.
5. Share modal — "Generate a different link", then confirm the old URL 404s.
6. Storage sweep dry run.

### 6.6 Still open

- `formatApprovalTimestamp` renders "21:12 pm" (§4d). Untouched.
- Expired magic links return HTTP 200 (§4d). The new expired page returns 200 by
  design; a genuinely unknown token still 404s.
- No UI for the storage sweep — console only for manual runs.
- **The authenticated cron path has never been executed.** Only its refusals are
  verified (no secret → 503, wrong token → 401, POST without a session → 401).
  Exercising the success path means sending a valid token to an endpoint that
  deletes files from the production bucket, which was not worth doing blind.
  Do a manual dry run first, then let the first scheduled run happen and read
  the Vercel logs.

---

## 7. Follow-ups from Tom's preview testing (2026-07-29)

Tom worked through §6.5 on the Vercel preview. Items 1, 2, 4 confirmed working:
dashboard fonts and rounding, header collision behaviour, the eye icon and client
drag. Two things came back.

### 7.1 Empty "Additional Costs" heading — fixed

Unticking "Shown to client" correctly removed the row, but with *every* row
hidden the client still saw the section heading above an empty panel.
`BudgetScreen` now hides the whole section unless something in it is visible,
via `hasClientVisibleCosts()`. That helper duplicates the per-row rules — a
missing `shownToClient` counts as true for installation, the fee needs to exist
*and* be flagged, custom items need at least one flagged. **Keep it in step with
InstallationRow, ConsultantFeeRow and CustomLineItems**, or the heading and its
contents will disagree.

The consultant always sees the section; it holds the controls for adding to it.

### 7.2 A replaced link 404'd instead of explaining — fixed

The gap: `regenerateShareToken` **deleted** the old rows, so the old URL resolved
to an *unknown* token, and unknown tokens deliberately 404 (a mistyped URL must
not confirm a project exists). Only a row that still existed with a past expiry
reached the explanation page. Replaced links therefore got the bare 404 —
inconsistent with expired ones, and not what Tom expected.

Old links are now retired by **setting `expires_at` to now** rather than by
deleting the row. The portal page and the action route both gate on
`expires_at > now()`, so the link stops working exactly as immediately as before,
but the row survives and the old URL reaches the explanation.

No migration: migration 011's "Consultants update tokens via project" policy
already permits the update.

Consequence for the copy: that page now covers two different situations — a link
that ran out its 90 days, and one deliberately replaced. It no longer says
anything about time running out, because that is false in the second case. It
reads "This link is no longer active". If a future change needs to tell the two
apart, that needs a `revoked_at` column and therefore a migration.

Retired rows accumulate rather than being cleaned up. They are inert (every read
path checks expiry) and serve as an audit trail, but nothing prunes them.

### 7.3 First production dry run — 2026-07-29

`scanned 68 · orphans 35 · skipped as under 24h 7`, broken down as 6 elevation
images, 17 artwork images, 12 thumbnails.

The list was consistent with all three known leaks and with nothing else:

- Four of the six elevation orphans sat in one option folder
  (`bdcfcf85…/0b30e653…`) with timestamps minutes apart — `uploadElevation`
  orphaning the previous file on each re-upload.
- That same option UUID appeared in the orphaned thumbnails *and* had two
  orphaned artwork files: a deleted project whose storage was stranded by
  `deleteProject`'s best-effort browser cleanup.
- The 17 artwork orphans match `deleteArtwork` leaking a file per removal.

**What made the run trustworthy was the match rate, not the list.** Roughly 33
of 68 files matched a live row, which proves the path comparison works — a
broken format would have flagged all 68. That reasoning could only be done by
hand because the response reported one global total, so the endpoint now returns
per-bucket `scanned` / `matched` / `orphans` / `livePathsInDb`, and rail 4 above
enforces the same check automatically.

**Thumbnails remained unverified at that point** — all 12 were flagged with no
visible total, so there was no way to tell 12-of-21 (fine) from 12-of-12 (a
broken check that would have blanked the dashboard). Re-run the dry run and
confirm `buckets.thumbnails.matched > 0` before any real run.
### 7.4 Sweep run for real — 2026-07-29

`deleted 35 of 35 orphans`, with per-bucket counts identical to the dry run
immediately before it (elevation 13/7/6, artwork 36/12/17+7 skipped,
thumbnails 19/7/12). The sweep removed exactly what it previewed and nothing
else, which is §5.3's acceptance criteria met: dry run listed plausible
orphans and deleted nothing; the real run deleted only those paths; every
image still referenced survived — `matched` equalled `livePathsInDb` on both
image buckets, so nothing live was touched.

Unauthenticated POST → 401 was verified earlier. **Issue 3 is closed.**

### 7.5 A note on nudging the expired page's wordmark

`ck-wordmark-white.png` carries roughly **16% of its own height as empty space
below "Kwan"**, so the element's box is nowhere near where the letterforms
end. `margin-bottom: 28px` renders as a ~49px gap to the cap-height of the
title beneath it.

If asked to move it again, change the margin by the amount you want the
*visible* gap to change, and re-measure rather than reasoning from the CSS.
The measurement is a canvas pixel-scan for the last inked row of the PNG plus
`TextMetrics.actualBoundingBoxAscent` for the title's cap top — the numbers
above came from that, not from eyeballing a screenshot.
