/**
 * Proposals sent to the client, and what Claude learns from them (040).
 *
 * A consultant marks the version that went to the client as sent — with the
 * PDF they actually sent, if they changed it after downloading. That starts a
 * run of the engine that looks back over the whole proposal and suggests
 * house-style rules, which Christian & Kwan decide on in the House style
 * page. Sent proposals are also the examples each new proposal starts from.
 *
 * Every function takes the service-role client; callers have already
 * established who is asking.
 */
import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { PROPOSALS_BUCKET, isSentPdfPath, sentPdfPath, versionPrefix } from './bucket'
import { DAILY_LIMIT_MESSAGE, fireEngine } from './fire'
import { Refused, type ProposalRow } from './store'
import { reviewState } from './review'

/** Signed links last an hour, as in store.ts. */
const SIGNED_FOR = 60 * 60

/** The consultant's own PDF can be large (pictures), but not unbounded. */
export const SENT_PDF_MAX_BYTES = 80 * 1024 * 1024

/** How many sent proposals a new one is shown as examples. */
export const EXAMPLES_FOR_A_NEW_PROPOSAL = 2

export interface SendRow {
  id: string
  proposal_id: string
  version: number
  sent_by: string
  sent_at: string
  final_pdf_path: string | null
  final_pdf_at: string | null
  review_asked_at: string | null
  reviewed_at: string | null
  review_error: string | null
  lesson: string | null
}

const SEND_COLUMNS =
  'id, proposal_id, version, sent_by, sent_at, final_pdf_path, final_pdf_at, review_asked_at, reviewed_at, review_error, lesson'

export async function getSend(db: SupabaseClient, id: string): Promise<SendRow | null> {
  const { data } = await db.from('proposal_sends').select(SEND_COLUMNS).eq('id', id).maybeSingle()
  return (data as SendRow | null) ?? null
}

/** The sends of these proposals, newest first. */
export async function sendsOf(db: SupabaseClient, proposalIds: string[]): Promise<SendRow[]> {
  if (!proposalIds.length) return []
  const { data } = await db.from('proposal_sends').select(SEND_COLUMNS)
    .in('proposal_id', proposalIds).order('sent_at', { ascending: false })
  return (data ?? []) as SendRow[]
}

/** How a send appears to the consultant. */
export function sendForView(send: SendRow) {
  return {
    id: send.id,
    version: send.version,
    sentBy: send.sent_by,
    sentAt: send.sent_at,
    hasOwnPdf: !!send.final_pdf_path,
    review: reviewState(send),
    lesson: send.lesson,
  }
}

// ── The consultant's side ────────────────────────────────────────────────

/**
 * A signed link the browser uploads the consultant's PDF to, straight into
 * storage: a PDF of pictures is far larger than a request to the studio may
 * be. Nothing is recorded until the send is saved with the path.
 */
export async function sentPdfUploadLink(db: SupabaseClient, proposal: ProposalRow) {
  const path = sentPdfPath(proposal.id, randomUUID())
  const { data, error } = await db.storage.from(PROPOSALS_BUCKET).createSignedUploadUrl(path)
  if (error || !data) throw new Error(`No upload link: ${error?.message ?? 'none'}`)
  return { path, token: data.token }
}

/** Whether the browser really did put a file there. */
async function uploaded(db: SupabaseClient, path: string): Promise<boolean> {
  const slash = path.lastIndexOf('/')
  const { data } = await db.storage.from(PROPOSALS_BUCKET).list(path.slice(0, slash), { search: path.slice(slash + 1) })
  return !!data?.some(f => f.name === path.slice(slash + 1))
}

async function checkedPdfPath(db: SupabaseClient, proposal: ProposalRow, pdfPath: unknown): Promise<string | null> {
  if (pdfPath == null || pdfPath === '') return null
  if (!isSentPdfPath(proposal.id, pdfPath)) throw new Refused('That upload does not belong to this proposal.')
  if (!(await uploaded(db, pdfPath))) throw new Refused('The PDF did not finish uploading. Try again.')
  return pdfPath
}

/**
 * Mark a version as sent to the client, with the PDF actually sent if the
 * consultant changed it, and ask Claude to look back over the proposal.
 * The send is saved even if Claude cannot start now; it can be asked again.
 */
