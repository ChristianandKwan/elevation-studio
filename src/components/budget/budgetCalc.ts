import type { BudgetInstallation, BudgetConsultantFee, BudgetCustomLineItem } from '@/types'

// ── Types used across budget components ───────────────────────────────────────

export interface BudgetArtwork {
  id: string
  name: string
  artist: string
  wCm: number
  hCm: number
  price: number
  framingStatus: 'framed' | 'requires_framing'
  framingCost: number | null
  visible: boolean
}

export interface BudgetOptionData {
  key: string
  artworks: BudgetArtwork[]
}

export interface BudgetElevationData {
  id: string
  name: string
  clientPickedOption: string | null
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

export function installRange(count: number): { min: number; max: number } {
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
): InstallCostDisplay {
  if (!installation.indicative && installation.confirmedAmount != null) {
    const v = installation.confirmedAmount
    return { min: v, max: v, isIndicative: false }
  }
  const rMin = installRange(artCountMin)
  const rMax = installRange(artCountMax)
  return {
    min: Math.min(rMin.min, rMax.min),
    max: Math.max(rMin.max, rMax.max),
    isIndicative: true,
  }
}

// ── Option-level totals ────────────────────────────────────────────────────────

export interface OptionTotals {
  artworks: number
  framing: number
  artCount: number
  hasFraming: boolean
}

export function getOptionTotals(artworks: BudgetArtwork[]): OptionTotals {
  const visible = artworks.filter(a => a.visible)
  let art = 0, framing = 0, hasFraming = false
  for (const a of visible) {
    art += a.price
    if (a.framingStatus === 'requires_framing' && a.framingCost != null) {
      framing += a.framingCost
      hasFraming = true
    }
  }
  return { artworks: art, framing, artCount: visible.length, hasFraming }
}

// ── Project-level totals (handles picked vs pending elevations) ───────────────

export interface ProjectTotals {
  artMin: number
  artMax: number
  framingMin: number
  framingMax: number
  artCountMin: number
  artCountMax: number
  isRange: boolean
  hasFraming: boolean
}

export function computeProjectTotals(elevations: BudgetElevationData[]): ProjectTotals {
  let artMin = 0, artMax = 0
  let framingMin = 0, framingMax = 0
  let countMin = 0, countMax = 0
  let isRange = false
  let hasFraming = false

  for (const elev of elevations) {
    if (elev.clientPickedOption) {
      const opt = elev.options.find(o => o.key === elev.clientPickedOption)
      if (opt) {
        const t = getOptionTotals(opt.artworks)
        artMin += t.artworks; artMax += t.artworks
        framingMin += t.framing; framingMax += t.framing
        countMin += t.artCount; countMax += t.artCount
        if (t.hasFraming) hasFraming = true
      }
    } else {
      isRange = true
      const all = elev.options.map(o => getOptionTotals(o.artworks))
      if (all.length === 0) continue
      artMin += Math.min(...all.map(t => t.artworks))
      artMax += Math.max(...all.map(t => t.artworks))
      framingMin += Math.min(...all.map(t => t.framing))
      framingMax += Math.max(...all.map(t => t.framing))
      countMin += Math.min(...all.map(t => t.artCount))
      countMax += Math.max(...all.map(t => t.artCount))
      if (all.some(t => t.hasFraming)) hasFraming = true
    }
  }

  return { artMin, artMax, framingMin, framingMax, artCountMin: countMin, artCountMax: countMax, isRange, hasFraming }
}

// ── Consultant fee ─────────────────────────────────────────────────────────────

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

export function customItemsSubtotal(items: BudgetCustomLineItem[], isConsultant: boolean): number {
  return items
    .filter(item => isConsultant || item.shownToClient)
    .reduce((sum, item) => sum + item.amount, 0)
}
