/**
 * The conversation on an option (migration 038).
 *
 * The client used to have one text box per option, saved as they typed and
 * overwritten each time. Now each thing they say is a message: sent, dated
 * and kept, and C&K can answer from the studio. The whole conversation goes
 * into the proposal pack.
 *
 * Nothing here talks to the database or the DOM, so `node --test` covers it
 * and the portal, the studio, the email and the export all share it.
 */

/** Who wrote a message. C&K reply as the practice, not as either of them. */
export type MessageAuthor = 'client' | 'studio'

export interface OptionMessage {
  id: string
  optionId: string
  author: MessageAuthor
  body: string
  createdAt: string
  /** When C&K first saw a client's message in the studio. Null is "new". */
  readAt: string | null
}

/** The row as the database returns it. */
export interface OptionMessageRow {
  id: string
  option_id: string
  author: string
  body: string
  created_at: string
  read_at: string | null
}

/** The columns every read asks for, named once. */
export const MESSAGE_COLUMNS = 'id, option_id, author, body, created_at, read_at'

/**
 * Long enough for anything a client would type into a sidebar; short enough
 * that a pasted document is refused rather than stored.
 */
export const MESSAGE_MAX_LENGTH = 4000

export function rowToMessage(r: OptionMessageRow): OptionMessage {
  return {
    id: r.id,
    optionId: r.option_id,
    // Anything unrecognised is treated as the client's: it came from outside.
    author: r.author === 'studio' ? 'studio' : 'client',
    body: r.body ?? '',
    createdAt: r.created_at,
    readAt: r.read_at ?? null,
  }
}

/**
 * The text as it will be stored, or null when there is nothing to send.
 * Trimmed, because a message of spaces is not a message and the database
 * refuses one; capped, so the server never has to decide what to cut.
 */
export function cleanMessage(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const body = raw.trim()
  if (body.length === 0 || body.length > MESSAGE_MAX_LENGTH) return null
  return body
}

/** Messages grouped by option, oldest first within each. */
export function messagesByOption(messages: OptionMessage[]): Record<string, OptionMessage[]> {
  const out: Record<string, OptionMessage[]> = {}
  for (const m of [...messages].sort(byTime)) (out[m.optionId] ??= []).push(m)
  return out
}

function byTime(a: OptionMessage, b: OptionMessage): number {
  return Date.parse(a.createdAt) - Date.parse(b.createdAt)
}

/** Client messages C&K have not opened yet. */
export function unreadCount(messages: OptionMessage[] | undefined): number {
  return (messages ?? []).filter(m => m.author === 'client' && !m.readAt).length
}

const DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' })
const DAY_YEAR = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' })
const TIME = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' })

/**
 * "14:32" today, "19 Sept" this year, "19 Sept 2025" before that. A
 * conversation is read top to bottom, so the date only needs to say as much
 * as tells two messages apart.
 */
export function messageWhen(iso: string, now: Date = new Date()): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  if (DAY_YEAR.format(d) === DAY_YEAR.format(now)) return TIME.format(d)
  return d.getUTCFullYear() === now.getUTCFullYear() ? DAY.format(d) : DAY_YEAR.format(d)
}
