/**
 * Proposals: making one, reading one back, and the engine's side of the
 * conversation. Every function takes the service-role client — callers have
 * already established who is asking (a consultant who owns the project, or
 * the engine with its secret).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { assemblePack } from '@/lib/export/pack'
import type { ExportChoices } from '@/lib/export/types'
import { briefForEngine, type ProposalBrief } from './brief'
import { PROPOSALS_BUCKET, packPath, versionPrefix, isVersionFile } from './bucket'
import { DAILY_LIMIT_MESSAGE, dailyStartLimit, engineIsAlive, fireEngine } from './fire'
import { tellTomTheEngineStopped } from './notify'

/** Signed links last an hour: long enough to read and download, no longer. */
const SIGNED_FOR = 60 * 60

export interface ProposalRow {
  id: string
  project_id: string
  status: string
  brief: ProposalBrief & { forEngine?: unknown }
  pack_path: string | null
  current_version: number | null
  engine_seen_at: string | null
  engine_fired_at: string | null
  engine_run_url: string | null
  error: string | null
  created_at: string
}

export interface VersionRow {
  number: number
  summary: string
  page_count: number | null
  warnings: string[]
  files: string[]
  finished: boolean
  created_at: string
}

export interface MessageRow {
  id: string
  author: 'consultant' | 'engine'
  body: string
  page: number | null
  taken_at: string | null
  answered_at: string | null
  answered_in: number | null
  created_at: string
}

const PROPOSAL_COLUMNS =
  'id, project_id, status, brief, pack_path, current_version, engine_seen_at, engine_fired_at, engine_run_url, error, created_at'
const MESSAGE_COLUMNS = 'id, author, body, page, taken_at, answered_at, answered_in, created_at'

/** The export choices a proposal is built from: everything it could lay out. */
function packChoices(brief: ProposalBrief): ExportChoices {
  return {
    optionIds: brief.optionIds,
    includeSetAside: brief.includeSetAside,
    includeWallRenders: true,
    // The empty wall is the Wall specs page.
    includeBareWalls: true,
    includeWorkImages: true,
    includeThumbnails: false,
    // The engine typesets the budget from the figures; a photograph of the
    // screen is for a person assembling a proposal by hand.
    includeBudgetImage: false,
  }
}

/** Build the pack from the project as it is now and store it with the proposal. */
async function storePack(
  db: SupabaseClient, proposalId: string, projectId: string, brief: ProposalBrief, consultantName: string,
): Promise<void> {
  const pack = await assemblePack(db, projectId, packChoices(brief), consultantName)
  if (!pack) throw new Error('The project could not be read.')
  const { error } = await db.storage.from(PROPOSALS_BUCKET)
    .upload(packPath(proposalId), pack.zip, { contentType: 'application/zip', upsert: true })
  if (error) throw new Error(`The export pack could not be stored: ${error.message}`)
  await db.from('proposals').update({ pack_path: packPath(proposalId) }).eq('id', proposalId)
}

async function tellTomAbout(db: SupabaseClient, proposalId: string, reason: string) {
  const { data } = await db.from('proposals').select('projects(name)').eq('id', proposalId).maybeSingle()
  const projectName = (data?.projects as { name?: string } | null)?.name ?? ''
  await tellTomTheEngineStopped({ proposalId, projectName, reason })
}

/** Start the engine for a proposal and record what happened. */
async function startEngine(db: SupabaseClient, proposalId: string, studioUrl: string) {
  const fired = await fireEngine(proposalId, studioUrl)
  const now = new Date().toISOString()
  await db.from('proposal_engine_starts').insert({ proposal_id: proposalId, ok: fired.ok, error: fired.error ?? null })
  if (fired.ok) {
    await db.from('proposals').update({
      engine_fired_at: now, engine_run_url: fired.runUrl ?? null, error: null, updated_at: now,
    }).eq('id', proposalId)
  } else {
    await db.from('proposals').update({ status: 'failed', error: fired.error, updated_at: now }).eq('id', proposalId)
    // Running out of starts is the plan working as sold, not a fault; the
    // consultant is told, and Tom is not emailed about it.
    if (fired.error !== DAILY_LIMIT_MESSAGE) {
      await tellTomAbout(db, proposalId, fired.error ?? 'The engine could not be started.')
    }
  }
  return fired
}

