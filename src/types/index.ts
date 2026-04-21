export type ProjectStatus = 'draft' | 'sent' | 'approved'
export type OptionKey = 'A' | 'B'
export type PriceIncludes = 'artwork' | 'all'

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
  priceIncludes: PriceIncludes
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
  zoom: number
  approved: boolean
  approvedAt: string | null
  artworks: Artwork[]
  foregroundMasks: ForegroundMasks | null
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

export interface MaskDrawState {
  active: boolean
  currentPoints: MaskPoint[]
}
