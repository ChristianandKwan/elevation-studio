/**
 * The shape the export works from — plain data, no database and no sharp.
 *
 * The pack is assembled in two halves. This module and `markdown.ts` are the
 * half that can be reasoned about: give them a snapshot and a set of choices
 * and they produce the same markdown every time, which is what makes the
 * structure testable under `node --test`. `pack.ts` is the other half — it
 * reads Supabase, renders walls with sharp and writes the zip — and it does
 * no thinking about what the document says.
 *
 * Everything here is already filtered. Private notes are gone (that is
 * `notesForExport`, and it stays the one place that filter lives), set-aside
 * works are in or out according to the consultant's choice, and elevations
 * the consultant unticked are simply absent. Nothing downstream re-decides.
 */
import type { SetAside, SubLineItem } from '@/types'

/** What the consultant ticked on the export screen. */
export interface ExportChoices {
  /** Option ids to include, one per elevation — the consultant picks which. */
  optionIds: string[]
  /** Include works somebody has taken out of the running. Off by default. */
  includeSetAside: boolean
  /** The wall as it will look, one PNG per included option. */
  includeWallRenders: boolean
  /** Each work's own image file, full size, on its own. */
  includeWorkImages: boolean
  /** The small cached option thumbnails. Rarely wanted beside the renders. */
  includeThumbnails: boolean
}

export const DEFAULT_CHOICES: Omit<ExportChoices, 'optionIds'> = {
  includeSetAside: false,
  includeWallRenders: true,
  includeWorkImages: true,
  includeThumbnails: false,
}

/** A note, already filtered to the ones that may leave the studio. */
export interface ExportNote {
  id: string
  body: string
  /** Named when the note covers several works, so the reader knows the scope. */
  covers?: string
}

export interface ExportWork {
  id: string
  name: string
  artist: string
  artistId: string | null
  wCm: number
  hCm: number
  price: number
  discountStatus: string
  discountPercent: number | null
  subLineItems: SubLineItem[]
  year: string | null
  medium: string | null
  edition: string | null
  source: string | null
  setAside: SetAside | null
  consideredFor: string | null
  /** Where this work hangs, by elevation name, within the chosen options. */
  hangsOn: string[]
  /** Path inside the zip, when the work's image was included. */
  imageFile: string | null
  notes: ExportNote[]
}

export interface ExportOption {
  id: string
  /** "Option A", or the name the consultant gave it. */
  title: string
  /** True when this is the option the client picked. */
  picked: boolean
  wallWCm: number | null
  wallHCm: number | null
  /** Paths inside the zip. */
  renderFile: string | null
  thumbnailFile: string | null
  /** Works on this wall, in the order they were placed. */
  workIds: string[]
  notes: ExportNote[]
}

export interface ExportElevation {
  id: string
  name: string
  option: ExportOption
  notes: ExportNote[]
}

export interface ExportArtist {
  id: string
  name: string
  notes: ExportNote[]
}

/**
 * A budget line, already costed. The export reports; it does not calculate.
 *
 * The arithmetic is `budgetCalc.ts`'s, done in `pack.ts` and handed over as
 * numbers. There is one budget in this product and it lives on the budget
 * screen; a second implementation here would drift from it and the drift
 * would surface in a client's proposal.
 */
export interface ExportBudgetLine {
  label: string
  amount: number
  /**
   * Set only where the figure is genuinely a range — indicative installation
   * is the one that survives choosing a single option per elevation.
   */
  amountMax?: number
  /** Indented under the line above — framing, duty, shipping. */
  sub?: boolean
}

export interface ExportBudget {
  lines: ExportBudgetLine[]
  total: number
  /** The dearest end, where any line is a range. Equals `total` otherwise. */
  totalMax: number
  clientBudget: number | null
  notes: ExportNote[]
}

export interface ExportSnapshot {
  projectName: string
  clientName: string
  consultantName: string
  /** ISO date the pack was made. */
  exportedAt: string
  projectNotes: ExportNote[]
  elevations: ExportElevation[]
  works: ExportWork[]
  artists: ExportArtist[]
  budget: ExportBudget | null
  /** Carried through so the document can say what was left out. */
  choices: ExportChoices
}
