/**
 * The email the practice gets when a client has been busy in the portal.
 *
 * Written when it is sent, from the project as it stands then (migration
 * 037). The recorded actions only say what was touched — which wall was
 * chosen for, which option approved — and the words come from the current
 * state, so a choice made and then cleared says so instead of reporting the
 * first click. A message is the exception: it never changes once sent, so
 * each one is quoted exactly as it went (038).
 *
 * Pure, so the wording can be tested without a database or an email.
 */

export type ActivityKind = 'pick' | 'approve' | 'note'

export interface DigestAction {
  kind: ActivityKind
  elevationId: string | null
  optionId: string | null
  createdAt: string
  /**
   * The words of the message this action sent. Absent for a note recorded
   * before 038, when the client had one box per option and its earlier text
   * was overwritten — those are reported without a quote.
   */
  message?: string | null
}

export interface DigestOption {
  id: string
  /** How the client saw it: its name, or "Option B". */
  title: string
  approved: boolean
}

export interface DigestElevation {
  id: string
  name: string
  /** Stored key of the option the client has chosen, if any. */
  pickedOptionId: string | null
  /**
   * The options the client was shown. With only one, the portal never names
   * it, so neither does the email.
   */
  options: DigestOption[]
}

export interface DigestProject {
  name: string
  /** 'approved' once every elevation the client can see is approved. */
  status: string
}

export interface Digest {
  subject: string
  text: string
  html: string
}

/** A wall's lines, in the order a person would tell it: chose, approved, wrote. */
interface Line {
  text: string
  /** A message's own words, shown quoted under its line. */
  quote?: string
}

const TIME = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London',
})

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

/** "a, b and c". */
function listed(parts: string[]): string {
  if (parts.length <= 1) return parts.join('')
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function linesFor(elev: DigestElevation, actions: DigestAction[]): Line[] {
  const single = elev.options.length <= 1
  const optionById = new Map(elev.options.map(o => [o.id, o]))
  const lines: Line[] = []

  if (actions.some(a => a.kind === 'pick')) {
    const chosen = elev.pickedOptionId ? optionById.get(elev.pickedOptionId) : undefined
    lines.push({ text: chosen ? `Chose ${chosen.title}` : 'Chose an option, then cleared the choice' })
  }

  const once = (kind: ActivityKind) =>
    [...new Set(actions.filter(a => a.kind === kind && a.optionId).map(a => a.optionId as string))]
      .map(id => optionById.get(id))
      .filter((o): o is DigestOption => !!o)

  for (const o of once('approve')) {
    const what = single ? 'Approved' : `Approved ${o.title}`
    // The consultant can take an approval back; say so rather than report it.
    lines.push({ text: o.approved ? what : `${what} (since withdrawn)` })
  }

  // Every message is its own line, in the order sent. A pre-038 note was
  // recorded once per autosave, so those collapse to one line per option.
  const legacy = new Set<string>()
  for (const a of messageActions(actions)) {
    const o = optionById.get(a.optionId as string)
    if (!o) continue
    const on = single ? '' : ` on ${o.title}`
    const words = a.message?.trim()
    if (words) lines.push({ text: `Sent a message${on}`, quote: words })
    else if (!legacy.has(o.id)) { legacy.add(o.id); lines.push({ text: `Left a note${on}` }) }
  }
  return lines
}

/** The message actions, oldest first. */
function messageActions(actions: DigestAction[]): DigestAction[] {
  return actions
    .filter(a => a.kind === 'note' && a.optionId)
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
}

/** How many messages the subject line should count: each sent, each old box once. */
function messageCount(actions: DigestAction[]): number {
  const notes = messageActions(actions)
  const sent = notes.filter(a => a.message?.trim()).length
  const legacy = new Set(notes.filter(a => !a.message?.trim()).map(a => a.optionId)).size
  return sent + legacy
}

export function buildDigest(
  project: DigestProject,
  elevations: DigestElevation[],
  actions: DigestAction[],
  projectUrl: string,
): Digest | null {
  // Walls in the project's order; a wall deleted since the action is skipped.
  const sections = elevations
    .map(elev => ({ elev, lines: linesFor(elev, actions.filter(a => a.elevationId === elev.id)) }))
    .filter(s => s.lines.length > 0)
  if (sections.length === 0) return null

  const distinct = (kind: ActivityKind, key: (a: DigestAction) => string | null) =>
    new Set(actions.filter(a => a.kind === kind).map(key).filter(Boolean)).size
  const summary = listed([
    distinct('pick', a => a.elevationId) && count(distinct('pick', a => a.elevationId), 'choice', 'choices'),
    distinct('approve', a => a.optionId) && count(distinct('approve', a => a.optionId), 'approval', 'approvals'),
    messageCount(actions) && count(messageCount(actions), 'message', 'messages'),
  ].filter((p): p is string => !!p))

  const times = actions.map(a => Date.parse(a.createdAt)).filter(t => !Number.isNaN(t))
  const first = TIME.format(Math.min(...times))
  const last = TIME.format(Math.max(...times))
  const when = first === last ? `at ${first}` : `between ${first} and ${last}`
  // "The client", not their name: a name cannot say whether it takes "was"
  // (Mr & Mrs Hamilton, Acme Ltd), and "From Mr & Mrs Hamilton" reads as if
  // they sent the email. "Active", not "viewed": the times are when they did
  // something, not how long they had the proposal open.
  const intro = `The client was active in the ${project.name} proposal ${when}.`
  const allApproved = project.status === 'approved' && actions.some(a => a.kind === 'approve')
  const finale = 'Every elevation is now approved.'

  const subject = `${project.name}: ${summary} from the client`

  const text = [
    intro,
    ...(allApproved ? ['', finale] : []),
    ...sections.flatMap(({ elev, lines }) => [
      '',
      elev.name,
      ...lines.flatMap(l => [`  • ${l.text}`, ...(l.quote ? l.quote.split('\n').map(q => `      “${q}”`) : [])]),
    ]),
    '',
    `Open the project: ${projectUrl}`,
  ].join('\n')

  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f7f5f0;font-family:Helvetica,Arial,sans-serif;color:#2b2b2b">
<div style="max-width:560px;margin:0 auto;background:#ffffff;padding:28px 32px;border:1px solid #e4e0d8">
<p style="margin:0 0 6px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#8a8580">Elevation Studio</p>
<h1 style="margin:0 0 16px;font-size:20px;font-weight:normal">${escapeHtml(project.name)}</h1>
<p style="margin:0 0 20px;font-size:14px;line-height:1.5">${escapeHtml(intro)}</p>
${allApproved ? `<p style="margin:0 0 20px;padding:10px 12px;background:#eef5ee;font-size:14px">${finale}</p>` : ''}
${sections.map(({ elev, lines }) => `<h2 style="margin:20px 0 8px;font-size:15px">${escapeHtml(elev.name)}</h2>
<ul style="margin:0;padding:0 0 0 18px;font-size:14px;line-height:1.6">
${lines.map(l => `<li>${escapeHtml(l.text)}${l.quote
    ? `<blockquote style="margin:6px 0 8px;padding:6px 12px;border-left:3px solid #d8d2c6;color:#555;white-space:pre-wrap">${escapeHtml(l.quote)}</blockquote>`
    : ''}</li>`).join('\n')}
</ul>`).join('\n')}
<p style="margin:28px 0 0"><a href="${escapeHtml(projectUrl)}" style="display:inline-block;padding:10px 16px;background:#2b2b2b;color:#ffffff;text-decoration:none;font-size:13px">Open the project</a></p>
</div>
</body></html>`

  return { subject, text, html }
}
