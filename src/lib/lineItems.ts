import type { DiscountStatus, SubLineItem, SubLineItemKind } from '@/types'

/**
 * Reading the line-item columns added by migration 024 off a database row.
 *
 * Both page loaders go through here so the two cannot drift, and every value
 * is defended: the columns have defaults, but a row read before the migration
 * ran, or a jsonb array edited by hand, must not take a budget down.
 */

const KINDS: SubLineItemKind[] = ['framing', 'duty', 'shipping', 'other']
const STATUSES: DiscountStatus[] = ['none', 'confirmed', 'tbc']

function num(v: unknown, fallback: number): number {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback
}

export function parseSubLineItems(raw: unknown): SubLineItem[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((entry, i): SubLineItem[] => {
    if (!entry || typeof entry !== 'object') return []
    const e = entry as Record<string, unknown>
    const kind = KINDS.includes(e.kind as SubLineItemKind)
      ? (e.kind as SubLineItemKind)
      : 'other'
    return [{
      id: typeof e.id === 'string' && e.id ? e.id : `sub-${i}`,
      label: typeof e.label === 'string' ? e.label : '',
      kind,
      mode: e.mode === 'percent' ? 'percent' : 'fixed',
      amount: num(e.amount, 0),
      percent: num(e.percent, 0),
      // Only an explicit false turns VAT off, so a malformed entry is taxed
      // rather than quietly cheaper than it should be.
      vatApplies: e.vatApplies !== false,
    }]
  })
}

export function parseDiscountStatus(raw: unknown): DiscountStatus {
  return STATUSES.includes(raw as DiscountStatus) ? (raw as DiscountStatus) : 'none'
}

export function parseDiscountPercent(raw: unknown): number | null {
  if (raw == null) return null
  const n = num(raw, NaN)
  if (!Number.isFinite(n) || n < 0 || n > 100) return null
  return n
}

/** The line-item fields for one artwork row, ready to spread onto an Artwork. */
export function readLineItemFields(row: Record<string, unknown>) {
  return {
    note: typeof row.note === 'string' ? row.note : '',
    noteShownToClient: row.note_shown_to_client !== false,
    vatApplies: row.vat_applies !== false,
    discountStatus: parseDiscountStatus(row.discount_status),
    discountPercent: parseDiscountPercent(row.discount_percent),
    subLineItems: parseSubLineItems(row.sub_line_items),
  }
}

/** The consultant's note fields for one elevation_options row. */
export function readOptionNoteFields(row: Record<string, unknown>) {
  return {
    consultantNote: typeof row.consultant_note === 'string' ? row.consultant_note : '',
    consultantNoteShownToClient: row.consultant_note_shown_to_client !== false,
  }
}

/** The columns those fields write back to. */
export const ARTWORK_LINE_ITEM_COLUMNS =
  'note, note_shown_to_client, vat_applies, discount_status, discount_percent, sub_line_items'

export const OPTION_NOTE_COLUMNS =
  'consultant_note, consultant_note_shown_to_client'

/** The framing sub item on an artwork, if it has one. */
export function framingItem(subLineItems: SubLineItem[]): SubLineItem | undefined {
  return subLineItems.find(i => i.kind === 'framing')
}

/** What framing costs on this artwork, ex-VAT. Null when none is set. */
export function framingCostOf(subLineItems: SubLineItem[]): number | null {
  const item = framingItem(subLineItems)
  if (!item || item.mode !== 'fixed') return null
  return item.amount || null
}

/** A fresh sub item of the given kind, with sensible defaults for that kind. */
export function newSubLineItem(kind: SubLineItemKind): SubLineItem {
  const base = { id: crypto.randomUUID(), kind, amount: 0, percent: 0 }
  switch (kind) {
    case 'framing':
      return { ...base, label: 'Framing', mode: 'fixed', vatApplies: true }
    case 'duty':
      // Duty on an overseas purchase is a percentage and carries no VAT.
      return { ...base, label: 'Import duty', mode: 'percent', percent: 5, vatApplies: false }
    case 'shipping':
      return { ...base, label: 'Shipping', mode: 'fixed', vatApplies: true }
    default:
      return { ...base, label: '', mode: 'fixed', vatApplies: true }
  }
}
