import type {
  BudgetInstallation, BudgetConsultantFee, BudgetCustomLineItem,
  BudgetChoiceKind, Currency, DiscountStatus, SubLineItem,
} from '@/types'

// ── Types used across budget components ───────────────────────────────────────

export interface BudgetArtwork {
  /** The placement. Two options showing the same print are two of these. */
  id: string
  /** The work. Money and notes are written here, so both placements move. */
  workId: string
  name: string
  artist: string
  wCm: number
  hCm: number
  /**
   * The list price, ex-VAT, before any discount. In `priceCurrency` as
   * stored; in the currency on screen once the budget has converted it
   * (currency.ts).
   */
  price: number
  /** The currency the price was quoted in. Absent means pounds. */
  priceCurrency?: Currency
  /** The price as quoted, kept when the budget converted it for the screen. */
  quotedPrice?: number
  /** The price needed a rate and there was none, so it counts as nothing. */
  priceUnconverted?: boolean
  visible: boolean
  note: string
  noteShownToClient: boolean
  vatApplies: boolean
  discountStatus: DiscountStatus
  discountPercent: number | null
  subLineItems: SubLineItem[]
  /**
   * What each budget choice costs this work. Worked out on the budget from
   * the choices (choices.ts) and never saved on the work, so the line editor
   * cannot write one back as if it were the work's own cost.
   */
  choiceLines?: ChoiceLine[]
}

/** One alternative's figure, ex-VAT, with the VAT treatment it carries. */
export interface ChoiceAmount {
  amount: number
  vatApplies: boolean
}

/** A budget choice's cost on one work. */
export interface ChoiceLine {
  choiceId: string
  kind: BudgetChoiceKind
  /** Picked: "Framing · Conservation, Framer 1". Open: the choice's name. */
  label: string
  /** The picked alternative's figure. Absent while the choice is open. */
  picked?: ChoiceAmount
  /**
   * While the choice is open: this work's figure under each alternative on
   * offer, in the same order on every work, so an option's figures can be
   * added up one alternative at a time.
   */
  open?: ChoiceAmount[]
}

/**
 * The fields a consultant can change from the budget.
 *
 * Everything here is money or the words around it. Placement, size, frame and
 * lighting stay in the studio, where the consultant is looking at the wall
 * rather than at the numbers.
 */
export type BudgetArtworkPatch = Partial<Pick<
  BudgetArtwork,
  'price' | 'priceCurrency' | 'vatApplies' | 'discountStatus' | 'discountPercent'
  | 'subLineItems' | 'note' | 'noteShownToClient'
>>

// ── Discounts and sub line items ──────────────────────────────────────────────

export const VAT_RATE = 0.2

/**
 * What the work actually costs, ex-VAT.
 *
 * Only a confirmed discount moves this. A `tbc` discount is displayed on the
 * line but deliberately left out of every total: it has not been agreed, and a
 * client should never approve an option on the strength of a saving nobody
 * promised.
 */
export function netPrice(a: Pick<BudgetArtwork, 'price' | 'discountStatus' | 'discountPercent'>): number {
  if (a.discountStatus !== 'confirmed') return a.price
  if (a.discountPercent == null) return a.price
  return Math.round(a.price * (1 - a.discountPercent / 100))
}

/** What a `tbc` discount would net to, for display only. */
export function tbcNetPrice(
  a: Pick<BudgetArtwork, 'price' | 'discountStatus' | 'discountPercent'>,
): number | null {
  if (a.discountStatus !== 'tbc' || a.discountPercent == null) return null
  return Math.round(a.price * (1 - a.discountPercent / 100))
}

/**
 * One sub item's cost, ex-VAT.
 *
 * A percentage is taken from the discounted price, not the list price: a
 * customs authority charges duty on what was paid.
 */
export function subItemAmount(item: SubLineItem, artworkNet: number): number {
  if (item.mode === 'percent') return Math.round(artworkNet * (item.percent / 100))
  return Math.round(item.amount)
}

/** Apply the current VAT view to one ex-VAT figure. */
export function applyVat(value: number, vatApplies: boolean, vatMode: boolean): number {
  return vatMode && vatApplies ? Math.round(value * (1 + VAT_RATE)) : Math.round(value)
}

