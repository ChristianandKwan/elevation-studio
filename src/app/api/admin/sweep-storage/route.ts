/**
 * /api/admin/sweep-storage — deletes files in Storage that no database row
 * references any more.
 *
 * Two ways in:
 *   · POST, signed in as a consultant. Defaults to a dry run.
 *   · GET,  from the Vercel cron (see vercel.json). Authenticated by
 *     CRON_SECRET, deletes for real, and refuses any unusually large sweep.
 *
 * ── The unattended run ──────────────────────────────────────────────────
 *
 * A scheduled job that deletes files with nobody watching is only safe if it
 * cannot do much damage when something upstream is wrong. Three rails:
 *
 *   1. Files younger than MIN_AGE_MS are never touched, so a sweep landing in
 *      the gap between an upload and its row cannot eat a fresh file.
 *   2. If the database reports no live image paths at all, the sweep aborts —
 *      that reads as a failed query, not an empty system.
 *   3. The cron refuses to delete more than CRON_MAX_DELETIONS in one run and
 *      reports instead. A schema change or a bug in the path-matching would
 *      otherwise look exactly like "everything is an orphan".
 *
 * A human POSTing the route is subject to (1) and (2) but not (3) — they can
 * see the list first.
 *
 * ── Where orphans come from ─────────────────────────────────────────────
 *
 * Orphans accumulate from three places:
 *   · `deleteArtwork` (useStudio.ts) removes the row and leaves the file.
 *   · `uploadElevation` writes each replacement to a new timestamped path;
 *     the superseded file was never removed (now patched at source, but
 *     historic ones remain).
 *   · `deleteProject` cleans Storage best-effort *from the browser*, so a tab
 *     closed mid-flight strands the whole project's files.
 *
 * Body: `{ "dryRun": true }` lists what would go without deleting anything.
 * Run that first on production and eyeball the list.
 *
 * Response: `{ scanned, orphans, deleted, skippedRecent, paths }`.
 *
 * Auth follows src/app/api/thumbnails/[optionId]/route.ts: verify the caller
 * with the user-scoped client (RLS applies), then use the service client for
 * the storage work. `middleware.ts` excludes /api/, so the check must be here.
 */
import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Svc = ReturnType<typeof createServiceClient>

/**
 * Files younger than this are never touched.
 *
 * Uploads write the file first and the database row a moment later
 * (`uploadElevation`, `addArtworks`), so a sweep running in that gap would see
 * a live file as an orphan and delete something the consultant just added.
 * A day is far longer than any such gap and costs nothing — an orphan simply
 * waits for the next run.
 */
const MIN_AGE_MS = 24 * 60 * 60 * 1000

/** Supabase caps list() at 100 by default; page until a short batch comes back. */
const PAGE = 100

/**
 * Most files an unattended run may delete before it gives up and reports.
 * A normal night's orphans are a handful; hundreds means something changed.
 * Override with CRON_MAX_DELETIONS if a genuine backlog needs clearing —
 * or just run it by hand, where the cap does not apply.
 */
const DEFAULT_CRON_MAX_DELETIONS = 200

interface StorageEntry {
  name: string
  id: string | null       // null marks a folder rather than a file
  created_at?: string | null
  updated_at?: string | null
}

async function listAll(svc: Svc, bucket: string, prefix: string): Promise<StorageEntry[]> {
  const out: StorageEntry[] = []
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await svc.storage.from(bucket).list(prefix, { limit: PAGE, offset })
    if (error) throw new Error(`list ${bucket}/${prefix}: ${error.message}`)
    if (!data?.length) break
    out.push(...(data as StorageEntry[]))
    if (data.length < PAGE) break
  }
  return out
}

/** Folders come back with a null id; real files always have one. */
const isFolder = (e: StorageEntry) => e.id === null

function isRecent(e: StorageEntry, now: number): boolean {
  const stamp = e.created_at ?? e.updated_at
  if (!stamp) return true            // no timestamp → treat as new, never delete
  const t = new Date(stamp).getTime()
  if (!Number.isFinite(t)) return true
  return now - t < MIN_AGE_MS
}

