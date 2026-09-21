/**
 * The export pack's markdown, assembled from a snapshot.
 *
 * ── What this document is for ───────────────────────────────────────────
 *
 * It is not the proposal. It is the input to one: the pack goes into Claude
 * Design, which lays the proposal out. So this file optimises for structure
 * over prose. Headings are predictable and in a fixed order, every fact is
 * labelled, and an image is always referenced from the section it belongs to.
 * A well-turned sentence here would be rewritten downstream; a missing
 * heading would not be noticed until it was.
 *
 * Three rules follow from that, and they are worth keeping:
 *
 *   · **Say the label even when the value is obvious.** `**Medium** Screenprint`
 *     survives being moved, reordered and summarised. A bare "Screenprint"
 *     does not.
 *   · **Never omit a top-level section because it is empty.** An empty
 *     section says the consultant had nothing to add. A missing one is
 *     indistinguishable from a bug in the export, and the reader downstream
 *     cannot tell which. Inside a section, silence is just silence — a work
 *     with no note does not announce it, or a project would carry forty
 *     lines saying nothing.
 *   · **Separate what is being proposed from what merely exists.** The works
 *     on the chosen walls are the proposal; the rest of the project is
 *     context. Running them together leaves the reader unable to tell three
 *     proposed prints from eleven that were only ever considered.
 *
 * ── What it does not do ─────────────────────────────────────────────────
 *
 * No filtering and no arithmetic. Private notes were dropped by
 * `notesForExport` before the snapshot was built, works were included or
 * excluded by the consultant's choices, and the budget arrives costed. This
 * module only decides what the document looks like — which is what lets
 * `node --test` cover it without a database.
 */
import type {
  ExportBudget, ExportElevation, ExportNote, ExportSnapshot, ExportWork,
} from './types'

/**
 * A filename that survives a zip, a download folder and a drag onto another
 * machine: lowercase, ASCII, hyphens. Accented letters are folded rather than
 * dropped, so `Miró` stays `miro` instead of collapsing to `mir`.
 */
export function fileSlug(raw: string, fallback = 'untitled'): string {
  const s = raw
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return s || fallback
}

/**
 * £4,500. Whole pounds: the pack is a proposal input, not an invoice.
 *
 * Deliberately the same rule as `fmtGbp` in budgetCalc.ts rather than an
 * import of it. `src/lib` does not reach into `src/components`, and the one
 * line of formatting is a smaller price than inverting that dependency.
 */
export function money(n: number): string {
  return '£' + Math.round(n).toLocaleString('en-GB')
}

/**
 * `£250 – £350`, matching what the budget screen already shows a client for
 * an indicative cost. Collapses to a single figure when the ends agree.
 */
export function moneyRange(min: number, max?: number): string {
  if (max == null || Math.round(min) === Math.round(max)) return money(min)
  return `${money(min)} – ${money(max)}`
}

/** 100 × 70 cm, with the multiplication sign rather than a letter x. */
function size(wCm: number, hCm: number): string {
  return `${wCm} × ${hCm} cm`
}

/** `**Label** value · **Label** value` — the fact line used throughout. */
function facts(pairs: Array<[string, string | null | undefined]>): string {
  const kept = pairs.filter(([, v]) => v != null && String(v).trim() !== '')
  return kept.map(([k, v]) => `**${k}** ${v}`).join(' · ')
}

/**
 * Lines that must stay together: a markdown table, or a list.
 *
 * Blocks are separated by a blank line, which is right for paragraphs and
 * fatal for tables — a blank line between two rows ends the table, and every
 * row after it renders as literal pipes. Anything built row by row goes
 * through here and arrives as a single block.
 */
function tight(parts: Array<string | null | undefined>): string {
  return parts.filter((p): p is string => !!p).join('\n')
}

/**
 * Notes under a top-level heading, or an explicit line saying there are none.
 *
 * The explicit line matters more than it looks *here*: the reader downstream
 * cannot tell silence from failure, and "Nothing written" is a fact a
 * consultant chose. It is only used where a section would otherwise be empty
 * — see `noteLines` for the inline case.
 */
function notesBlock(notes: ExportNote[]): string[] {
  if (notes.length === 0) return ['*Nothing written.*']
  return noteLines(notes)
}

/** Notes as they appear beside a work or an artist: present, or absent. */
function noteLines(notes: ExportNote[]): string[] {
  return notes.map(n => (n.covers ? `*About ${n.covers}.* ${n.body.trim()}` : n.body.trim()))
}