export async function markSent(
  db: SupabaseClient, proposal: ProposalRow,
  args: { version: unknown; pdfPath: unknown; userId: string; name: string; studioUrl: string },
) {
  const version = Number(args.version)
  if (!Number.isInteger(version) || version < 1) throw new Refused('Which version went to the client?')
  const { data: v } = await db.from('proposal_versions').select('number')
    .eq('proposal_id', proposal.id).eq('number', version).eq('finished', true).maybeSingle()
  if (!v) throw new Refused(`There is no version ${version}.`)
  const pdfPath = await checkedPdfPath(db, proposal, args.pdfPath)

  const now = new Date().toISOString()
  const { data, error } = await db.from('proposal_sends').insert({
    proposal_id: proposal.id, version, sent_by: args.name, sent_by_user: args.userId, sent_at: now,
    final_pdf_path: pdfPath, final_pdf_at: pdfPath ? now : null,
  }).select(SEND_COLUMNS).single()
  if (error || !data) throw new Error(`It could not be marked as sent: ${error?.message ?? 'no row'}`)

  const review = await askForReview(db, data as SendRow, args.studioUrl)
  return { id: data.id, reviewStarted: review.ok, notice: review.ok ? null : review.error }
}

/**
 * The consultant uploads the PDF they sent after marking it sent — they
 * touched it up in Acrobat afterwards, say. It replaces any earlier upload,
 * and Claude looks again, now with their edits.
 */
export async function attachSentPdf(db: SupabaseClient, proposal: ProposalRow, send: SendRow, pdfPath: unknown, studioUrl: string) {
  const path = await checkedPdfPath(db, proposal, pdfPath)
  if (!path) throw new Refused('Choose the PDF you sent.')
  if (send.final_pdf_path && send.final_pdf_path !== path) {
    await db.storage.from(PROPOSALS_BUCKET).remove([send.final_pdf_path])
  }
  const now = new Date().toISOString()
  await db.from('proposal_sends').update({ final_pdf_path: path, final_pdf_at: now }).eq('id', send.id)
  const review = await askForReview(db, { ...send, final_pdf_path: path }, studioUrl)
  return { reviewStarted: review.ok, notice: review.ok ? null : review.error }
}

/** Marked as sent by mistake: take it back. Rules it led to stay, with their own decisions. */
export async function undoSent(db: SupabaseClient, send: SendRow) {
  if (send.final_pdf_path) await db.storage.from(PROPOSALS_BUCKET).remove([send.final_pdf_path])
  const { error } = await db.from('proposal_sends').delete().eq('id', send.id)
  if (error) throw new Error(`It could not be undone: ${error.message}`)
  return { ok: true }
}

/**
 * Start a run that looks back over a sent proposal. It is one of the day's
 * starts, like any other, and is counted with them. Running out of starts is
 * not a fault: the send says so, and the House style page offers to ask again.
 */
export async function askForReview(db: SupabaseClient, send: SendRow, studioUrl: string) {
  const fired = await fireEngine(send.proposal_id, studioUrl, send.id)
  const now = new Date().toISOString()
  await db.from('proposal_engine_starts').insert({ proposal_id: send.proposal_id, ok: fired.ok, error: fired.error ?? null })
  await db.from('proposal_sends').update({
    review_asked_at: now,
    review_error: fired.ok ? null : fired.error === DAILY_LIMIT_MESSAGE
      ? 'Claude had no starts left today. Ask again later.'
      : (fired.error ?? 'Claude could not be started.'),
  }).eq('id', send.id)
  return fired
}

// ── The House style page ─────────────────────────────────────────────────

export interface HouseRule {
  id: string
  rule: string
  why: string
  status: 'suggested' | 'approved' | 'rejected' | 'applied' | 'retired'
  decided_by: string | null
  decided_at: string | null
  created_at: string
  /** Where it came from, in words: "Nepean — the chat" or "Nepean — as sent". */
  from: string
}

/**
 * The practice's house style as the studio holds it: every rule with where
 * it came from, and every sent proposal with what Claude took from it. Not
 * scoped to one consultant's projects: the house style belongs to C&K.
 */
export async function houseStyle(db: SupabaseClient, userId: string) {
  const [{ data: ruleRows }, { data: sendRows }] = await Promise.all([
    db.from('house_style_rules').select('id, rule, why, status, decided_by, decided_at, created_at, project_id, send_id')
      .order('created_at', { ascending: false }),
    db.from('proposal_sends').select(`${SEND_COLUMNS}, proposals(project_id, brief)`)
      .order('sent_at', { ascending: false }).limit(50),
  ])
  const rules = ruleRows ?? []
  const sends = (sendRows ?? []) as unknown as (SendRow & { proposals: { project_id: string; brief: { subtitle?: string } } | null })[]

  const projectIds = [...new Set([
    ...rules.map(r => r.project_id).filter(Boolean),
    ...sends.map(s => s.proposals?.project_id).filter(Boolean),
  ])] as string[]
  const { data: projects } = projectIds.length
    ? await db.from('projects').select('id, name, consultant_id').in('id', projectIds)
    : { data: [] as { id: string; name: string; consultant_id: string }[] }
  const nameOf = new Map((projects ?? []).map(p => [p.id, p.name]))
  // A proposal opens only for the consultant whose project it is.
  const mine = new Set((projects ?? []).filter(p => p.consultant_id === userId).map(p => p.id))

  return {
    rules: rules.map(r => ({
      id: r.id, rule: r.rule, why: r.why, status: r.status, decided_by: r.decided_by,
      decided_at: r.decided_at, created_at: r.created_at,
      from: `${nameOf.get(r.project_id ?? '') ?? 'A proposal'} — ${r.send_id ? 'as sent' : 'the chat'}`,
    })) as HouseRule[],
    sent: sends.map(s => ({
      ...sendForView(s),
      proposalId: s.proposal_id,
      projectId: s.proposals?.project_id ?? null,
      mine: mine.has(s.proposals?.project_id ?? ''),
      projectName: nameOf.get(s.proposals?.project_id ?? '') ?? '',
      subtitle: s.proposals?.brief?.subtitle ?? '',
    })),
  }
}