/**
 * Walk `bucket` two levels deep (`{projectId}/{optionId}/file`) and return the
 * full paths of files absent from `livePaths`.
 *
 * Membership is tested against the set of *all* live paths rather than
 * per-option, because one elevation image can legitimately be shared by both
 * options of an elevation — `handleSwitch` copies `image_path` into the empty
 * option. A file is live if any row points at it.
 */
async function findOrphansTwoLevel(
  svc: Svc,
  bucket: string,
  livePaths: Set<string>,
  now: number,
): Promise<{ scanned: number; orphans: string[]; skippedRecent: number }> {
  const orphans: string[] = []
  let scanned = 0
  let skippedRecent = 0

  for (const projectFolder of await listAll(svc, bucket, '')) {
    if (!isFolder(projectFolder)) continue
    for (const optionFolder of await listAll(svc, bucket, projectFolder.name)) {
      if (!isFolder(optionFolder)) continue
      const prefix = `${projectFolder.name}/${optionFolder.name}`
      for (const file of await listAll(svc, bucket, prefix)) {
        if (isFolder(file)) continue
        scanned++
        const path = `${prefix}/${file.name}`
        if (livePaths.has(path)) continue
        if (isRecent(file, now)) { skippedRecent++; continue }
        orphans.push(path)
      }
    }
  }

  return { scanned, orphans, skippedRecent }
}

/** Thumbnails are flat: `{optionId}.png`, no project prefix. */
async function findOrphanThumbnails(
  svc: Svc,
  liveOptionIds: Set<string>,
  livePaths: Set<string>,
  now: number,
): Promise<{ scanned: number; orphans: string[]; skippedRecent: number }> {
  const orphans: string[] = []
  let scanned = 0
  let skippedRecent = 0

  for (const file of await listAll(svc, 'thumbnails', '')) {
    if (isFolder(file)) continue
    scanned++
    // Match on either the id encoded in the filename or an explicit
    // thumbnail_path, so a renamed convention can't cause mass deletion.
    const optionId = file.name.replace(/\.png$/i, '')
    if (liveOptionIds.has(optionId) || livePaths.has(file.name)) continue
    if (isRecent(file, now)) { skippedRecent++; continue }
    orphans.push(file.name)
  }

  return { scanned, orphans, skippedRecent }
}

/** Supabase's remove() takes a list; keep batches modest. */
async function removeAll(svc: Svc, bucket: string, paths: string[]): Promise<number> {
  let deleted = 0
  for (let i = 0; i < paths.length; i += 50) {
    const batch = paths.slice(i, i + 50)
    const { error } = await svc.storage.from(bucket).remove(batch)
    if (error) throw new Error(`remove from ${bucket}: ${error.message}`)
    deleted += batch.length
  }
  return deleted
}

/** Paged select — the row count outgrows PostgREST's default limit. */
async function selectAll(
  svc: Svc,
  table: string,
  columns: string,
): Promise<Array<Record<string, unknown>>> {
  const out: Array<Record<string, unknown>> = []
  const size = 1000
  for (let from = 0; ; from += size) {
    const { data, error } = await svc.from(table).select(columns).range(from, from + size - 1)
    if (error) throw new Error(`select ${table}: ${error.message}`)
    const rows = (data ?? []) as unknown as Array<Record<string, unknown>>
    out.push(...rows)
    if (rows.length < size) break
  }
  return out
}

interface SweepOptions {
  dryRun: boolean
  /** When set, refuse to delete more than this many files (the cron rail). */
  maxDeletions?: number
  /** Tags the log line so scheduled and manual runs are told apart. */
  source: 'manual' | 'cron'
}