function workSection(work: ExportWork, level: number): string[] {
  const h = '#'.repeat(level)
  const out: string[] = [`${h} ${work.name}`]

  if (work.imageFile) out.push(`![${work.name}](${work.imageFile})`)

  out.push(facts([
    ['Artist', work.artist || 'Unattributed'],
    ['Size', size(work.wCm, work.hCm)],
    ['Year', work.year],
    ['Medium', work.medium],
    ['Edition', work.edition],
  ]))

  const commercial = facts([
    ['Price', work.price > 0 ? `${money(work.price)} ex VAT` : null],
    ['Discount', work.discountStatus === 'confirmed' && work.discountPercent
      ? `${work.discountPercent}% confirmed`
      : work.discountStatus === 'tbc' && work.discountPercent
        ? `${work.discountPercent}% to be confirmed`
        : null],
    ['From', work.source],
  ])
  if (commercial) out.push(commercial)

  // A zero-valued extra is a row somebody started and left; it is not a cost
  // and listing it as one invites a question with no answer.
  const costs = work.subLineItems
    .map(item => {
      const amount = item.mode === 'percent'
        ? (item.percent > 0 ? `${item.percent}% of the price` : null)
        : (item.amount > 0 ? money(item.amount) : null)
      if (!amount) return null
      const label = item.label?.trim() || titleCase(item.kind)
      return `- ${label}: ${amount}`
    })
  const costBlock = tight(costs)
  if (costBlock) out.push(costBlock)

  // Where it hangs is derived from the placements in this export, so it
  // names only walls the reader can actually see in this pack.
  if (work.hangsOn.length > 0) {
    out.push(facts([['Hangs on', work.hangsOn.join(', ')]]))
  } else if (work.consideredFor) {
    out.push(facts([['Considered for', work.consideredFor]]))
  }

  out.push(...noteLines(work.notes))
  return out
}

/** `other` → `Other`, for the sub-line kinds that carry no label. */
function titleCase(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s
}

function elevationSection(elev: ExportElevation, works: Map<string, ExportWork>): string[] {
  const opt = elev.option
  const out: string[] = [`### ${elev.name}`]

  out.push(facts([
    ['Option', opt.title],
    ['Picked by the client', opt.picked ? 'yes' : null],
    ['Wall', opt.wallWCm && opt.wallHCm ? size(opt.wallWCm, opt.wallHCm) : null],
    ['Works', String(opt.workIds.length)],
  ]))

  if (opt.renderFile) out.push(`![${elev.name}, ${opt.title}](${opt.renderFile})`)
  if (opt.thumbnailFile) out.push(`![${elev.name} thumbnail](${opt.thumbnailFile})`)

  const hung = opt.workIds.length === 0
    ? ['- *Nothing hung yet.*']
    : opt.workIds.flatMap(id => {
        const w = works.get(id)
        if (!w) return []
        return [`- ${w.artist || 'Unattributed'} — ${w.name} (${size(w.wCm, w.hCm)})`]
      })
  out.push('**On this wall**')
  out.push(tight(hung))

  out.push('**About this elevation**')
  out.push(...notesBlock([...elev.notes, ...opt.notes]))
  return out
}

/** "£500 below" / "£200 above" / "exactly on it". */
function describeGap(diff: number): string {
  if (Math.round(diff) === 0) return 'exactly on it'
  return `${money(Math.abs(diff))} ${diff > 0 ? 'above' : 'below'}`
}

function budgetSection(budget: ExportBudget): string[] {
  const rows = [
    '| Line | Amount |',
    '| --- | --- |',
    ...budget.lines.map(line =>
      `| ${line.sub ? '&nbsp;&nbsp;↳ ' : ''}${line.label} | ${moneyRange(line.amount, line.amountMax)} |`),
    `| **Total ex VAT** | **${moneyRange(budget.total, budget.totalMax)}** |`,
  ]
  const out: string[] = ['## Budget', tight(rows)]

  if (budget.clientBudget != null) {
    out.push(facts([['Client budget', `${money(budget.clientBudget)} ex VAT`]]))
    // Stated as a difference, never as a verdict. Whether being £2,000 over
    // is a problem is the consultant's conversation with the client, and an
    // export that called it one would be grading their choice.
    const lo = budget.total - budget.clientBudget
    const hi = budget.totalMax - budget.clientBudget
    if (Math.round(lo) === Math.round(hi)) {
      out.push(lo === 0
        ? 'The total matches the budget exactly.'
        : `The total is ${money(Math.abs(lo))} ${lo > 0 ? 'above' : 'below'} the budget.`)
    } else {
      // A range can straddle the budget, and saying "above" or "below" of a
      // span that does both would be false at one end.
      out.push(`Against the budget, the total runs from ${describeGap(lo)} to ${describeGap(hi)}.`)
    }
  }

  out.push('**About the budget**')
  out.push(...notesBlock(budget.notes))
  return out
}

