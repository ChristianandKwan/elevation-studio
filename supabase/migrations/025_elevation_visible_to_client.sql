-- 025: consultants can hide an elevation from the client
--
-- Additive only, so run this BEFORE deploying the code that reads it.
--
-- Every existing and every new elevation defaults to visible, so nothing a
-- client can see today changes until a consultant switches one off.
--
-- No RLS change is needed: the client portal never reads these tables from
-- the browser (see 022). The filtering happens server-side in
-- src/app/client/[token]/page.tsx and src/app/api/client/[token]/action/route.ts.

alter table elevations
  add column if not exists visible_to_client boolean not null default true;