export async function createProposal(
  db: SupabaseClient,
  args: { projectId: string; brief: ProposalBrief; userId: string; consultantName: string; studioUrl: string },
): Promise<string> {
  const { projectId, brief, userId, consultantName, studioUrl } = args

  let coverName: string | null = null
  if (brief.coverWorkId) {
    const { data } = await db.from('works').select('name').eq('id', brief.coverWorkId).eq('project_id', projectId).maybeSingle()
    coverName = data?.name ?? null
  }

  const { data: row, error } = await db.from('proposals').insert({
    project_id: projectId,
    created_by: userId,
    status: 'queued',
    brief: { ...brief, forEngine: briefForEngine(brief, coverName) },
  }).select('id').single()
  if (error || !row) throw new Error(`The proposal could not be saved: ${error?.message ?? 'no row'}`)

  try {
    await storePack(db, row.id, projectId, brief, consultantName)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'The export pack could not be built.'
    await db.from('proposals').update({ status: 'failed', error: message }).eq('id', row.id)
    await tellTomAbout(db, row.id, message)
    return row.id
  }

  await startEngine(db, row.id, studioUrl)
  return row.id
}

/**
 * Rebuild the pack from the project as it is now — the consultant changed a
 * price in the budget, say — and tell the engine to carry the new figures
 * into the proposal. The only way a figure in a proposal changes.
 */
export async function refreshFigures(
  db: SupabaseClient, proposal: ProposalRow, consultantName: string, studioUrl: string,
): Promise<void> {
  await storePack(db, proposal.id, proposal.project_id, proposal.brief, consultantName)
  await addConsultantMessage(db, proposal, {
    body: 'I have refreshed the figures from Elevation Studio. Please rebuild the proposal from the new export pack, keeping everything else as it is.',
    page: null,
  }, studioUrl)
}

/**
 * How many of today's starts the studio has used, of the plan's allowance.
 * "Today" is the last 24 hours — near enough to Anthropic's own window, and
 * it only ever errs towards saying fewer are left. Counts the studio's own
 * starts; anything else on Tom's account is not seen here.
 */
export async function startsToday(db: SupabaseClient) {
  const since = new Date(Date.now() - 24 * 60 * 60_000).toISOString()
  const { count } = await db.from('proposal_engine_starts')
    .select('id', { count: 'exact', head: true }).eq('ok', true).gte('fired_at', since)
  const limit = dailyStartLimit()
  const used = count ?? 0
  return { used, limit, left: Math.max(0, limit - used) }
}

/** A consultant's message. Starts the engine if no run has the proposal. */
export async function addConsultantMessage(
  db: SupabaseClient, proposal: ProposalRow, msg: { body: string; page: number | null }, studioUrl: string,
): Promise<{ started: boolean; error?: string }> {
  const { error } = await db.from('proposal_messages').insert({
    proposal_id: proposal.id, author: 'consultant', body: msg.body, page: msg.page,
  })
  if (error) throw new Error(`The message could not be saved: ${error.message}`)

  if (engineIsAlive(proposal.status, proposal.engine_seen_at, proposal.engine_fired_at)) {
    return { started: false }
  }
  // A failed proposal gets another go when someone writes to it.
  await db.from('proposals').update({ status: 'queued', error: null }).eq('id', proposal.id)
  const fired = await startEngine(db, proposal.id, studioUrl)
  return { started: fired.ok, error: fired.error }
}

export async function getProposal(db: SupabaseClient, id: string): Promise<ProposalRow | null> {
  const { data } = await db.from('proposals').select(PROPOSAL_COLUMNS).eq('id', id).maybeSingle()
  return (data as ProposalRow | null) ?? null
}

