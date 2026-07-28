<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Deploy order matters — read before touching migrations

App code (Vercel) and database migrations (Supabase) deploy independently, and
nothing coordinates them. Get the order wrong and the live app talks to a
database that doesn't match it.

- **Additive** migration (new table, column, or function) → **run the migration
  first**, then deploy the code that uses it.
- **Destructive** migration (dropping a policy, column, or table the live app
  still uses) → **deploy the code first**, then run the migration.

State the deploy order in every PR description. Migrations are append-only:
never edit a file that has already been run — add a new numbered one.

Full detail, including how to check what's already applied: `docs/DEPLOYING.md`.
