# Elevation Studio

Christian & Kwan's tool for proposing art for a client's walls. A consultant
photographs a wall (or types its size), scales it, hangs artworks on it at
their real size, and shares a link with the client, who picks between
options, leaves notes and approves. The same project produces the budget and
an export pack for the written proposal.

Live at **studio.christianandkwan.com**.

## What is where

| | |
|---|---|
| Consultant screens | `src/app/(consultant)` — the dashboard and a project (Studio, Index, Notes, Budget) |
| Client portal | `src/app/client/[token]` — the magic link; all its writes go through `src/app/api/client/[token]/action` |
| The studio | `src/hooks/useStudio.ts` and `src/components/studio/` |
| Database | Supabase. `supabase/migrations/` is the record of every schema change, numbered and append-only |
| Hosting | Vercel, pinned to Dublin next to the database (`vercel.json`) |

## Working on it

```bash
npm run dev     # local server on http://localhost:3000
npm test        # unit tests
npm run build   # the full production build — run before merging; nothing in CI does
```

This is Next.js 16, which differs from older versions — see `AGENTS.md`.

**Before touching a migration, read `docs/DEPLOYING.md`.** App code and the
database deploy separately, and the order depends on whether a migration adds
or removes something.

Work goes feature branch → `dev` (every branch gets a Vercel preview) → a
pull request from `dev` into `main`, which deploys production.

## Other documents

- `docs/DEPLOYING.md` — deploy order, storage buckets, how to check what has run
- `docs/handover-*.md` — what each piece of work decided and why, and the traps it found
- `docs/mockups/` — the design sketches features were agreed from