/** Everything the proposal screen shows, with signed links to one version. */
export async function proposalView(db: SupabaseClient, proposal: ProposalRow, versionNumber?: number) {
  const [{ data: versions }, { data: messages }, { data: rules }, { data: project }, starts] = await Promise.all([
    db.from('proposal_versions').select('number, summary, page_count, warnings, files, finished, created_at')
      .eq('proposal_id', proposal.id).eq('finished', true).order('number'),
    db.from('proposal_messages').select(MESSAGE_COLUMNS).eq('proposal_id', proposal.id).order('created_at'),
    db.from('house_style_rules').select('id, rule, why, status, decided_by, created_at')
      .eq('proposal_id', proposal.id).order('created_at'),
    db.from('projects').select('name').eq('id', proposal.project_id).maybeSingle(),
    startsToday(db),
  ])

  const all = (versions ?? []) as VersionRow[]
  const shown = all.find(v => v.number === (versionNumber ?? proposal.current_version)) ?? all.at(-1) ?? null

  let pages: string[] = []
  let pdfUrl: string | null = null
  if (shown) {
    const prefix = versionPrefix(proposal.id, shown.number)
    const pagePaths = shown.files.filter(f => f.startsWith('pages/')).sort().map(f => `${prefix}/${f}`)
    const pdfPath = `${prefix}/proposal.pdf`
    const { data: signed } = await db.storage.from(PROPOSALS_BUCKET).createSignedUrls([...pagePaths, pdfPath], SIGNED_FOR)
    const urls = (signed ?? []).map(s => s.signedUrl)
    pages = urls.slice(0, pagePaths.length)
    // A PDF downloads with a proper name rather than a storage key.
    const { data: dl } = await db.storage.from(PROPOSALS_BUCKET)
      .createSignedUrl(pdfPath, SIGNED_FOR, { download: `${project?.name ?? 'Proposal'} — v${shown.number}.pdf` })
    pdfUrl = dl?.signedUrl ?? null
  }

  return {
    id: proposal.id,
    projectId: proposal.project_id,
    projectName: project?.name ?? '',
    status: proposal.status,
    error: proposal.error,
    brief: proposal.brief,
    engineAlive: engineIsAlive(proposal.status, proposal.engine_seen_at, proposal.engine_fired_at),
    starts,
    currentVersion: proposal.current_version,
    versions: all.map(v => ({ number: v.number, summary: v.summary, pageCount: v.page_count, createdAt: v.created_at })),
    shown: shown ? { number: shown.number, summary: shown.summary, warnings: shown.warnings, pages, pdfUrl } : null,
    messages: (messages ?? []) as MessageRow[],
    rules: rules ?? [],
  }
}

// ── The project's Proposals view ─────────────────────────────────────────

/** A consultant was told no, in words they can act on. */
export class Refused extends Error {}

/**
 * Why Start again is not open right now, or null when it is. While Claude
 * owes an answer it is part-way through a change to the version it has, and
 * would publish that change on top of the one started again from.
 */
function startAgainBlocked(proposal: ProposalRow, unanswered: number): string | null {
  if (!proposal.current_version) return 'Claude has not finished the first draft yet.'
  if (unanswered > 0) return 'Claude is working on a change. You can start again once it is done.'
  return null
}

