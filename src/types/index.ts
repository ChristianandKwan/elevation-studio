export type ProjectStatus = 'draft' | 'sent' | 'approved'
export type OptionKey = 'A' | 'B'
export type FramingStatus = 'framed' | 'requires_framing'

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
  framingStatus: FramingStatus
  framingCost: number | null
  /** Optional frame: type and width in mm (requires scale to be set) */
  frameType?: string | null
  frameWidthMm?: number | null
  /** Per-artwork brightness effect via CSS filter (1.0 = unchanged) */
  brightness?: number | null
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
  imagePath: string | null
  imageUrl: string | null
  origW: number
  origH: number
  scalePxPerCm: number | null
  approved: boolean
  approvedAt: string | null
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
