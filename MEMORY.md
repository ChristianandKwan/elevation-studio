# Elevation Studio — Project Memory

## What This Is
A bespoke web app for **Christian & Kwan**, a London art consultancy.
It allows consultants to photograph a client's wall, place scaled artwork onto it,
and share a live proposal link with the client for approval.

Built with: **Next.js + Supabase**, deployed on **Vercel**. (Note: this is a newer version of Next.js with breaking changes — always read `node_modules/next/dist/docs/` before writing Next.js-specific code.)

---

## People
- **Client:** Christian & Kwan art consultancy
- **Developer contact:** tommggeorge (GitHub)
- **Claude sessions:** User is non-technical — explain things in plain English, avoid jargon

---

## Live URLs
| Environment | URL |
|-------------|-----|
| Production | `studio.christianandkwan.com` *(DNS pending)* |
| Vercel default | `elevation-studio-psi.vercel.app` |
| Local dev | `http://localhost:3000` |

---

## Credentials & Services
| Service | Detail |
|---------|--------|
| Supabase project URL | `https://tapdsvqultcexwaibrvn.supabase.co` |
| GitHub repo | `github.com/ChristianandKwan/elevation-studio` |
| Vercel project | `elevation-studio` |
| Domain registrar | Hostinger |

> ⚠️ Never paste the service role key into chat or commit it to GitHub.
> It lives only in `.env.local` (local) and Vercel environment variables (production).

---

## App Structure

### Screens
- **Login** — `/login` — consultant email/password auth
- **Dashboard** — `/dashboard` — project cards, create new project
- **Studio** — `/projects/[id]` — main working screen:
  - Upload wall photo (elevation)
  - Calibrate scale by drawing a line on a known measurement
  - Add artwork images, drag to position, resize by entering cm dimensions
  - Option A / Option B tabs per elevation
  - Share button generates a client portal link
- **Client Portal** — `/client/[token]` — public-facing, no login required:
  - Client views the proposal
  - Client can approve

### Key Files
```
src/
  app/
    (auth)/login/          — login page
    (consultant)/
      dashboard/           — project list
      projects/[id]/       — studio screen
    api/share/             — generates client token (server-side)
    client/[token]/        — client portal
  components/
    studio/
      StudioScreen.tsx     — main studio wrapper
      StudioCanvas.tsx     — canvas, calibration, drag logic (ported from prototype)
      StudioSidebar.tsx    — artwork list panel
      CalibrationModal.tsx — draw scale line UI
      AddArtworkModal.tsx  — upload + size artwork
      ShareModal.tsx       — generate + copy client link
    dashboard/
      DashboardClient.tsx  — project grid
    client/
      ClientPortal.tsx     — client view wrapper
      ClientElevation.tsx  — read-only canvas for client
  lib/
    supabase/
      client.ts            — browser Supabase client (anon key only)
      server.ts            — server Supabase client + service role client
```

---

## Architecture Notes

- **`useStudio` hook** (`src/hooks/useStudio.ts`) — all canvas logic lives here. Uses `stateRef` pattern so event handlers always read current state without stale closures. Artwork positions are mutated imperatively in the DOM; `debounceSave()` persists to Supabase.
- **`StudioScreen.tsx`** — manages active elevation/option. Uses `skipNextLoadRef` to prevent double-loading when `loadOption` is called directly. Syncs artwork positions back into `elevations` state before each tab switch (prevents stale-position bugs on back-navigation). Tracks `projectStatus` in local state so `generateShareToken` never downgrades an approved project back to `'sent'`. Consultant Unapprove button lives here — shown in header when `activeOptData?.approved` is true.
- **Client portal** (`src/components/client/`) — `optionsState` keyed `[elevId][optionLetter]` keeps positions/visibility across tab switches. Clients can move artworks and toggle visibility. Notes debounced 800ms to `elevation_options.client_notes`.
- **Rubber-band select** — `useStudio.onWrapMouseDown`; `boxSelectedRef` + 100ms timeout suppresses the post-mouseup click-to-deselect.
- **Option B** — auto-copies elevation image from Option A on first switch (via `handleSwitch` in `StudioScreen.tsx`).

---

## Database (Supabase)
Tables: `profiles`, `projects`, `elevations`, `elevation_options`, `artworks`, `activity_logs`, `client_tokens`