/** Every proposal on a project, newest first, each with its versions and a picture of its cover. */
export async function projectProposals(db: SupabaseClient, projectId: string) {
  const { data: rows } = await db.from('proposals').select(PROPOSAL_COLUMNS)
    .eq('project_id', projectId).order('created_at', { ascending: false })
  const proposals = (rows ?? []) as ProposalRow[]
  if (!proposals.length) return []
  const ids = proposals.map(p => p.id)

  const [{ data: versionRows }, { data: waiting }] = await Promise.all([
    db.from('proposal_versions').select('proposal_id, number, summary, page_count, files, created_at')
      .in('proposal_id', ids).eq('finished', true).order('number', { ascending: false }),
    db.from('proposal_messages').select('proposal_id')
      .in('proposal_id', ids).eq('author', 'consultant').is('answered_at', null),
  ])
  const versions = (versionRows ?? []) as (VersionRow & { proposal_id: string })[]

  // The latest version's first page stands for the proposal.
  const coverPaths = new Map<string, string>()
  for (const p of proposals) {
    const v = versions.find(x => x.proposal_id === p.id && x.number === p.current_version)
    const first = v?.files.filter(f => f.startsWith('pages/')).sort()[0]
    if (v && first) coverPaths.set(p.id, `${versionPrefix(p.id, v.number)}/${first}`)
  }
  const covers = new Map<string, string>()
  if (coverPaths.size) {
    const paths = [...coverPaths.values()]
    const { data: signed } = await db.storage.from(PROPOSALS_BUCKET).createSignedUrls(paths, SIGNED_FOR)
    for (const s of signed ?? []) if (s.signedUrl && s.path) covers.set(s.path, s.signedUrl)
  }

  return proposals.map(p => {
    const unanswered = (waiting ?? []).filter(m => m.proposal_id === p.id).length
    const cover = coverPaths.get(p.id)
    const hasVersions = versions.some(v => v.proposal_id === p.id)
    return {
      id: p.id,
      subtitle: p.brief?.subtitle ?? '',
      status: p.status,
      error: p.error,
      createdAt: p.created_at,
      currentVersion: p.current_version,
      coverUrl: cover ? covers.get(cover) ?? null : null,
      startAgainBlocked: startAgainBlocked(p, unanswered),
      // No first draft, and no run working on one: it stopped (the first
      // live runs did, in the cloud environment's setup). Such a proposal
      // holds nothing, and may be removed.
      stalled: !hasVersions && !engineIsAlive(p.status, p.engine_seen_at, p.engine_fired_at),
      versions: versions.filter(v => v.proposal_id === p.id).map(v => ({
        number: v.number, summary: v.summary, pageCount: v.page_count, createdAt: v.created_at,
      })),
    }
  })
}

/**
 * Remove a proposal that never produced a version — one that stalled or
 * failed before its first draft. One with versions is kept: a draft is work,
 * and nothing about it needs clearing away.
 */
export async function removeUnfinishedProposal(db: SupabaseClient, proposal: ProposalRow) {
  const { count } = await db.from('proposal_versions').select('id', { count: 'exact', head: true })
    .eq('proposal_id', proposal.id)
  if ((count ?? 0) > 0) throw new Refused('This proposal has drafts, so it is kept.')
  if (engineIsAlive(proposal.status, proposal.engine_seen_at, proposal.engine_fired_at)) {
    throw new Refused('Claude is still working on this one. Try again in a few minutes if it stays stuck.')
  }
  if (proposal.pack_path) await db.storage.from(PROPOSALS_BUCKET).remove([proposal.pack_path])
  // Versions and messages go with it (039's cascades).
  const { error } = await db.from('proposals').delete().eq('id', proposal.id)
  if (error) throw new Error(`The proposal could not be removed: ${error.message}`)
  return { ok: true }
}

/** A signed link that downloads one version's PDF under a readable name. */
export async function versionPdfUrl(db: SupabaseClient, proposal: ProposalRow, number: number): Promise<string | null> {
  const { data: version } = await db.from('proposal_versions').select('number')
    .eq('proposal_id', proposal.id).eq('number', number).eq('finished', true).maybeSingle()
  if (!version) return null
  const { data: project } = await db.from('projects').select('name').eq('id', proposal.project_id).maybeSingle()
  const { data } = await db.storage.from(PROPOSALS_BUCKET).createSignedUrl(
    `${versionPrefix(proposal.id, number)}/proposal.pdf`, SIGNED_FOR,
    { download: `${project?.name ?? 'Proposal'} — v${number}.pdf` },
  )
  return data?.signedUrl ?? null
}