/** How many rules wait for a decision, for the dashboard's House style link. */
export async function rulesWaiting(db: SupabaseClient): Promise<number> {
  const { count } = await db.from('house_style_rules')
    .select('id', { count: 'exact', head: true }).eq('status', 'suggested')
  return count ?? 0
}

/**
 * A consultant decides on a rule, rewords it, or stops using it. The house
 * style is Christian & Kwan's: nothing reaches a proposal until one of them
 * approves it, and a retired rule is simply no longer handed to the engine.
 */
export async function decideRule(
  db: SupabaseClient, ruleId: string, who: string,
  body: { decision?: unknown; rule?: unknown },
) {
  const { data: row } = await db.from('house_style_rules').select('id, status').eq('id', ruleId).maybeSingle()
  if (!row) throw new Refused('That rule is not there any more.')
  const now = new Date().toISOString()
  const update: Record<string, unknown> = {}

  if (body.rule !== undefined) {
    const text = typeof body.rule === 'string' ? body.rule.trim() : ''
    if (!text) throw new Refused('A rule needs some words.')
    if (row.status === 'rejected' || row.status === 'retired') throw new Refused('That rule is not in use, so it cannot be changed.')
    update.rule = text.slice(0, 1000)
  }

  const decision = body.decision
  if (decision !== undefined) {
    if (decision === 'approve' || decision === 'reject') {
      if (row.status !== 'suggested') throw new Refused('That rule has already been decided.')
      update.status = decision === 'approve' ? 'approved' : 'rejected'
    } else if (decision === 'retire') {
      if (row.status !== 'approved' && row.status !== 'applied') throw new Refused('That rule is not in use.')
      update.status = 'retired'
    } else if (decision === 'restore') {
      if (row.status !== 'retired' && row.status !== 'rejected') throw new Refused('That rule is already in use.')
      update.status = 'approved'
    } else {
      throw new Refused('Bad request')
    }
    update.decided_by = who || 'a consultant'
    update.decided_at = now
  }

  if (!Object.keys(update).length) throw new Refused('Bad request')
  const { data, error } = await db.from('house_style_rules').update(update).eq('id', ruleId)
    .eq('status', row.status).select('id, status, rule').maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Refused('Someone else changed that rule just now. Have another look.')
  return data
}

// ── The engine's side ────────────────────────────────────────────────────

async function signed(db: SupabaseClient, paths: string[]): Promise<string[]> {
  if (!paths.length) return []
  const { data } = await db.storage.from(PROPOSALS_BUCKET).createSignedUrls(paths, SIGNED_FOR)
  return (data ?? []).map(s => s.signedUrl)
}

async function versionFiles(db: SupabaseClient, proposalId: string, number: number) {
  const { data } = await db.from('proposal_versions').select('number, files')
    .eq('proposal_id', proposalId).eq('number', number).eq('finished', true).maybeSingle()
  if (!data) return null
  const prefix = versionPrefix(proposalId, number)
  const pagePaths = (data.files as string[]).filter(f => f.startsWith('pages/')).sort().map(f => `${prefix}/${f}`)
  const [html, pdf, ...pages] = await signed(db, [`${prefix}/proposal.html`, `${prefix}/proposal.pdf`, ...pagePaths])
  return { number, htmlUrl: html, pdfUrl: pdf, pageUrls: pages }
}

/**
 * Everything a run needs to look back over a sent proposal: the first draft
 * and the version sent, the consultant's own PDF if they changed it, the
 * whole conversation, and every rule there is — so it neither repeats one in
 * force nor suggests again what C&K turned down.
 */