/** Everything one artwork adds to the budget in the current view. */
export function artworkLineTotal(a: BudgetArtwork, vatMode: boolean): number {
  const net = netPrice(a)
  const own = a.subLineItems.reduce(
    (sum, item) => sum + applyVat(subItemAmount(item, net), item.vatApplies, vatMode),
    applyVat(net, a.vatApplies, vatMode),
  )
  return (a.choiceLines ?? []).reduce(
    (sum, l) => sum + (l.picked ? applyVat(l.picked.amount, l.picked.vatApplies, vatMode) : 0),
    own,
  )
}

export interface BudgetOptionData {
  /** Stored key — matches `clientPickedOption`. Never shown. */
  key: string
  /** Tab label: the option's name, or its position letter (src/lib/options.ts). */
  label: string
  /** Sentence form: the name, or "Option A". */
  title: string
  /** Consultant-given name, or null when the option goes by its letter. */
  name: string | null
  /** Where pair and set pricing is explained. Consultant to client. */
  consultantNote: string
  consultantNoteShownToClient: boolean
  artworks: BudgetArtwork[]
  /**
   * Whether the option has a wall (a photograph or a blank wall) and whether
   * the client has approved it. Only the decisions (src/lib/decisions.ts)
   * read these; absent counts as no.
   */
  hasWall?: boolean
  approved?: boolean
}

export interface BudgetElevationData {
  id: string
  name: string
  clientPickedOption: string | null
  /**
   * Consultant side only. A hidden elevation is still listed for the
   * consultant to price, but stays out of every total. The client portal never
   * receives hidden elevations, so there it is always absent.
   */
  hiddenFromClient?: boolean
  options: BudgetOptionData[]
}

// ── Formatting ─────────────────────────────────────────────────────────────────

export function fmtGbp(n: number): string {
  return '£' + Math.round(n).toLocaleString('en-GB')
}

export function fmtRange(min: number, max: number): string {
  if (Math.round(min) === Math.round(max)) return fmtGbp(min)
  return `${fmtGbp(min)} – ${fmtGbp(max)}`
}

// ── Installation tiers ─────────────────────────────────────────────────────────

/** The tiers in pounds. `factor` moves them into the currency on screen. */
export function installRange(count: number, factor = 1): { min: number; max: number } {
  const r = installRangeGbp(count)
  return factor === 1 ? r : { min: Math.round(r.min * factor), max: Math.round(r.max * factor) }
}

function installRangeGbp(count: number): { min: number; max: number } {
  if (count === 0) return { min: 0, max: 0 }
  if (count <= 5) return { min: 125, max: 185 }
  if (count <= 15) return { min: 250, max: 350 }
  return { min: 400, max: 600 }
}

export interface InstallCostDisplay {
  min: number
  max: number
  isIndicative: boolean
}

export function installCostDisplay(
  installation: BudgetInstallation,
  artCountMin: number,
  artCountMax: number,
  /** Pounds to the currency on screen, for the indicative tiers. */
  factor = 1,
): InstallCostDisplay {
  if (!installation.indicative && installation.confirmedAmount != null) {
    const v = installation.confirmedAmount
    return { min: v, max: v, isIndicative: false }
  }
  const rMin = installRange(artCountMin, factor)
  const rMax = installRange(artCountMax, factor)
  return {
    min: Math.min(rMin.min, rMax.min),
    max: Math.max(rMin.max, rMax.max),
    isIndicative: true,
  }
}

// ── Option-level totals ────────────────────────────────────────────────────────

/**
 * Ex-VAT money, split by VAT treatment so the summary can show a VATable and
 * an exempt row rather than multiplying everything by 1.2 and hoping.
 */
export interface TotalsBucket {
  artVatable: number
  artExempt: number
  framingVatable: number
  framingExempt: number
  otherVatable: number
  otherExempt: number
  artCount: number
}

export interface OptionTotals extends TotalsBucket {
  hasFraming: boolean
  hasOther: boolean
}