/**
 * Start again from an earlier version: copy it forward as the newest, so the
 * next change is made to it. Nothing is overwritten — the versions after it
 * stay in the list, and starting again from one of them is the way back.
 *
 * A run that is listening hears of it through a message, and its next wait
 * fetches the new starting point (studio.mjs, `resynced`). With no run, the
 * next one starts from the current version anyway, so the message is only a
 * record in the conversation.
 */
export async function startAgainFrom(db: SupabaseClient, proposal: ProposalRow, from: number) {
  const { count } = await db.from('proposal_messages').select('id', { count: 'exact', head: true })
    .eq('proposal_id', proposal.id).eq('author', 'consultant').is('answered_at', null)
  const blocked = startAgainBlocked(proposal, count ?? 0)
  if (blocked) throw new Refused(blocked)
  if (from === proposal.current_version) throw new Refused(`Version ${from} is already the latest.`)

  const { data: source } = await db.from('proposal_versions').select('number, page_count, warnings, files')
    .eq('proposal_id', proposal.id).eq('number', from).eq('finished', true).maybeSingle()
  if (!source) throw new Refused(`There is no version ${from}.`)

  // Claim the number before copying: the engine opens versions the same way,
  // and the unique (proposal, number) constraint settles any race.
  const { data: last } = await db.from('proposal_versions').select('number')
    .eq('proposal_id', proposal.id).order('number', { ascending: false }).limit(1).maybeSingle()
  const number = (last?.number ?? 0) + 1
  const files = source.files as string[]
  const { error } = await db.from('proposal_versions').insert({ proposal_id: proposal.id, number, files })
  if (error) throw new Error(`The new version could not be opened: ${error.message}`)

  for (const f of files) {
    const { error: e } = await db.storage.from(PROPOSALS_BUCKET)
      .copy(`${versionPrefix(proposal.id, from)}/${f}`, `${versionPrefix(proposal.id, number)}/${f}`)
    if (e) {
      await db.from('proposal_versions').delete().eq('proposal_id', proposal.id).eq('number', number)
      throw new Error(`Version ${from} could not be copied (${f}): ${e.message}`)
    }
  }

  const now = new Date().toISOString()
  await db.from('proposal_versions').update({
    finished: true, summary: `Started again from version ${from}.`,
    page_count: source.page_count, warnings: source.warnings,
  }).eq('proposal_id', proposal.id).eq('number', number)
  await db.from('proposals').update({ current_version: number, updated_at: now }).eq('id', proposal.id)

  const listening = engineIsAlive(proposal.status, proposal.engine_seen_at, proposal.engine_fired_at)
  await db.from('proposal_messages').insert({
    proposal_id: proposal.id, author: 'consultant', body: `Start again from version ${from}.`,
    answered_in: number, answered_at: listening ? null : now,
  })
  return { version: number }
}

// ── The engine's side ─────────────────────────────────────────────────────

async function heard(db: SupabaseClient, id: string, extra: Record<string, unknown> = {}) {
  const now = new Date().toISOString()
  await db.from('proposals').update({ engine_seen_at: now, updated_at: now, ...extra }).eq('id', id)
}

/**
 * What identifies the stored pack's contents. Refresh figures rebuilds it in
 * place, which changes this; a run compares it with the one it downloaded.
 */
async function packStamp(db: SupabaseClient, proposal: ProposalRow): Promise<string | null> {
  if (!proposal.pack_path) return null
  const { data } = await db.storage.from(PROPOSALS_BUCKET).list(proposal.id, { search: 'pack.zip' })
  const file = data?.find(f => f.name === 'pack.zip')
  return file?.metadata?.eTag ?? file?.updated_at ?? null
}