async function runSweep({ dryRun, maxDeletions, source }: SweepOptions) {
  const svc = createServiceClient()
  const now = Date.now()

  try {
    // 2. Everything the database still points at.
    const [options, artworks] = await Promise.all([
      selectAll(svc, 'elevation_options', 'id, image_path, thumbnail_path'),
      selectAll(svc, 'artworks', 'image_path'),
    ])

    const liveElevPaths = new Set(
      options.map(o => o.image_path as string | null).filter(Boolean) as string[]
    )
    const liveThumbPaths = new Set(
      options.map(o => o.thumbnail_path as string | null).filter(Boolean) as string[]
    )
    const liveOptionIds = new Set(options.map(o => o.id as string))
    const liveArtPaths = new Set(
      artworks.map(a => a.image_path as string | null).filter(Boolean) as string[]
    )

    // A run that finds no live paths at all almost certainly means the reads
    // failed rather than that everything is genuinely orphaned. Refuse rather
    // than empty the buckets.
    if (liveElevPaths.size === 0 && liveArtPaths.size === 0) {
      return NextResponse.json(
        { error: 'Refusing to sweep: no live image paths found in the database' },
        { status: 409 },
      )
    }

    // 3. Walk the buckets.
    const [elev, art, thumbs] = await Promise.all([
      findOrphansTwoLevel(svc, 'elevation-images', liveElevPaths, now),
      findOrphansTwoLevel(svc, 'artwork-images', liveArtPaths, now),
      findOrphanThumbnails(svc, liveOptionIds, liveThumbPaths, now),
    ])

    const paths = {
      'elevation-images': elev.orphans,
      'artwork-images': art.orphans,
      thumbnails: thumbs.orphans,
    }
    const scanned = elev.scanned + art.scanned + thumbs.scanned
    const orphans = elev.orphans.length + art.orphans.length + thumbs.orphans.length
    const skippedRecent = elev.skippedRecent + art.skippedRecent + thumbs.skippedRecent

    if (dryRun) {
      console.log(`[sweep-storage] ${source} dry run: ${scanned} scanned, ${orphans} orphans`)
      return NextResponse.json({ dryRun: true, scanned, orphans, deleted: 0, skippedRecent, paths })
    }

    // 4. Rail 3 — an unattended run that suddenly wants to delete a great deal
    //    is far more likely to be a bug than a real backlog. Report, don't act.
    if (maxDeletions !== undefined && orphans > maxDeletions) {
      console.warn(
        `[sweep-storage] ${source} run aborted: ${orphans} orphans exceeds the ` +
        `${maxDeletions} limit. Nothing deleted. Run it by hand to review.`
      )
      return NextResponse.json({
        dryRun: false,
        aborted: 'too-many-orphans',
        scanned, orphans, deleted: 0, skippedRecent, maxDeletions, paths,
      }, { status: 409 })
    }

    // 5. Delete.
    let deleted = 0
    deleted += await removeAll(svc, 'elevation-images', elev.orphans)
    deleted += await removeAll(svc, 'artwork-images', art.orphans)
    deleted += await removeAll(svc, 'thumbnails', thumbs.orphans)

    console.log(`[sweep-storage] ${source} run: ${scanned} scanned, ${deleted} deleted`)
    return NextResponse.json({ dryRun: false, scanned, orphans, deleted, skippedRecent, paths })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sweep failed'
    console.error('[sweep-storage]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * Manual run by a signed-in consultant. Defaults to a dry run — only an
 * explicit `{"dryRun": false}` deletes. No deletion cap: whoever calls this can
 * read the list first.
 */
export async function POST(request: Request) {
  const userClient = await createClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // RLS on `profiles` means a row only comes back for a real account.
  const { data: profile } = await userClient
    .from('profiles')
    .select('id')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let dryRun = true
  try {
    const body = await request.json()
    dryRun = body?.dryRun !== false
  } catch {
    // No body — keep the safe default.
  }

  return runSweep({ dryRun, source: 'manual' })
}

/**
 * Scheduled run. Vercel cron jobs issue a GET and, when CRON_SECRET is set in
 * the project's environment, send it as a bearer token.
 *
 * Fails closed: with no CRON_SECRET configured the endpoint is disabled
 * outright rather than left open, because an unauthenticated GET that deletes
 * files is the one mistake worth engineering against.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json(
      { error: 'Scheduled sweep is not configured (CRON_SECRET unset)' },
      { status: 503 },
    )
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const configured = Number(process.env.CRON_MAX_DELETIONS)
  const maxDeletions = Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_CRON_MAX_DELETIONS

  return runSweep({ dryRun: false, maxDeletions, source: 'cron' })
}
