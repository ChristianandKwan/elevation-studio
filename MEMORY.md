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
- `elevation_options` has a `client_notes text` column (added in `005_client_notes.sql`)
- `elevations` has a `client_picked_option text` column; `elevation_options` has client-token RLS update policies (added in `006_client_approval.sql`)

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

### Bugs
- ✅ Dashboard kebab menu outside-click fix (shipped in `feature/unarchive-and-kebab-fix`)

### Feature backlog
1. **Artwork skewing** — allow consultants to skew/shear placed artworks to match perspective of the wall photo (e.g. angled walls, corner installations)
2. **Client-side snap to grid** — grid overlay with snap-to-grid when clients drag artworks in the portal, so placements feel intentional rather than free-floating
3. **Brightness and fade sliders** — per-artwork sliders to adjust brightness and opacity/fade, useful for blending artworks into the wall photo more naturally
4. **Pick options UX review** — the two-stage Pick/Approve flow is shipped but needs real-world testing and likely tweaking based on how C&K and clients actually use it

### What's shipped (as of 2026-03-28, all on `dev`, commit `657261d`)
- ✅ Archived tab re-fetch guard (`archivedLoaded` flag in `DashboardClient.tsx`)
- ✅ PNG export filename includes project + elevation + option name
- ✅ Activity log collapsible History panel in studio sidebar
- ✅ Silent zoom persistence (no more "Saving…" flash on zoom)
- ✅ Artwork name inline editing in sidebar
- ✅ Cross-option client notes visible to consultant in sidebar
- ✅ "Prepared by" context in client portal header
- ✅ Artwork deletion confirm modal; elevation delete with storage cleanup
- ✅ Share link no longer regresses project status from Approved → Sent
- ✅ Client Unapprove removed; consultant-only Unapprove in studio header + activity log
- ✅ **Client pick + approve flow** — two-stage per elevation: Pick (locks option choice, hides other tab) → Approve (warning popup, locks elevation read-only). Project status → Approved only when all elevations done. Consultant can unapprove to reopen. DB: `client_picked_option` column + RLS policies in `006_client_approval.sql`
- ✅ "Notes for Christian & Kwan" label in client portal (was "Notes for Consultant")
- ✅ "Elevation Studio" centred in client portal header
- ✅ Client portal redesigned: horizontal tab layout per elevation/option
- ✅ Client artwork visibility toggle and notes field
- ✅ Option B auto-copies elevation image from A; back-switch preserves artwork positions
- ✅ Rubber-band drag-to-select; multi-select (Shift+click); keyboard nudge
- ✅ Project archive and delete (kebab menu on dashboard cards)
- ✅ Foreground masking (polygon regions, SVG compositing, PNG export)

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