/**
 * The whole document.
 *
 * Section order is fixed and deliberate: the project, then the walls, then
 * the works being proposed, then the rest of the project, then what was set
 * aside, then the money. It runs from the most context to the most detail,
 * so a reader who stops early still has something coherent.
 */
export function buildMarkdown(snap: ExportSnapshot): string {
  const byId = new Map(snap.works.map(w => [w.id, w]))
  const blocks: string[][] = []

  blocks.push([
    `# ${snap.projectName}`,
    facts([
      ['Client', snap.clientName],
      ['Consultant', snap.consultantName],
      ['Exported', snap.exportedAt],
    ]),
  ])

  blocks.push(['## The project', ...notesBlock(snap.projectNotes)])

  const elevBlock: string[] = ['## Elevations']
  if (snap.elevations.length === 0) {
    elevBlock.push('*No elevations were included in this export.*')
  }
  blocks.push(elevBlock)
  for (const elev of snap.elevations) blocks.push(elevationSection(elev, byId))

  // The proposal is the works on the chosen walls. Everything else the
  // project holds is context, and saying so is the difference between three
  // prints being put forward and fourteen being listed.
  const live = snap.works.filter(w => !w.setAside)
  const proposed = live.filter(w => w.hangsOn.length > 0)
  const rest = live.filter(w => w.hangsOn.length === 0)
  const aside = snap.works.filter(w => w.setAside)

  const notesByArtist = new Map(snap.artists.map(a => [a.id, a.notes]))

  /**
   * Works grouped by artist, with the artist's standing note folded in.
   *
   * The note used to have a section of its own, which emitted `### Julian
   * Opie` a second time at the same level meaning something else — nothing
   * reading the pack could tell the two apart. Beside the work is also where
   * a proposal wants it.
   */
  function worksUnder(heading: string, empty: string, set: ExportWork[]) {
    blocks.push([heading])
    if (set.length === 0) {
      blocks.push([empty])
      return
    }
    for (const group of groupByArtist(set)) {
      const standing = group.artistId ? notesByArtist.get(group.artistId) ?? [] : []
      blocks.push([`### ${group.artist}`, ...noteLines(standing)])
      for (const w of group.works) blocks.push(workSection(w, 4))
    }
  }

  worksUnder('## Works', '*No works are on the walls in this export.*', proposed)
  worksUnder(
    '## Also in the project',
    '*Nothing else — every work in the project is on a wall here.*',
    rest,
  )

  if (snap.choices.includeSetAside) {
    blocks.push([
      '## Set aside',
      'Works taken out of the running, and who decided. The reason, where one was given, is in the note under each.',
    ])
    if (aside.length === 0) blocks.push(['*Nothing has been set aside.*'])
    for (const w of aside) {
      blocks.push([
        ...workSection(w, 3),
        facts([['Set aside by', w.setAside === 'client' ? 'the client' : 'us']]),
      ])
    }
  }

  if (snap.budget) blocks.push(budgetSection(snap.budget))

  return blocks
    .map(b => b.filter(part => part.trim() !== '').join('\n\n'))
    .filter(b => b !== '')
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim() + '\n'
}

/**
 * Artist groups in the order the works arrive, unattributed last.
 *
 * Grouped by `artistId` where there is one, so two spellings of the same
 * artist cannot split into two headings — the display name is a copy, and
 * 032 exists because those copies drift.
 */
function groupByArtist(
  works: ExportWork[]
): Array<{ artist: string; artistId: string | null; works: ExportWork[] }> {
  const groups = new Map<string, { artist: string; artistId: string | null; works: ExportWork[] }>()
  for (const w of works) {
    const name = w.artist?.trim() || ''
    const key = w.artistId ?? (name ? `name:${name}` : '')
    const g = groups.get(key)
    if (g) g.works.push(w)
    else groups.set(key, { artist: name, artistId: w.artistId, works: [w] })
  }
  const out = [...groups.entries()].filter(([k]) => k !== '').map(([, g]) => g)
  const un = groups.get('')
  if (un) out.push({ ...un, artist: 'Unattributed' })
  return out
}
