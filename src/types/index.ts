export type ProjectStatus = 'draft' | 'sent' | 'approved'
/** Stored per-elevation key (A–Z). Identity only — the letter shown to people is derived from position, see src/lib/options.ts. */
export type OptionKey = string

/**
 * Where a discount stands with the gallery.
 *
 * `confirmed` is agreed and moves the money: the line shows the list price
 * struck through and every total uses the net figure.
 * `tbc` is expected but not settled. The percentage is shown so the client can
 * see what is being chased, but no total moves, because nothing is promised.
 * A consultant who doubts a discount will happen at all picks `none`.
 */
export type DiscountStatus = 'none' | 'confirmed' | 'tbc'

export type SubLineItemKind = 'framing' | 'duty' | 'shipping' | 'other'

/**
 * A cost that belongs to one artwork: framing, import duty, crating.
 *
 * It lives on the artwork rather than on the project so that it leaves with
 * the artwork. A project-level line for duty on works the client did not pick
 * would sit there being quietly wrong.
 */
export interface SubLineItem {
  id: string
  label: string
  kind: SubLineItemKind
  /** `fixed` uses `amount`; `percent` takes `percent` of the discounted price. */
  mode: 'fixed' | 'percent'
  /** Pounds, ex-VAT. Ignored when mode is `percent`. */
  amount: number
  /** 0–100, of the artwork's discounted price. Ignored when mode is `fixed`. */
  percent: number
  /** Duty and overseas shipping often carry none, even beside a VATable frame. */
  vatApplies: boolean
}

export interface Scale {
  origPxPerCm: number
  dispPxPerCm: number
}

export interface Artwork {
  id: string
  name: string
  /** data URL (in memory) or signed URL (from storage) */
  imageUrl: string | null
  /** Storage path, null if not yet persisted */
  imagePath: string | null
  wCm: number
  hCm: number
  /** Fractional position on elevation image (0-1) */
  xF: number
  yF: number
  visible: boolean
  price: number
  artist: string
  /** Free text against the line: gallery, availability, advice, caveats. */
  note: string
  /** Unticked keeps the note in the consultant's view only. */
  noteShownToClient: boolean
  /** False for works bought outside the UK. Defaults true. */
  vatApplies: boolean
  discountStatus: DiscountStatus
  /** 0–100. Null when no discount has been named. */
  discountPercent: number | null
  /** Framing, duty, crating: costs that belong to this work. */
  subLineItems: SubLineItem[]
  /** Optional frame: type and width in mm (requires scale to be set) */
  frameType?: string | null
  frameWidthMm?: number | null
  /** Per-artwork brightness effect via CSS filter (1.0 = unchanged) */
  brightness?: number | null
  /** Per-artwork fade: slider 0–1, rendered as up to 25 % opacity reduction so the wall shows through */
  fade?: number | null
  /** Drop shadow: angle in degrees (0 = sun at top, clockwise), blur radius in px, opacity 0–1 */
  shadowAngle?: number | null
  shadowBlur?: number | null
  shadowOpacity?: number | null
  /** Loaded Image element for canvas rendering */
  img?: HTMLImageElement | null
  /** Set to true when image failed to load (onerror or 10 s timeout) */
  loadFailed?: boolean
}

export interface ElevationOption {
  id: string
  option: OptionKey
  /** Position within the elevation; the only field that decides order */
  sortOrder: number
  imagePath: string | null
  imageUrl: string | null
  origW: number
  origH: number
  scalePxPerCm: number | null
  approved: boolean
  approvedAt: string | null
  /**
   * The consultant writing to the client. Distinct from `clientNotes`, which
   * runs the other way. This is where pair and set pricing gets explained,
   * since a rate agreed for two works belongs to the combination, not to
   * either work on its own.
   */
  consultantNote: string
  consultantNoteShownToClient: boolean
  artworks: Artwork[]
  foregroundMasks: ForegroundMasks | null
  /** Perspective correction corners (fractional 0-1 relative to display dimensions) */
  skewTL?: [number, number] | null
  skewTR?: [number, number] | null
  skewBR?: [number, number] | null
  skewBL?: [number, number] | null
  /** Whether perspective skew is applied to artwork overlays */
  skewActive?: boolean
}

export interface Elevation {
  id: string
  name: string
  displayOrder: number
  options: Record<OptionKey, ElevationOption>
}

export interface ActivityLog {
  id: string
  type: string
  text: string
  createdAt: string
}

export interface Project {
  id: string
  name: string
  clientName: string
  consultantId: string
  consultantName: string
  status: ProjectStatus
  createdAt: string
  elevations: Elevation[]
  activity: ActivityLog[]
  /** Optional client-stated budget (ex-VAT, £). null means no budget set. */
  clientBudget: number | null
  /** Thumbnail URL from first elevation option A */
  thumbnailUrl?: string | null
}

export interface Profile {
  id: string
  name: string
  initials: string
  role: string
}

/** The in-memory studio state (mirrors prototype STUDIO global) */
export interface StudioElev {
  imagePath: string
  imageUrl: string
  img: HTMLImageElement
  origW: number
  origH: number
  dispW: number
  dispH: number
}

export interface CalibState {
  active: boolean
  drawing: boolean
  start: { x: number; y: number } | null
  lineDispPx: number
}

export interface MaskPoint {
  x: number // fraction 0-1 of original image width
  y: number // fraction 0-1 of original image height
}

export type ForegroundMasks = MaskPoint[][]

// ─── Budget types ──────────────────────────────────────────────────────────────

export interface BudgetInstallation {
  indicative: boolean
  confirmedAmount: number | null
  /** Whether VAT applies in inc-VAT views. Indicative installation is always treated as VAT-applicable. */
  vatApplies?: boolean
  /** True if `confirmedAmount` was entered in the inc-VAT view (value is frozen in that mode). */
  amountIncludesVat?: boolean
  /** Show the installation line (and any confirmed amount) to the client. Defaults to true. */
  shownToClient?: boolean
}

export interface BudgetConsultantFee {
  mode: 'flat' | 'percentage'
  /** £ when flat; percentage as a number (e.g. 15 = 15%) when percentage. */
  amount: number
  shownToClient: boolean
  /** Whether VAT applies to the consultant fee. Defaults to true. */
  vatApplies?: boolean
  /** For flat fees: true if the amount was entered in the inc-VAT view (value is frozen in that mode). Ignored for percentage. */
  amountIncludesVat?: boolean
}

export interface BudgetCustomLineItem {
  id: string
  name: string
  amount: number
  /** Default true on creation */
  vatApplies: boolean
  /** Default true on creation */
  shownToClient: boolean
  /** True if `amount` was entered in the inc-VAT view (value is frozen in that mode). */
  amountIncludesVat?: boolean
}

export interface ProjectBudget {
  id: string
  projectId: string
  installation: BudgetInstallation
  consultantFee: BudgetConsultantFee | null
  customLineItems: BudgetCustomLineItem[]
  /** Consultant-set VAT default for the client view */
  vatIncludedDefault: boolean
  createdAt: string
  updatedAt: string
}

export interface MaskDrawState {
  active: boolean
  currentPoints: MaskPoint[]
}