/** The current version's proposal.html, signed for the engine to download. */
async function currentForEngine(db: SupabaseClient, proposal: ProposalRow) {
  if (!proposal.current_version) return null
  const { data } = await db.storage.from(PROPOSALS_BUCKET)
    .createSignedUrl(`${versionPrefix(proposal.id, proposal.current_version)}/proposal.html`, SIGNED_FOR)
  return data ? { number: proposal.current_version, htmlUrl: data.signedUrl } : null
}

/**
 * What a listening run should be working from: the current version and the
 * pack. Asked whenever messages arrive, because two things change them under
 * a run — Start again (a different current version) and Refresh figures (a
 * rebuilt pack) — and a run otherwise edits the copies it started with.
 */
export async function engineState(db: SupabaseClient, proposal: ProposalRow) {
  const [current, stamp, pack] = await Promise.all([
    currentForEngine(db, proposal),
    packStamp(db, proposal),
    proposal.pack_path
      ? db.storage.from(PROPOSALS_BUCKET).createSignedUrl(proposal.pack_path, SIGNED_FOR).then(r => r.data?.signedUrl ?? null)
      : Promise.resolve(null),
  ])
  await heard(db, proposal.id)
  return { current, pack: pack ? { url: pack, stamp } : null }
}

/** A run has the job: hand it the pack, the brief, the conversation, and the version to edit. */
export async function engineStart(db: SupabaseClient, proposal: ProposalRow) {
  if (!proposal.pack_path) throw new Error('This proposal has no export pack.')
  await heard(db, proposal.id, { status: 'working', error: null })

  const { data: pack } = await db.storage.from(PROPOSALS_BUCKET).createSignedUrl(proposal.pack_path, SIGNED_FOR)
  const [current, stamp] = await Promise.all([currentForEngine(db, proposal), packStamp(db, proposal)])
  const { data: messages } = await db.from('proposal_messages').select(MESSAGE_COLUMNS)
    .eq('proposal_id', proposal.id).order('created_at')
  const { data: project } = await db.from('projects').select('name').eq('id', proposal.project_id).maybeSingle()

  // What this run is about to read counts as taken, so `next` does not hand
  // it the same messages again.
  await db.from('proposal_messages').update({ taken_at: new Date().toISOString() })
    .eq('proposal_id', proposal.id).eq('author', 'consultant').is('taken_at', null)

  return {
    projectName: project?.name ?? '',
    brief: proposal.brief.forEngine ?? proposal.brief,
    packUrl: pack?.signedUrl,
    packStamp: stamp,
    current,
    messages: ((messages ?? []) as MessageRow[]).map(m => ({
      id: m.id, from: m.author, body: m.body, page: m.page, answered: m.answered_at != null,
    })),
  }
}

/**
 * The longest a wait may hold. Claude Code's cloud proxy cuts a request off
 * at about 30 seconds and answers 502, so a longer hold lost the response —
 * and with it, once, a consultant's message.
 */
export const MAX_WAIT_SECONDS = 25

/**
 * New consultant messages, waiting up to `waitSeconds` for one to arrive.
 *
 * Reading does not collect them. A message counts as collected only when the
 * engine acknowledges it (`engineAck`), so a response lost on the way — a
 * proxy timeout, a dropped connection — leaves the message waiting to be
 * handed over again, rather than marked taken and never seen. On the first
 * live test a probe's response was thrown away with Tom's message in it.
 */
export async function engineNext(db: SupabaseClient, proposalId: string, waitSeconds: number) {
  const until = Date.now() + Math.min(Math.max(waitSeconds, 0), MAX_WAIT_SECONDS) * 1000
  for (;;) {
    await heard(db, proposalId)
    const { data } = await db.from('proposal_messages').select(MESSAGE_COLUMNS)
      .eq('proposal_id', proposalId).eq('author', 'consultant')
      .is('taken_at', null).is('answered_at', null).order('created_at')
    const fresh = (data ?? []) as MessageRow[]
    if (fresh.length) return fresh.map(m => ({ id: m.id, body: m.body, page: m.page }))
    if (Date.now() >= until) return []
    await new Promise(r => setTimeout(r, 2500))
  }
}

