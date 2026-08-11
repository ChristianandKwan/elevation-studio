export function escHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function timeNow(): string {
  return new Date().toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

/**
 * How the practice is named in anything a client can read.
 *
 * The consultants share one login (info@), so the profile name attached to an
 * action is "info" — which is what the client portal's activity history was
 * showing them. The studio is single-tenant, so attributing consultant actions
 * to the practice is both accurate and what the client should see.
 *
 * Only affects entries written from here on; existing rows keep their text.
 */
export const PRACTICE_NAME = 'C&K'

/**
 * How long signed storage URLs handed to the studio stay valid.
 *
 * The studio is a single long-lived screen: a consultant opens a project in the
 * morning and works in it for hours without a page load. Signatures used to
 * last an hour, so past that point every wall photo and artwork the page was
 * loaded with started 403ing — switching options appeared to do nothing (the
 * canvas kept the last option that had loaded) and thumbnails went blank, while
 * anything uploaded in the last hour still worked. Twelve hours covers a
 * working day; `useStudio` re-signs on load failure for anything longer.
 *
 * The client portal signs its own URLs for 72 h — see `client/[token]/page.tsx`.
 */
export const STUDIO_SIGNED_URL_TTL = 60 * 60 * 12

/**
 * Image detail, measured in pixels per centimetre of real wall.
 *
 * The elevation photograph sets the pixel budget for everything: once it is
 * calibrated it delivers a fixed number of pixels per centimetre, and each
 * artwork gets its real-world share of that. So the question for an artwork is
 * never "is this file big enough" in the abstract — a 30 cm print and a 2 m
 * canvas want wildly different files — but "does this file carry at least as
 * much detail per centimetre as the wall it hangs on".
 *
 * An artwork below the wall's figure is the visible failure: it gets enlarged
 * to fill its box and reads as a soft rectangle in a sharp photograph. Above
 * it, the artwork can never be the weak link.
 */
export const ARTWORK_DETAIL_TOLERANCE = 0.8

/** Below this on the long edge, an elevation photo is soft however it is used. */
export const MIN_ELEVATION_LONG_EDGE = 2000

export interface ArtworkDetail {
  /** What the file carries, per cm of wall, at the size it is hung. */
  artworkPxPerCm: number
  /** What the wall photograph carries, per cm. */
  wallPxPerCm: number
  /** Pixels the file would need to match the wall. */
  neededPx: number
  /** The file's own pixel width. */
  filePx: number
  /** False when the artwork will be enlarged enough to show against the wall. */
  ok: boolean
}

/**
 * Compare an artwork file against the wall it will hang on. Returns null when
 * any input is missing — before calibration there is nothing to compare to.
 */
export function checkArtworkDetail(
  filePx: number | null | undefined,
  wCm: number | null | undefined,
  wallPxPerCm: number | null | undefined
): ArtworkDetail | null {
  if (!filePx || !wCm || !wallPxPerCm || wCm <= 0 || wallPxPerCm <= 0) return null
  const neededPx = Math.round(wCm * wallPxPerCm)
  return {
    artworkPxPerCm: filePx / wCm,
    wallPxPerCm,
    neededPx,
    filePx,
    ok: filePx >= neededPx * ARTWORK_DETAIL_TOLERANCE,
  }
}

export function formatApprovalTimestamp(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ampm = d.getHours() >= 12 ? 'pm' : 'am'
  const weekday = d.toLocaleDateString('en-GB', { weekday: 'long' })
  const month = d.toLocaleDateString('en-GB', { month: 'long' })
  const day = d.getDate()
  const suffix = ((): string => {
    if (day >= 11 && day <= 13) return 'th'
    switch (day % 10) {
      case 1: return 'st'
      case 2: return 'nd'
      case 3: return 'rd'
      default: return 'th'
    }
  })()
  return `${hh}:${mm} ${ampm} - ${weekday} ${day}${suffix} ${month} ${d.getFullYear()}`
}

export function framingLabel(v: string): string {
  return ({ framed: 'framed', requires_framing: 'requires framing' } as Record<string, string>)[v] ?? v
}

export function formatPrice(p: number): string {
  return '£' + p.toLocaleString('en-GB')
}

export function getInitials(name: string): string {
  return name.split(' ').map(w => w[0]).join('').toUpperCase()
}
