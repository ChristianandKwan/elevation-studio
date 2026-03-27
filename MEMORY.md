# Elevation Studio — Project Memory

## What This Is
A bespoke web app for **Christian & Kwan**, a London art consultancy.
It allows consultants to photograph a client's wall, place scaled artwork onto it,
and share a live proposal link with the client for approval.

Built with: **Next.js 15 + Supabase + Tailwind CSS**, deployed on **Vercel**.

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

---

## Deployment
- **Vercel** auto-deploys when code is pushed to the `main` branch on GitHub
- Environment variables are set in Vercel dashboard (not in code)
- Local dev uses `.env.local` (gitignored — never committed)

### Deploy workflow
```
# Make changes locally, test at localhost:3000, then:
git add -A && git commit -m "describe what changed"
git push
# Vercel picks it up automatically — live in ~1 minute
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
- [ ] Set up `dev` branch on GitHub for safer editing workflow
- [ ] Custom error pages
- [ ] Favicon + page title

---

## How To Start A Session
Tell Claude:
> "Here is my memory file for Elevation Studio" and attach this file.
> Then describe what you want to work on.

Claude will be fully up to speed without needing re-explanation.