export async function engineReviewJob(db: SupabaseClient, send: SendRow) {
  const { data: proposal } = await db.from('proposals').select('id, project_id, brief').eq('id', send.proposal_id).maybeSingle()
  if (!proposal) throw new Error('The proposal is not there any more.')
  const [{ data: project }, { data: first }, { data: messages }, { data: rules }] = await Promise.all([
    db.from('projects').select('name').eq('id', proposal.project_id).maybeSingle(),
    db.from('proposal_versions').select('number').eq('proposal_id', proposal.id).eq('finished', true)
      .order('number').limit(1).maybeSingle(),
    db.from('proposal_messages').select('author, body, page, answered_in, created_at')
      .eq('proposal_id', proposal.id).order('created_at'),
    db.from('house_style_rules').select('id, rule, why, status, send_id').order('created_at'),
  ])
  const [sent, firstDraft] = await Promise.all([
    versionFiles(db, proposal.id, send.version),
    first ? versionFiles(db, proposal.id, first.number) : Promise.resolve(null),
  ])
  if (!sent) throw new Error(`Version ${send.version} is not there any more.`)
  const [ownPdfUrl] = send.final_pdf_path ? await signed(db, [send.final_pdf_path]) : [null]

  return {
    send: send.id,
    projectName: project?.name ?? '',
    brief: (proposal.brief as { forEngine?: unknown }).forEngine ?? proposal.brief,
    sentBy: send.sent_by,
    sentAt: send.sent_at,
    sent,
    firstDraft: firstDraft && firstDraft.number !== sent.number ? firstDraft : null,
    consultantPdfUrl: ownPdfUrl,
    conversation: (messages ?? []).map(m => ({
      from: m.author, body: m.body, page: m.page, answeredIn: m.answered_in, at: m.created_at,
    })),
    rules: (rules ?? []).map(r => ({
      id: r.id, rule: r.rule, why: r.why, status: r.status, fromThisProposal: r.send_id === send.id,
    })),
    previousLesson: send.lesson,
  }
}

/** A rule the look back found, for Christian & Kwan to decide on. */
export async function engineReviewSuggest(db: SupabaseClient, send: SendRow, rule: unknown, why: unknown) {
  if (typeof rule !== 'string' || !rule.trim()) throw new Error('A suggestion needs a rule.')
  const { data: proposal } = await db.from('proposals').select('project_id').eq('id', send.proposal_id).maybeSingle()
  const { data, error } = await db.from('house_style_rules').insert({
    proposal_id: send.proposal_id, project_id: proposal?.project_id ?? null, send_id: send.id,
    rule: rule.trim().slice(0, 1000), why: typeof why === 'string' ? why.trim().slice(0, 1000) : '',
  }).select('id').single()
  if (error) throw new Error(error.message)
  return { id: data.id }
}

/** The look back is done: what this proposal teaches, in a few sentences. */
export async function engineReviewed(db: SupabaseClient, send: SendRow, lesson: unknown) {
  if (typeof lesson !== 'string' || !lesson.trim()) throw new Error('Say in a few sentences what this proposal teaches.')
  await db.from('proposal_sends').update({
    lesson: lesson.trim().slice(0, 3000), reviewed_at: new Date().toISOString(), review_error: null,
  }).eq('id', send.id)
  return { ok: true }
}

/**
 * The latest sent proposals, for a new one to learn from: each one's pages
 * as sent, the consultant's own PDF where they changed it, and what Claude
 * took from it. One per proposal, and never the proposal being built.
 */
export async function examplesForEngine(db: SupabaseClient, exceptProposalId: string) {
  const { data } = await db.from('proposal_sends').select(SEND_COLUMNS)
    .not('reviewed_at', 'is', null).neq('proposal_id', exceptProposalId)
    .order('sent_at', { ascending: false }).limit(20)
  const seen = new Set<string>()
  const picked: SendRow[] = []
  for (const s of (data ?? []) as SendRow[]) {
    if (seen.has(s.proposal_id)) continue
    seen.add(s.proposal_id)
    picked.push(s)
    if (picked.length >= EXAMPLES_FOR_A_NEW_PROPOSAL) break
  }
  const out = []
  for (const s of picked) {
    const files = await versionFiles(db, s.proposal_id, s.version)
    if (!files) continue
    const { data: proposal } = await db.from('proposals').select('projects(name)').eq('id', s.proposal_id).maybeSingle()
    const [ownPdfUrl] = s.final_pdf_path ? await signed(db, [s.final_pdf_path]) : [null]
    out.push({
      send: s.id,
      projectName: (proposal?.projects as { name?: string } | null)?.name ?? '',
      sentAt: s.sent_at,
      lesson: s.lesson ?? '',
      pageUrls: files.pageUrls,
      consultantPdfUrl: ownPdfUrl,
    })
  }
  return out
}