- RLS is **enabled on all tables** ✅
- Schema lives in `supabase/migrations/001_schema.sql`
- Storage buckets: `elevation-images`, `artwork-images`
- Storage policies in `supabase/migrations/002_storage.sql`
- `elevation_options` has a `foreground_masks` JSONB column (added in `003_foreground_masks.sql`) — stores an array of polygons, each polygon being an array of `{x, y}` points in 0–1 fractional coordinates
- `elevation_options` also has a `client_notes text` column (added in `005_client_notes.sql`) — run this in Supabase SQL Editor if not yet applied: `ALTER TABLE elevation_options ADD COLUMN client_notes text;`

---

## Deployment
- **Vercel** auto-deploys when code is pushed to the `main` branch on GitHub
- Environment variables are set in Vercel dashboard (not in code)
- Local dev uses `.env.local` (gitignored — never committed)

### Branch structure
- `main` — production branch, **protected** (no direct pushes). Vercel auto-deploys this.
- `dev` — working branch. All changes go here first, tested via Vercel preview URL, then merged to main via GitHub pull request.

### Deploy workflow
```
# 1. Make changes on dev branch, push:
git add -A
git commit -m "describe what changed"
git push

# 2. Vercel builds a preview at a dev-specific URL — test there

# 3. When happy, either:
#    a) Promote to production directly in the Vercel dashboard
#       ("Promote to Production" button on the deployment) — no GitHub steps needed
#    b) Or merge dev → main via GitHub Pull Request:
#       GitHub → Pull requests → New pull request → base: main, compare: dev
#       Create pull request → Merge pull request → Confirm merge
#       Vercel auto-deploys main in ~1 minute
```

---

## Security Status
| Item | Status |
|------|--------|
| RLS on all tables | ✅ Done |
| Service role key server-side only | ✅ Confirmed |
| `.env.local` not in GitHub | ✅ Confirmed |
| Email confirmation (Supabase Auth) | ⚠️ Currently OFF — turn on before going live with real clients |
| Client portal token expiry | ⚠️ Set to 90 days in schema — change to 6 weeks (42 days) |
| Login rate limiting | ⚠️ Not yet implemented — low priority for now |

---

## Known Issues & Pending Work

### Infrastructure
- [ ] DNS for `studio.christianandkwan.com` — CNAME record needs adding in Hostinger
- [ ] Re-enable email confirmation in Supabase before real client use
- [ ] Client portal token expiry — update schema default from 90 days to 42 days
- [ ] Run DB migration if not yet applied: `ALTER TABLE elevation_options ADD COLUMN client_notes text;`

### Bugs
- [ ] **Dashboard kebab menu (3-dot) can't be dismissed by clicking away** — user must click Archive or Delete to exit; clicking elsewhere has no effect. Needs an outside-click handler to close the menu.

### Feature backlog (priority order)
1. **Rename project / elevation** — inline edit or modal, saves to DB
2. **Unarchive project** — recall from archive (`archived = false`), needs an archived view on dashboard
3. **Client option selection flow** — two-stage approval per elevation:
   - **Stage 1 — "Pick"**: Client selects Option A or B. The unpicked option tab disappears. Client can still move artworks, toggle visibility, and add notes on their picked option. Pick state is persisted — if client closes and reopens the portal, they land back on their picked option.
   - **Stage 2 — "Approve"**: Client hits Approve. Warning popup appears with text: *"Approving this elevation will lock in your choice of artworks and placement. You'll still be able to view the elevation but it will be submitted to Christian & Kwan for project signoff. Are you happy to proceed?"* On confirm, elevation is locked (read-only).
   - **Project-level status**: Project only moves to "Approved" status when ALL elevation options are approved.
4. **Client portal copy** — confirm "Notes for Christian & Kwan" label is in place (was "Notes for Consultant")
5. **"Elevation Studio" centred in client portal header** — white text on dark header (confirm in production)

### Code review backlog (2026-03-28) — implementation plan

Grouped into waves by risk/complexity. Each wave is on its own feature branch off `dev`.

**Wave 1 — `feature/wave-1-trivial` (zero-risk one-liners)**
- Archived project tab re-fetches every click → add `archivedLoaded` guard in `DashboardClient.tsx`
- PNG export filename hardcoded → include project + elevation + option name in `useStudio.ts:1081`
- Dead `/api/share` route → delete `src/app/api/share/route.ts` after confirming no callers
- Notes debounce timer not cleaned up → add `useEffect` cleanup in `ClientPortal.tsx`

**Wave 2 — `feature/wave-2-data-integrity` ✅ Done (on dev)**
- ✅ Share link regresses project status from "Approved" → "Sent" → guarded in `generateShareToken`
- ✅ Client unapprove removed; consultant-only Unapprove added to studio header with activity log