/** The engine has these messages: collected, and not to be handed over again. */
export async function engineAck(db: SupabaseClient, proposalId: string, ids: unknown) {
  const list = Array.isArray(ids) ? ids.filter((i): i is string => typeof i === 'string') : []
  if (list.length) {
    await db.from('proposal_messages').update({ taken_at: new Date().toISOString() })
      .eq('proposal_id', proposalId).in('id', list).is('taken_at', null)
  }
  await heard(db, proposalId)
  return { ok: true, acknowledged: list.length }
}

/** Open a new version and hand back a signed upload link for each of its files. */
export async function engineOpenVersion(db: SupabaseClient, proposalId: string, files: unknown) {
  if (!Array.isArray(files) || files.length === 0 || files.length > 200 || !files.every(f => typeof f === 'string' && isVersionFile(f))) {
    throw new Error('files must list proposal.html, proposal.pdf and pages/page-NN.png only')
  }
  const names = files as string[]
  if (!names.includes('proposal.html') || !names.includes('proposal.pdf')) {
    throw new Error('A version needs proposal.html and proposal.pdf')
  }
  const { data: last } = await db.from('proposal_versions').select('number')
    .eq('proposal_id', proposalId).order('number', { ascending: false }).limit(1).maybeSingle()
  const number = (last?.number ?? 0) + 1
  const { error } = await db.from('proposal_versions').insert({ proposal_id: proposalId, number, files: names })
  if (error) throw new Error(`The version could not be opened: ${error.message}`)

  const prefix = versionPrefix(proposalId, number)
  // The engine PUTs each file's bytes to its link. The token in the link is
  // the authority; the public anon key goes along because the storage
  // gateway expects one on every request.
  const headers = { 'x-upsert': 'true', apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '' }
  const uploads: Record<string, { url: string; headers: Record<string, string> }> = {}
  for (const name of names) {
    const { data, error: e } = await db.storage.from(PROPOSALS_BUCKET).createSignedUploadUrl(`${prefix}/${name}`, { upsert: true })
    if (e || !data) throw new Error(`No upload link for ${name}: ${e?.message}`)
    uploads[name] = { url: data.signedUrl, headers }
  }
  await heard(db, proposalId)
  return { version: number, uploads }
}

/** The files are up: make the version current and answer the messages it answers. */
export async function engineFinishVersion(
  db: SupabaseClient, proposalId: string, number: number,
  body: { summary?: unknown; answering?: unknown; pageCount?: unknown; warnings?: unknown },
) {
  const { data: version } = await db.from('proposal_versions').select('files')
    .eq('proposal_id', proposalId).eq('number', number).maybeSingle()
  if (!version) throw new Error(`There is no version ${number}.`)

  // Every promised file must be there before the consultant is shown it.
  const prefix = versionPrefix(proposalId, number)
  const listed = new Set<string>()
  for (const dir of [prefix, `${prefix}/pages`]) {
    const { data } = await db.storage.from(PROPOSALS_BUCKET).list(dir, { limit: 1000 })
    for (const f of data ?? []) listed.add(dir === prefix ? f.name : `pages/${f.name}`)
  }
  const missing = (version.files as string[]).filter(f => !listed.has(f))
  if (missing.length) throw new Error(`Not uploaded yet: ${missing.join(', ')}`)

  const summary = typeof body.summary === 'string' ? body.summary.trim().slice(0, 2000) : ''
  const answering = Array.isArray(body.answering) ? body.answering.filter((a): a is string => typeof a === 'string') : []
  const warnings = Array.isArray(body.warnings) ? body.warnings.filter((w): w is string => typeof w === 'string').slice(0, 50) : []
  const now = new Date().toISOString()

  await db.from('proposal_versions').update({
    finished: true, summary, warnings,
    page_count: typeof body.pageCount === 'number' ? body.pageCount : null,
  }).eq('proposal_id', proposalId).eq('number', number)
  await heard(db, proposalId, { current_version: number, status: 'ready' })
  if (answering.length) {
    await db.from('proposal_messages').update({ answered_at: now, answered_in: number })
      .eq('proposal_id', proposalId).in('id', answering)
  }
  if (summary) {
    await db.from('proposal_messages').insert({
      proposal_id: proposalId, author: 'engine', body: `Version ${number}: ${summary}`, answered_in: number,
    })
  }
  return { version: number }
}