export function emptyBucket(): TotalsBucket {
  return {
    artVatable: 0, artExempt: 0,
    framingVatable: 0, framingExempt: 0,
    otherVatable: 0, otherExempt: 0,
    artCount: 0,
  }
}

export function addBuckets(a: TotalsBucket, b: TotalsBucket): TotalsBucket {
  return {
    artVatable: a.artVatable + b.artVatable,
    artExempt: a.artExempt + b.artExempt,
    framingVatable: a.framingVatable + b.framingVatable,
    framingExempt: a.framingExempt + b.framingExempt,
    otherVatable: a.otherVatable + b.otherVatable,
    otherExempt: a.otherExempt + b.otherExempt,
    artCount: a.artCount + b.artCount,
  }
}

/** The bucket as one figure in the given view. */
export function bucketTotal(b: TotalsBucket, vatMode: boolean): number {
  const vatable = b.artVatable + b.framingVatable + b.otherVatable
  const exempt = b.artExempt + b.framingExempt + b.otherExempt
  return applyVat(vatable, true, vatMode) + exempt
}

export function getOptionTotals(artworks: BudgetArtwork[]): OptionTotals {
  const bucket = emptyBucket()
  let hasFraming = false
  let hasOther = false

  for (const a of artworks.filter(x => x.visible)) {
    const net = netPrice(a)
    if (a.vatApplies) bucket.artVatable += net
    else bucket.artExempt += net
    bucket.artCount += 1

    const costs = [
      ...a.subLineItems.map(item => ({
        framing: item.kind === 'framing', amount: subItemAmount(item, net), vatApplies: item.vatApplies,
      })),
      // A choice counts once it is picked. While it is open its range is
      // carried by the option's figures and the project's From / Up to.
      ...(a.choiceLines ?? []).filter(l => l.picked).map(l => ({
        framing: l.kind === 'framing', amount: Math.round(l.picked!.amount), vatApplies: l.picked!.vatApplies,
      })),
    ]
    for (const cost of costs) {
      if (cost.amount === 0) continue
      if (cost.framing) {
        hasFraming = true
        if (cost.vatApplies) bucket.framingVatable += cost.amount
        else bucket.framingExempt += cost.amount
      } else {
        hasOther = true
        if (cost.vatApplies) bucket.otherVatable += cost.amount
        else bucket.otherExempt += cost.amount
      }
    }
  }

  return { ...bucket, hasFraming, hasOther }
}

/** One option's subtotal in the current view, for a block or card header. */
export function optionTotal(artworks: BudgetArtwork[], vatMode: boolean): number {
  return bucketTotal(getOptionTotals(artworks), vatMode)
}

/**
 * One option's subtotal while a choice is still open: the lowest and highest
 * it could come to. Each open choice is added one alternative at a time, so
 * both ends are an alternative the client could really pick, never one
 * alternative's price on this work beside another's on that.
 */
export function optionSpan(artworks: BudgetArtwork[], vatMode: boolean): { min: number; max: number } {
  const base = optionTotal(artworks, vatMode)
  const perChoice = new Map<string, number[]>()
  for (const a of artworks.filter(x => x.visible)) {
    for (const line of a.choiceLines ?? []) {
      if (!line.open) continue
      const sums = perChoice.get(line.choiceId) ?? line.open.map(() => 0)
      line.open.forEach((c, i) => { sums[i] = (sums[i] ?? 0) + applyVat(c.amount, c.vatApplies, vatMode) })
      perChoice.set(line.choiceId, sums)
    }
  }
  let min = base, max = base
  for (const sums of perChoice.values()) {
    if (sums.length === 0) continue
    min += Math.min(...sums)
    max += Math.max(...sums)
  }
  return { min, max }
}

// ── Project-level totals (handles picked vs pending elevations) ───────────────

export interface ProjectTotals {
  /** The cheapest set of options the client could actually choose. */
  min: TotalsBucket
  /** The dearest. */
  max: TotalsBucket
  isRange: boolean
  hasFraming: boolean
  hasOther: boolean
}

