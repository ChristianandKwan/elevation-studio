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