export async function engineReply(db: SupabaseClient, proposalId: string, body: unknown, answering: unknown) {
  if (typeof body !== 'string' || !body.trim()) throw new Error('A reply needs a body.')
  await db.from('proposal_messages').insert({ proposal_id: proposalId, author: 'engine', body: body.trim().slice(0, 4000) })
  const ids = Array.isArray(answering) ? answering.filter((a): a is string => typeof a === 'string') : []
  if (ids.length) {
    await db.from('proposal_messages').update({ answered_at: new Date().toISOString() })
      .eq('proposal_id', proposalId).in('id', ids)
  }
  await heard(db, proposalId)
  return { ok: true }
}

export async function engineSuggest(db: SupabaseClient, proposal: ProposalRow, rule: unknown, why: unknown) {
  if (typeof rule !== 'string' || !rule.trim()) throw new Error('A suggestion needs a rule.')
  const { data, error } = await db.from('house_style_rules').insert({
    proposal_id: proposal.id, project_id: proposal.project_id,
    rule: rule.trim().slice(0, 1000), why: typeof why === 'string' ? why.trim().slice(0, 1000) : '',
  }).select('id').single()
  if (error) throw new Error(error.message)
  await heard(db, proposal.id)
  return { id: data.id }
}

export async function engineStatus(db: SupabaseClient, proposalId: string, status: unknown, error: unknown) {
  if (status === 'resting') {
    await db.from('proposals').update({ status: 'resting', updated_at: new Date().toISOString() }).eq('id', proposalId)
    return { ok: true }
  }
  if (status === 'failed') {
    const message = typeof error === 'string' && error.trim() ? error.trim().slice(0, 1000) : 'The proposal engine stopped.'
    await db.from('proposals').update({ status: 'failed', error: message, updated_at: new Date().toISOString() }).eq('id', proposalId)
    await tellTomAbout(db, proposalId, message)
    return { ok: true }
  }
  throw new Error('status must be resting or failed')
}

export async function approvedRules(db: SupabaseClient) {
  const { data } = await db.from('house_style_rules').select('id, rule, why, decided_by, decided_at')
    .eq('status', 'approved').order('decided_at')
  return { rules: data ?? [] }
}

export async function markRuleApplied(db: SupabaseClient, ruleId: string, commit: unknown) {
  if (typeof commit !== 'string' || !/^[0-9a-f]{7,40}$/.test(commit)) throw new Error('commit must be a git sha')
  await db.from('house_style_rules').update({
    status: 'applied', applied_commit: commit, applied_at: new Date().toISOString(),
  }).eq('id', ruleId).eq('status', 'approved')
  return { ok: true }
}

/** Remove every file of every proposal on a project, before the project goes. */
export async function removeProjectProposalFiles(db: SupabaseClient, projectId: string) {
  const { data: rows } = await db.from('proposals').select('id').eq('project_id', projectId)
  for (const { id } of rows ?? []) {
    const paths: string[] = [packPath(id)]
    const { data: versions } = await db.from('proposal_versions').select('number, files').eq('proposal_id', id)
    for (const v of versions ?? []) {
      for (const f of v.files as string[]) paths.push(`${versionPrefix(id, v.number)}/${f}`)
    }
    for (let i = 0; i < paths.length; i += 100) {
      await db.storage.from(PROPOSALS_BUCKET).remove(paths.slice(i, i + 100))
    }
  }
}
