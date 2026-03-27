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
- **Claude sessions:** Tommy is non-technical — explain things in plain English, avoid jargon

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

## Database (Supabase)
Tables: `profiles`, `projects`, `elevations`, `elevation_options`, `artworks`, `activity_logs`, `client_tokens`

- RLS is **enabled on all tables** ✅
- Schema lives in `supabase/migrations/001_schema.sql`
- Storage buckets: `elevation-images`, `artwork-images`
- Storage policies in `supabase/migrations/002_storage.sql`
- `elevation_options` has a `foreground_masks` JSONB column (added in `003_foreground_masks.sql`) — stores an array of polygons, each polygon being an array of `{x, y}` points in 0–1 fractional coordinates

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

# 3. When happy, merge dev → main via GitHub Pull Request:
#    GitHub → Pull requests → New pull request → base: main, compare: dev
#    Create pull request → Merge pull request → Confirm merge
#    Vercel auto-deploys main in ~1 minute
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
- [ ] DNS for `studio.christianandkwan.com` — CNAME record needs adding in Hostinger
- [ ] Client portal token expiry — update schema default from 90 days to 42 days
- [ ] Re-enable email confirmation in Supabase before real client use
- [ ] Full UI/UX audit against the original prototype (20 questions checklist)
- [ ] Custom error pages
- [ ] Favicon + page title

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
Tell Claude:
> "See the attached file — read it so you know what we're doing" and attach this MEMORY.md file.
> Then describe what you want to work on.

Claude will be fully up to speed without needing re-explanation.
