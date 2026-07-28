/**
 * Verifies migration 022 closed the anonymous-access hole.
 *
 *   node --env-file=.env.local verify-022.mjs
 *
 * SAFE TO RUN AT ANY TIME — it never modifies existing data. The only
 * write it attempts is an insert of a throwaway activity_logs row, which
 * must be refused; if it unexpectedly succeeds the script prints the new
 * row's id so you can delete it.
 *
 * Before migration 022 this should FAIL loudly. After it, all green.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!url || !anon) { console.error('Missing Supabase env vars'); process.exit(1) }

const h = { apikey: anon, Authorization: `Bearer ${anon}` }

let failures = 0
const pass = (m) => console.log(`  \x1b[32m✓\x1b[0m ${m}`)
const fail = (m) => { failures++; console.log(`  \x1b[31m✗\x1b[0m ${m}`) }

// Every table the "Client token …" policies exposed. With those policies
// gone and no session, RLS should yield nothing on all of them.
const TABLES = [
  'client_tokens', 'projects', 'elevations', 'elevation_options',
  'artworks', 'activity_logs', 'profiles', 'project_budgets',
]

console.log('\n── Anonymous reads (every table must return 0 rows) ──')
for (const t of TABLES) {
  const r = await fetch(`${url}/rest/v1/${t}?select=*`, { headers: h })
  const j = await r.json().catch(() => null)
  const n = Array.isArray(j) ? j.length : null
  if (n === 0) pass(`${t.padEnd(18)} 0 rows`)
  else if (n === null) pass(`${t.padEnd(18)} refused (${r.status})`)
  else fail(`${t.padEnd(18)} LEAKED ${n} rows`)
}

console.log('\n── Anonymous insert (must be refused) ──')
{
  const r = await fetch(`${url}/rest/v1/activity_logs`, {
    method: 'POST',
    headers: { ...h, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({
      project_id: '00000000-0000-0000-0000-000000000000',
      type: 'rls-probe',
      text: 'migration 022 verification probe',
    }),
  })
  const j = await r.json().catch(() => null)
  if (Array.isArray(j) && j.length) fail(`activity_logs insert SUCCEEDED — still open! delete row id ${j[0].id}`)
  else pass(`activity_logs insert refused (${r.status})`)
}

console.log('\n── Magic link still works (portal must be running) ──')
{
  const token = process.argv[2]
  if (!token) {
    console.log('  – skipped (pass a token as the first argument to test)')
  } else {
    const base = process.env.PORTAL_BASE ?? 'http://localhost:3000'
    const r = await fetch(`${base}/client/${token}`)
    const body = await r.text()
    // Don't grep for the 404 copy: Next serialises the not-found boundary
    // into every response. This meta tag is only emitted on a real 404.
    if (body.includes('name="next-error"')) fail(`portal returned its 404 page for ${token}`)
    else pass(`portal still renders for ${token}`)
  }
}

console.log(failures === 0
  ? '\n\x1b[32m✅ All checks passed — anon key is locked out.\x1b[0m\n'
  : `\n\x1b[31m❌ ${failures} check(s) failed — see above.\x1b[0m\n`)
process.exit(failures === 0 ? 0 : 1)
