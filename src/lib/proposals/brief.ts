/**
 * What the consultant decides before a proposal is built.
 *
 * Tom's note on the Nepean trial: the engine left out About Us — correctly,
 * by the design system's rule that intro pages are for a new client's first
 * pitch — but C&K should be offered the choice rather than have it made for
 * them. So Create proposal opens with this short list, pre-ticked from the
 * one question that decides most of it: is this client new?
 *
 * Pure: no database, so `node --test` covers it.
 */

export type ClientType = 'new' | 'existing'

export interface ProposalPages {
  /** Contents, Our approach, Our process. */
  intro: boolean
  /** The founders' page, bios in full. */
  aboutUs: boolean
  /** Notes and the budget, typeset from the export's figures. */
  notesAndBudget: boolean
  /** The empty wall with its measurements. */
  wallSpecs: boolean
  /** One page per artist listing their works and prices. */
  priceLists: boolean
}

export interface ProposalBrief {
  /** Which options go in, exactly as the export takes them. */
  optionIds: string[]
  includeSetAside: boolean
  clientType: ClientType
  pages: ProposalPages
  /** The work on the cover; null lets the engine choose by the house rules. */
  coverWorkId: string | null
  /** Under the title on the cover, e.g. "Version 2 | 17.9.26". */
  subtitle: string
  /** Anything else the consultant wants Claude to know before it starts. */
  instructions: string
}

/** The pages a client of each kind usually gets. The consultant can change any. */
export function defaultPages(clientType: ClientType): ProposalPages {
  const isNew = clientType === 'new'
  return {
    intro: isNew,
    aboutUs: isNew,
    notesAndBudget: true,
    wallSpecs: true,
    priceLists: true,
  }
}

/** "Curated Options | 27.9.26", C&K's own form of a date. */
export function defaultSubtitle(date = new Date()): string {
  const d = date.getDate()
  const m = date.getMonth() + 1
  const y = String(date.getFullYear()).slice(-2)
  return `Curated Options | ${d}.${m}.${y}`
}

const MAX_TEXT = 2000

/** Read a brief from a request body defensively: it is not our own state. */
export function readBrief(raw: unknown): ProposalBrief | null {
  if (typeof raw !== 'object' || raw === null) return null
  const b = raw as Record<string, unknown>

  const ids = b.optionIds
  if (!Array.isArray(ids) || ids.length === 0 || ids.some(id => typeof id !== 'string')) return null

  const clientType: ClientType = b.clientType === 'new' ? 'new' : 'existing'
  const defaults = defaultPages(clientType)
  const p = (typeof b.pages === 'object' && b.pages !== null ? b.pages : {}) as Record<string, unknown>
  const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback)
  const text = (v: unknown, fallback = '') =>
    typeof v === 'string' ? v.trim().slice(0, MAX_TEXT) : fallback

  return {
    optionIds: ids as string[],
    includeSetAside: bool(b.includeSetAside, false),
    clientType,
    pages: {
      intro: bool(p.intro, defaults.intro),
      aboutUs: bool(p.aboutUs, defaults.aboutUs),
      notesAndBudget: bool(p.notesAndBudget, defaults.notesAndBudget),
      wallSpecs: bool(p.wallSpecs, defaults.wallSpecs),
      priceLists: bool(p.priceLists, defaults.priceLists),
    },
    coverWorkId: typeof b.coverWorkId === 'string' && b.coverWorkId ? b.coverWorkId : null,
    subtitle: text(b.subtitle) || defaultSubtitle(),
    instructions: text(b.instructions),
  }
}

/**
 * The brief as the engine reads it (brief.json): the same decisions, with the
 * cover named so it can be found in the pack without an id to look up.
 */
export function briefForEngine(brief: ProposalBrief, coverWorkName: string | null) {
  return {
    clientType: brief.clientType,
    pages: brief.pages,
    cover: coverWorkName ? { work: coverWorkName } : 'choose by the house rules',
    subtitle: brief.subtitle,
    instructions: brief.instructions || null,
  }
}
