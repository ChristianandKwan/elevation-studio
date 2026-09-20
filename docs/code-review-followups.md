# Code review follow-ups

Source of this document: a senior-level review of the Elevation Studio codebase done 2026-04-21 against commit `5d68904` (`dev` branch). Two top findings have already shipped on `dev`:

- **A1 — Dashboard thumbnail pre-compute** (commit `723144d`). Requires `supabase/migrations/017_option_thumbnails.sql` to be applied in each environment before the new `dashboard/page.tsx` works; until then the projects query fails on the missing `elevation_options.thumbnail_path` column and the dashboard renders empty. Update: `supabase/migrations/017_option_thumbnails.sql` has been run. 
- **A2 — Logo compression + `next/image`** (commit `b9e27a0`). ~96% reduction across four wordmark assets; critical-path logos now served via `next/image` with explicit dimensions.

Everything below is still open.

Project context a fresh session will need:

- Next.js **16** + React 19 + Supabase (`@supabase/ssr`). `AGENTS.md` at the repo root explicitly warns: *"This is NOT the Next.js you know"* — APIs, conventions, and file structure may differ from training data. **Read `node_modules/next/dist/docs/` before writing code that touches Next APIs** (route handlers, caching, server actions, `next/image`, etc.).
- Data model: `projects → elevations → elevation_options (A/B variants) → artworks`. Definitions in `src/types/index.ts`; Postgres schema and RLS in `supabase/migrations/`.
- The core studio state hook lives in `src/hooks/useStudio.ts` (~1.7 KLOC). It's load-bearing — touch with care.
- There's a dedicated service-role helper at `src/lib/supabase/server.ts` (`createServiceClient`) for privileged work. A plain user-scoped client is `createClient()` from the same module.

---

## Next up — prioritised

### A4 — Batch `createSignedUrls` on the client portal (and consultant project page)

**Problem.** Both SSR pages below create signed URLs one file at a time. For a project with 5 elevations × 2 options × 6 artworks, that's up to 60 round trips to Supabase storage before the page can render.

- `src/app/client/[token]/page.tsx:99–111` — `supabaseService.storage.from('elevation-images').createSignedUrl(...)` inside nested `Promise.all`s, one call per elevation image and one per artwork.
- `src/app/(consultant)/projects/[id]/page.tsx:70–82` — same pattern with the user-scoped client.

The client portal is the customer-facing screen; cutting its TTFB is the highest-value part of this fix.

**Why it matters.** Each `createSignedUrl` is a separate RPC. Even at ~20 ms per call on a warm server, 60 serial-ish calls is >1 s of pure network time — and the rest of the page can't stream until they resolve.

**Fix.** Supabase storage supports `createSignedUrls` (plural) which takes an array of paths and returns signed URLs in a single request. Collect all elevation paths and all artwork paths up front, make two batched calls per bucket, then rehydrate the per-option / per-artwork structure.

Rough shape:
```ts
const elevPaths = options.map(o => o.image_path).filter(Boolean)
const artPaths  = options.flatMap(o => (o.artworks ?? []).map(a => a.image_path))
const [{ data: elevSigned }, { data: artSigned }] = await Promise.all([
  supabase.storage.from('elevation-images').createSignedUrls(elevPaths, 259200),
  supabase.storage.from('artwork-images').createSignedUrls(artPaths, 259200),
])
// build a Map<path, signedUrl> and look up as you construct the response
```

**Gotchas.**
- `createSignedUrls` returns entries in the same order as the input array, but the safer pattern is to build a `path → signedUrl` map.
- Deduplicate paths before the call — the same artwork may appear on both options A and B.
- Preserve the existing 3600 s / 259200 s expiries (consultant vs client token page use different values).
- The consultant page uses the user-scoped client (RLS-enforced signed URLs); the client portal uses the service client. Don't accidentally cross-wire.

**Test plan.**
- Load a project with ≥3 elevations via the client portal, confirm all images render.
- Check the browser Network tab for a single `/storage/v1/object/sign/*` request per bucket instead of N.
- Expire-time sanity check: signed URL should still work after a page reload.

---

### B3 — Client portal error handling

**Problem.** Every mutation from the client portal is optimistic, fire-and-forget, with no rollback and no user-visible error state. If the DB call fails the UI shows one thing and the database holds another — silent drift on a customer-facing screen.

Sites in `src/components/client/ClientPortal.tsx`:

- `:205` — `toggleVisibility`, updates local state then `supabase.from('artworks').update(...)` with no `.catch`.
- `:226` — `handlePick` — same pattern on `elevations.update`.
- `:241` — `handlePick` insert into `activity_logs`.
- `:249` — `handleClearPick` — `elevations.update` again.
- `:261` — `handleApprove` — `activity_logs` insert + option update.

**Why it matters.** A client tells their consultant "I approved option B." The consultant sees no approval. Or a client unapproves and the consultant still sees it as approved. This is the worst kind of bug to ship because both users think the system is working.

**Fix.** For each mutation:

1. Capture the previous local state before optimistically applying.
2. `await` the Supabase call and check `{ error }`.
3. On error: revert local state and show a toast (there's an existing `StatusToast` at `src/components/ui/StatusToast.tsx` that can be reused or matched).
4. Disable the triggering button while in-flight to prevent double-submit.

Pattern:
```ts
async function handleApprove(optionId: string) {
  if (inFlightRef.current.has(optionId)) return
  inFlightRef.current.add(optionId)
  const prev = localOptions  // snapshot for rollback
  setLocalOptions(applyApproval(prev, optionId))
  try {
    const { error } = await supabase.from('elevation_options').update(...).eq('id', optionId)
    if (error) throw error
    await supabase.from('activity_logs').insert(...)  // also check error
  } catch (err) {
    setLocalOptions(prev)
    showToast('Could not save. Check your connection and try again.')
  } finally {
    inFlightRef.current.delete(optionId)
  }
}
```

**Gotchas.**
- There's no auth on the client portal beyond the share token; RLS on `elevations` and `artworks` must actually allow writes via the token flow. Check `supabase/migrations/` for the relevant policies — if writes were failing silently because of RLS, the current code would hide that.
- `activity_logs` inserts in the same handler are a second await; if the primary write succeeds but the log insert fails, pick a policy (roll back? log client-side? leave it?). Probably: log to Sentry-equivalent, don't fail the user's action.
- Preserve optimistic UX — don't make approve feel slow. Revert only on actual error.

**Test plan.**
- Manual: open client portal, block `*.supabase.co` in DevTools, click Approve — UI should revert and show an error.
- Manual: rapid double-click Approve — only one mutation should fire.
- Verify in Supabase logs that writes are succeeding under normal conditions (not being suppressed by RLS).

---

### B1 + B2 — `loadOption` failure path + `finalize` RAF cap

**Problem.** In `src/hooks/useStudio.ts`:

1. **`loadOption` silently accepts failed artwork loads** (~line 963 in the pre-split file; grep for `ai.onerror`). An `ai.onerror = () => tryFinish()` fires `tryFinish()` even though `newArts[i].img` was never assigned. Downstream `renderArtworksDOM` reads that `img` to draw onto canvas — it either draws nothing or crashes depending on branch. One expired signed URL can wipe the whole canvas.
2. **Unbounded `requestAnimationFrame` retry in `finalize()`** (~line 926–933; grep for `const finalize` / `requestAnimationFrame(run)`). If `elevWrapRef.current` is ever null — e.g. unmount-remount race — the function loops forever scheduling RAFs with no cap and no bail-out.

**Why it matters.** Both are "artworks disappeared / app feels broken" bug classes. Each is a few lines of defence to eliminate.

**Fix — B1 (`loadOption`).**

- Mark failed artworks explicitly: `newArts[i].loadFailed = true` in the `onerror` handler.
- Add a `loadFailed` optional field on the `Artwork` type in `src/types/index.ts`.
- In `renderArtworksDOM` and anywhere else that draws from `a.img`, skip or render a placeholder tile (e.g. a grey rectangle with the artwork name) when `loadFailed` is true.
- Add a per-image timeout (e.g. 10 s) so a hanging load doesn't block `tryFinish()` either — set `ai.src`, start a `setTimeout`, clear it in both `onload` and `onerror`.
- Surface a toast listing any failed artworks.

**Fix — B2 (`finalize`).**

- Cap the retry count (e.g. `const MAX_FRAMES = 60` — ~1 s at 60 fps).
- On exceeded cap, log a warning and bail. The whole point of the retry is to wait for a ref that *should* be set imminently; a real "never set" outcome should not silently loop forever.

```ts
const finalize = (arts: Artwork[]) => {
  let frames = 0
  const run = () => {
    if (!elevWrapRef.current) {
      if (++frames > 60) {
        console.warn('[useStudio] finalize: elevWrapRef never set, bailing')
        return
      }
      requestAnimationFrame(run)
      return
    }
    // ... existing body
  }
  requestAnimationFrame(run)
}
```

**Gotchas.**
- `useStudio.ts` is large and has many call sites — regression risk is real. Before shipping, open a project with artworks and confirm nothing about canvas rendering changes in the happy path. Pay special attention to the first-load sequence (recent commit `5d68904` already fixed an "artworks not visible on first load" bug).
- Line numbers drift; grep for the string patterns above rather than trusting literal line numbers.

**Test plan.**
- Temporarily break an artwork's `imageUrl` in the DB (append garbage to the `image_path`) and confirm the rest of the canvas still loads, with a placeholder + toast for the broken one.
- Verify no regression on the happy path (full project load with several elevations).
- (If possible) verify the RAF cap by racing unmount during load — e.g. click a project, click back immediately.

---

### A3 — Deduplicate `getUser()` across middleware + layout + page

**Problem.** A single consultant navigation to `/dashboard` runs `supabase.auth.getUser()` up to three times:

1. `middleware.ts:27` — runs on every non-static request via the matcher.
2. `src/app/(consultant)/layout.tsx:10` — again inside the layout.
3. `src/app/(consultant)/dashboard/page.tsx` (~line 165) — again inside the page; the `projects/[id]/page.tsx` and `client/[token]/page.tsx` pages do the same.

Each `getUser()` is a JWT verification + user fetch (network round trip to Supabase), roughly 50–300 ms depending on region.

**Why it matters.** Stacking three of these adds up to ~0.5–1 s of avoidable latency on every consultant navigation.

**Fix.**

1. **In middleware**, switch to `supabase.auth.getSession()` where possible — that's a cheap JWT parse against the cookie, no network round trip. Only call `getUser()` when you need a guaranteed-fresh claim (e.g. writes).
2. **Inside the render tree**, wrap a single `getUser()` helper with React's `cache()` so layout and page share one call per request:

   ```ts
   // src/lib/supabase/auth.ts
   import { cache } from 'react'
   import { createClient } from './server'

   export const getCurrentUser = cache(async () => {
     const supabase = await createClient()
     const { data: { user } } = await supabase.auth.getUser()
     return user
   })
   ```

   Replace the `const { data: { user } } = await supabase.auth.getUser()` call in both the consultant layout and every page that needs the user with `const user = await getCurrentUser()`. `cache()` dedupes per-request.

**Gotchas.**
- `@supabase/ssr` caches inside its own instance too — but each `createClient()` call currently builds a new instance, so the cache doesn't deduplicate across layout + page. Sharing via `cache()` is the reliable fix.
- Make sure the middleware still refreshes expired tokens — that's one of the documented reasons `getUser()` is used there. If switching to `getSession()` in middleware is a concern, leave middleware alone and just fix the layout/page redundancy.
- `.env.local` must already define `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` for any of this to work.

**Test plan.**
- Log in as a consultant. Watch the Network tab: a dashboard navigation should show at most one `/auth/v1/user` request, not three.
- Sign out from another tab; subsequent nav should still detect the expired session and redirect to `/login`.

---

## Everything else from the review (reference)

Grouped by theme. All live on `dev` at commit `5d68904` except where noted. File paths given relative to the repo root; line numbers drift as code changes — grep the surrounding snippet if the line no longer matches.

### Load-path (speed)

- **Middleware `getUser()` on every request** — see A3 above.
- **`globals.css` is 54 KB** (`src/app/globals.css`). Verify Tailwind v4 is actually stripping unused utilities in the production build. If not, that's a blocker.
- **Google Fonts loaded via `<link>` in `layout.tsx:17–21`** instead of `next/font/google`. Switching to `next/font` self-hosts the fonts, preloads them, and eliminates the render-blocking request to `fonts.googleapis.com`.
- **`tsconfig.tsbuildinfo` is 116 KB in the repo root.** Confirm `.gitignore` covers it (current status is clean, so probably fine — but worth a glance).

### Reliability / error paths

- **`uploadElevation` DB write is fire-and-forget** (`src/hooks/useStudio.ts` ~line 997, `.then(() => {})` on the `elevation_options.update(...)` for `image_path`, `orig_w`, `orig_h`). If it fails, the image uploads to storage but the row never points at it; next load = blank elevation.
- **`persistOption` masks partial failures** (`src/hooks/useStudio.ts` ~1381–1422). One try/catch wraps the whole batch; flashes `error → idle` without telling the user which rows failed. Split per-entity try/catch, surface a Retry control.
- **`deleteElevation` non-atomic** (`src/components/studio/StudioScreen.tsx` ~347). Three separate Supabase calls; mid-sequence failure leaves orphans. Move to a Postgres RPC / edge function with a transaction.
- **`deleteProject` non-atomic** (`src/components/dashboard/DashboardClient.tsx` ~164–200). Same pattern — storage delete then DB delete, errors swallowed; orphan files accumulate.
- **`AddArtworkModal` FileReader has no error path** (`src/components/studio/AddArtworkModal.tsx:85`). `Promise.all(readers)` has no `onerror`; a corrupt file hangs the modal forever in loading state. Add `reader.onerror = () => reject(...)` + surface.
- **`.single()` on no-rows expected** at `src/app/(consultant)/projects/[id]/page.tsx:119` (client token row) and the share-token insert path in `src/components/studio/StudioScreen.tsx` (~520). Use `.maybeSingle()` — avoids 406 log noise and confusing error paths.
- **Document-level drag listeners leak on unmount-mid-drag** in `src/hooks/useStudio.ts` (~823–846). Register cleanup in a `useEffect` return, not only inside the `up()` handler.
- **`exportPng` uses `toDataURL` on potentially huge canvases** (`src/hooks/useStudio.ts` ~1543). Blocking and memory-heavy. Swap to `toBlob` + `createObjectURL` + `revokeObjectURL`.
- **`useStudio.ts:192` dead ternary**: `svg.style.pointerEvents = adjustMode ? 'none' : 'none'`. Clearly a bug vs. intent — probably `'all' : 'none'`.
- **Zoom and artwork save timers fire on independent debounces** (1500/2000 ms in `useStudio.ts` ~1361, 1367). A crash in the gap loses edits. Add a `beforeunload` flush, or merge the timers.
- **Modals lack Escape-to-close** across Studio (`StudioScreen.tsx`, `AddArtworkModal.tsx`, `CalibrationModal.tsx`, `ShareModal.tsx`) and client side. Add a single `useEffect` that listens on `document` while the modal is open.
- **Buttons don't `disabled` during async work** (Export PNG, approve, pick). Double-submit risk.
- **Service-role client constructed with `createServerClient` + user cookies** (`src/lib/supabase/server.ts:30`). Service role should never be pinned to a user's cookie jar — use a plain `@supabase/supabase-js` `createClient` with `auth: { persistSession: false }`.

### Budget correctness (`src/components/budget/`)

- **`budgetCalc.ts:127`** — `Math.min(...[])` / `Math.max(...[])` return ±Infinity on empty artwork lists, which can propagate into totals as `NaN`. Guard up-front.
- **`TotalsPanel`** — rounds per-line VAT, then rounds the grand total. The two won't always match to the penny. Pick a canonical direction and derive the other.
- **`ClientElevation.tsx:80`** — `totalCost` ignores hidden artworks; Approve has no guard for a zero-visible selection.
- **`ConsultantFeeRow`** — accepts non-integer percentage fees without bounds check.

### Numerical robustness

- **`lib/homography.ts:165`** — `const factor = M[row][col] / M[col][col]` has no zero-pivot guard. Degenerate quads produce `NaN`s in the CSS `matrix3d(...)` output rather than throwing; the callers' `try/catch` won't catch `NaN`. Add a pivot-magnitude check and throw.

### Performance (micro)

- **`ClientElevation.tsx:463–498`** — snap-candidate loop runs O(n) per mousemove; O(n²) overall for a long drag. Only bites on 50+ artworks on one elevation, but the app is sized for it.
- **Studio sidebar artwork list not memoised; every keystroke in a price field re-emits up** (per review of `src/components/studio/StudioSidebar.tsx`). Memoise `ArtworkItem` and batch updates.
- **Tab switch deep-spreads the elevations array** (`src/components/studio/StudioScreen.tsx` ~263–290, 306–315). Large projects freeze the thread briefly on switch.

---

## How to work with this list

- Each open item has enough context to start. If you're planning more than a one-off fix, read the relevant file end-to-end before touching it — especially `useStudio.ts`, which has implicit invariants.
- Always re-read the project root `AGENTS.md` and `CLAUDE.md` before editing — Next 16 has breaking changes vs. training data, and the instructions there override defaults.
- After any fix, run `npx tsc --noEmit` and `npm run build` — the repo is strict TS.
- Migrations go in `supabase/migrations/` with a numeric prefix. Note that **production does not auto-apply migrations** — after merging to `main`, someone has to `supabase db push` (or paste into the SQL editor) against each Supabase project before the corresponding code will work. Migration 017 (already merged) is the first example of this trap.