**Wave 3 — `feature/wave-3-editing-display`**
- Artwork name not editable → add `updateArtworkName` to `useStudio.ts`, inline name input in `StudioSidebar` artwork expanded panel
- Consultant can't see cross-option client notes → pass other option's notes to `StudioSidebar`; label both blocks "Client Notes — Option A/B"
- Client portal missing "prepared by" context → render consultantName + project created_at in portal header/sidebar; use `project.created_at` not `timeNow()`

**Wave 4 — `feature/wave-4-deletion-safety`**
- Artwork deletion has no confirmation → intercept all 3 delete paths (trash, multi-select, keyboard) with a confirm modal in `StudioScreen`
- No way to delete individual elevation → add delete button to `TabBar` (hidden if only 1 elevation), with storage cleanup in `StudioScreen`

**Wave 5 — `feature/wave-5-upload-touch`**
- Upload UX → parallel uploads via `Promise.all`, per-file progress status, 20MB size validation in `AddArtworkModal`
- Touch/iPad drag → add `touchstart/touchmove/touchend` handlers mirroring mouse handlers in `ClientElevation.tsx` and `useStudio.ts`; use `{ passive: false }` on touchmove

**Wave 6 — `feature/wave-6-polish`**
- Activity log UI → fetch `activity_logs` in `/projects/[id]/page.tsx`, pass to `StudioScreen`, render collapsible History panel in sidebar (reuse existing `.activity-log` CSS classes)
- "Saving…" flashes on zoom → decouple zoom persistence into its own `persistZoom()` with silent 2s debounce; remove zoom from `persistOption` update object

### Recently completed (2026-03-28, branch `feature/wave-2-data-integrity` — on dev, pending production)
- ✅ **Share link status regression fixed** — `generateShareToken` now only downgrades project status to `'sent'` if it isn't already `'approved'`; `projectStatus` tracked in local state in `StudioScreen`
- ✅ **Client Unapprove removed** — clients can no longer walk back their own approval. Unapprove button and "Unapprove to edit notes" hint removed from `ClientElevation.tsx`. `handleUnapprove` + dead prop removed from `ClientPortal.tsx`
- ✅ **Consultant Unapprove added** — when the active elevation option is approved, the studio header shows a `✓ Approved` badge and an **Unapprove** button (consultant-only). On click: clears `approved`/`approved_at` in DB, writes `type: 'unapprove'` activity log, updates local state
- ✅ **ShareModal copy updated** — removed "Unapprove if they change their mind" bullet from client capabilities list

### Recently completed (2026-03-28, commit `63a53b7` — live on production)
- ✅ Client portal redesigned: horizontal tab layout per elevation/option
- ✅ Client artwork visibility toggle (eye icon per artwork)
- ✅ Client notes field → feeds back to consultant sidebar
- ✅ Option B bug fixed: auto-copies elevation image from A on first switch; back-switch preserves artwork positions
- ✅ Rubber-band drag-to-select on studio canvas
- ✅ "Elevation Studio" centred in dashboard + studio headers
- ✅ C&K logos resized and aligned correctly on dashboard and client portal
- ✅ Project archive and delete (kebab menu on dashboard cards)
- ✅ Multi-select artworks (Shift+click + rubber-band)

---

## Foreground Masking Feature
Consultants can define which parts of an elevation photo should appear **in front of** placed artworks (e.g. light fixtures, plants, furniture).

### How it works
- The studio canvas has three SVG layers stacked above the elevation image:
  1. `#fg-svg` — renders the elevation image clipped to the mask polygons (the actual foreground effect)
  2. `#fg-draw-svg` — active only during drawing mode; shows dotted lines as the user draws
  3. `#fg-highlight-svg` — shown on hover of a region row in the sidebar; highlights that region in red
- Masks are stored as fractional (0–1) coordinates so they scale correctly with zoom
- The sidebar Step 4 "Foreground" section lists all defined regions; hovering one highlights it on canvas in red; trash icon deletes it
- PNG export also composites the foreground correctly using Canvas 2D clip paths

### Key implementation files
- `src/hooks/useStudio.ts` — `renderForegroundSVG`, `renderDrawSVG`, `highlightMask`, mask draw event handlers
- `src/components/studio/StudioCanvas.tsx` — SVG layer markup (note: `fg-image` must have `clipPath="url(#fg-clip)"`)
- `src/components/studio/StudioSidebar.tsx` — region rows with `onMouseEnter`/`onMouseLeave` for highlight
- `src/app/globals.css` — `.fg-highlight-poly`, `.fg-draw-line`, `.fg-mask-preview` etc.

---

## How To Start A Session
Claude Code and Dispatch read this file automatically when you open the project — no need to attach it manually. Just describe what you want to work on and the session will have full context.