/**
 * Project totals across picked and pending elevations.
 *
 * Where an elevation is still pending, the whole of its cheapest option goes
 * into `min` and the whole of its dearest into `max`. Each end is therefore a
 * combination the client could really buy.
 *
 * The previous version minimised every field on its own, so the best case
 * could pair one option's artwork prices with another option's framing, and
 * the artwork count that drove the installation tier need not have belonged to
 * either. See the tests named BUG in budgetCalc.test.ts for worked examples.
 */
export function computeProjectTotals(
  elevations: BudgetElevationData[],
  vatMode = false,
): ProjectTotals {
  let min = emptyBucket()
  let max = emptyBucket()
  let isRange = false
  let hasFraming = false
  let hasOther = false

  for (const elev of elevations) {
    if (elev.clientPickedOption) {
      const opt = elev.options.find(o => o.key === elev.clientPickedOption)
      if (!opt) {
        // A stored key with no matching option. Nothing can be added, so say
        // so by treating the project as a range rather than a firm figure.
        isRange = true
        continue
      }
      const t = getOptionTotals(opt.artworks)
      min = addBuckets(min, t)
      max = addBuckets(max, t)
      if (t.hasFraming) hasFraming = true
      if (t.hasOther) hasOther = true
      continue
    }

    isRange = true
    if (elev.options.length === 0) continue

    const totals = elev.options.map(o => getOptionTotals(o.artworks))
    let cheapest = totals[0]
    let dearest = totals[0]
    for (const t of totals) {
      if (bucketTotal(t, vatMode) < bucketTotal(cheapest, vatMode)) cheapest = t
      if (bucketTotal(t, vatMode) > bucketTotal(dearest, vatMode)) dearest = t
      if (t.hasFraming) hasFraming = true
      if (t.hasOther) hasOther = true
    }
    min = addBuckets(min, cheapest)
    max = addBuckets(max, dearest)
  }

  return { min, max, isRange, hasFraming, hasOther }
}

// ── Frozen-entry VAT display ──────────────────────────────────────────────────
// Confirmed installation, flat consultant fees, and custom line items store the
// literal value the consultant typed. `amountIncludesVat` records the view the
// value was entered in. This helper converts it into the current view only when
// VAT applies and the views differ.

export function displayFrozenAmount(
  stored: number,
  amountIncludesVat: boolean | undefined,
  vatApplies: boolean,
  viewWantsIncVat: boolean,
): number {
  if (!vatApplies) return Math.round(stored)
  const storedIsIncVat = !!amountIncludesVat
  if (storedIsIncVat === viewWantsIncVat) return Math.round(stored)
  return viewWantsIncVat ? Math.round(stored * 1.2) : Math.round(stored / 1.2)
}

// ── Consultant fee ─────────────────────────────────────────────────────────────

/** The fee line's name when the consultant hasn't given it one. */
export const DEFAULT_FEE_LABEL = 'Consultancy commission'

export function feeLabel(fee: BudgetConsultantFee | null): string {
  return fee?.label?.trim() || DEFAULT_FEE_LABEL
}

export function consultantFeeRange(
  fee: BudgetConsultantFee,
  artMin: number,
  artMax: number,
): { min: number; max: number } {
  if (fee.mode === 'flat') return { min: fee.amount, max: fee.amount }
  return {
    min: Math.round((fee.amount / 100) * artMin),
    max: Math.round((fee.amount / 100) * artMax),
  }
}

// ── Custom line items ──────────────────────────────────────────────────────────

/**
 * Project-level custom items in the current view.
 *
 * Each amount is frozen in the view it was typed in, so it has to be converted
 * one at a time. An earlier version added the raw stored figures, which put
 * ex-VAT and inc-VAT money in the same sum and produced a total that was right
 * in neither view. It was exported but never called; TotalsPanel had always
 * done this correctly inline.
 */
export function customItemsSubtotal(
  items: BudgetCustomLineItem[],
  isConsultant: boolean,
  vatMode: boolean,
): number {
  return items
    .filter(item => isConsultant || item.shownToClient)
    .reduce(
      (sum, item) => sum + displayFrozenAmount(
        item.amount, item.amountIncludesVat, item.vatApplies, vatMode,
      ),
      0,
    )
}
