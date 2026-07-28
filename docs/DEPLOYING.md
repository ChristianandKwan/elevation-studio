# Deploying

Elevation Studio deploys to two places that update **independently**:

- **App code** → Vercel, on push to GitHub
- **Database migrations** → Supabase, run by hand in the SQL editor

Nothing coordinates them. If they go out in the wrong order, the live app
talks to a database that doesn't match it, and clients see errors until you
catch up.

---

## The rule

**Ask: does the new code need something the database doesn't have yet, or does
the migration take away something the live code still uses?**

| Kind of change | Examples | Order |
|---|---|---|
| **Additive** — the migration adds something new | new table, column, or function (e.g. `020_create_project_rpc`, `021_delete_project_rpc`) | **Migration first**, then deploy |
| **Destructive** — the migration removes something | dropping a policy, column, or table the live app still relies on (e.g. `022_lock_down_client_rls`) | **Deploy first**, then migration |

The logic behind both rows is the same: *never leave the live app depending on
something that isn't there.*

- Additive, done backwards → the app calls a function that doesn't exist yet.
  Every user hits an error until you run the migration.
- Destructive, done backwards → you remove the permissions the live app is
  still using. With migration 022 specifically, that breaks **every client
  magic link** until the new code deploys.

**Every pull request description must state its deploy order.** One line is
enough: `Deploy order: migration first` or `Deploy order: app first`.

---

## Checking what's already applied

Migration files in `supabase/migrations/` are a record of what *should* exist,
not proof of what does. Before merging `dev` → `main`, confirm the live
database is caught up.

For a migration that adds a **function**, probe it over the REST API. Calling
it with a deliberately wrong argument name never runs it:

```bash
node --env-file=.env.local -e '
const u=process.env.NEXT_PUBLIC_SUPABASE_URL, k=process.env.SUPABASE_SERVICE_ROLE_KEY;
fetch(`${u}/rest/v1/rpc/YOUR_FUNCTION_NAME`,{method:"POST",
  headers:{apikey:k,Authorization:`Bearer ${k}`,"Content-Type":"application/json"},
  body:JSON.stringify({__probe:1})})
 .then(r=>r.json()).then(j=>console.log(j.code==="PGRST202"?"NOT APPLIED":"APPLIED"))'
```

For a migration that changes **policies**, list what's live in the Supabase SQL
editor:

```sql
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
```

> Note: `drop policy if exists` silently does nothing if the name doesn't
> match. After any migration that drops policies, re-run the query above and
> confirm the names are actually gone — a typo will not raise an error.

---

## Running a migration

1. Open the Supabase dashboard → **SQL Editor** → **New query**.
2. Paste the entire contents of the migration file.
3. Run it, and read the result. Postgres reports the first failure and stops.
4. Re-run the relevant check from the section above to confirm it took effect.

Migrations are **append-only**. Never edit a file that has already been run
against the live database — write a new numbered one instead. The next number
is one higher than the highest file in `supabase/migrations/`.

---

## Deploying app code

`dev` is the working branch; `main` is production.

- Pushing **`dev`** gives you a **preview deployment** — a separate URL with
  its own build, pointed at the same Supabase project. Use it to test before
  going live.
- Merging into **`main`** deploys to production.

Because preview and production share one database, **testing on a preview
writes to real data**. Use a project you don't mind changing.

---

## Environment variables

Set in the Vercel dashboard under Settings → Environment Variables, and they
must exist for **both** Preview and Production:

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | public — ships in the browser bundle |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public — ships in the browser bundle |
| `SUPABASE_SERVICE_ROLE_KEY` | **secret** — bypasses all row-level security |
| `RESEND_API_KEY` | secret |
| `FEEDBACK_TO_EMAIL` | |

`SUPABASE_SERVICE_ROLE_KEY` is what the client portal uses to read data and to
authorise client actions after verifying the magic link. If it is missing or
wrong on a deployment, **the portal fails completely** — so confirm it is
present on Preview as well as Production.

Anything named `NEXT_PUBLIC_*` is visible to anyone who opens the site. Never
put a secret behind that prefix.
