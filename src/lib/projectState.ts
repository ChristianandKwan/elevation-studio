/**
 * The rules for keeping the project page's copy of a project consistent.
 *
 * Pure: each takes the elevations and returns new ones, so the rules can be
 * tested without a browser or a database.
 */

interface PlacementShape { id: string; workId: string }
interface OptionShape { option: string; artworks: PlacementShape[] }
interface ElevationShape { id: string; elevation_options: OptionShape[] }

/**
 * A change to a work shows on every placement of it, on any option or
 * elevation: the name, the size and the money belong to the work.
 */
export function changeWork<E extends ElevationShape>(elevations: E[], workId: string, patch: object): E[] {
  return elevations.map(e => ({
    ...e,
    elevation_options: e.elevation_options.map(o => ({
      ...o,
      artworks: o.artworks.map(a => (a.workId === workId ? { ...a, ...patch } : a)),
    })),
  }))
}

/** A change to one option of one elevation: its note, its wall, its scale. */
export function changeOption<E extends ElevationShape>(
  elevations: E[], elevationId: string, optionKey: string, patch: object,
): E[] {
  return elevations.map(e => (e.id !== elevationId ? e : {
    ...e,
    elevation_options: e.elevation_options.map(o => (o.option !== optionKey ? o : { ...o, ...patch })),
  }))
}

/** What belongs to the work, wherever it hangs. */
const WORK_FIELDS = [
  'name', 'artist', 'wCm', 'hCm', 'price', 'note', 'noteShownToClient',
  'vatApplies', 'discountStatus', 'discountPercent', 'subLineItems',
] as const

/**
 * What belongs to this one hanging of it. The mount was missing from the
 * copy of this list that lived in the project page, so a mount set on one
 * option vanished from the wall on switching away and back.
 */
const PLACEMENT_FIELDS = [
  'xF', 'yF', 'visible', 'frameType', 'frameWidthMm',
  'mountColor', 'mountTopMm', 'mountRightMm', 'mountBottomMm', 'mountLeftMm',
  'brightness', 'fade', 'shadowAngle', 'shadowBlur', 'shadowOpacity',
] as const

function fieldsOf(from: object, keys: readonly string[]): Record<string, unknown> {
  const src = from as Record<string, unknown>
  return Object.fromEntries(keys.map(k => [k, src[k]]))
}

export interface OpenWall {
  elevationId: string
  optionKey: string
  /** The wall editor's placements on the open option, as edited. */
  artworks: PlacementShape[]
  /** The wall's own edits (cut-outs, perspective), or null while it is still loading. */
  wall: object | null
}

/**
 * Bring the wall editor's edits into the page's copy of the project.
 *
 * The wall editor holds the open option; the budget, the index and every other
 * option read the page's copy. Work details go to every placement of the work
 * and to the Index; where it hangs goes only to the open option.
 */
export function bringInOpenWall<E extends ElevationShape, W extends { id: string }>(
  elevations: E[], works: W[], open: OpenWall,
): { elevations: E[]; works: W[] } {
  const byWork = new Map(open.artworks.map(a => [a.workId, fieldsOf(a, WORK_FIELDS)]))
  const byPlacement = new Map(open.artworks.map(a => [a.id, a]))

  const nextElevations = elevations.map(e => ({
    ...e,
    elevation_options: e.elevation_options.map(o => {
      const isOpen = e.id === open.elevationId && o.option === open.optionKey
      return {
        ...o,
        ...(isOpen && open.wall ? open.wall : {}),
        artworks: o.artworks.map(a => {
          const edited = isOpen ? byPlacement.get(a.id) : undefined
          if (edited) return { ...a, ...fieldsOf(edited, WORK_FIELDS), ...fieldsOf(edited, PLACEMENT_FIELDS) }
          const work = byWork.get(a.workId)
          return work ? { ...a, ...work } : a
        }),
      }
    }),
  }))
  const nextWorks = works.map(w => {
    const work = byWork.get(w.id)
    return work ? { ...w, ...work } : w
  })
  return { elevations: nextElevations, works: nextWorks }
}

/**
 * Cut-outs belong to a photo, so an option's saved cut-outs go to every other
 * option on its elevation that shows the same photo.
 *
 * Found by the option that was saved, never by the one open: a save still
 * waiting when the consultant switched walls used to share its cut-outs onto
 * the wall they had switched to. Returns the siblings to write to as well.
 */
export function shareCutOuts<E extends { id: string; elevation_options: Array<{ id: string; imagePath?: string | null }> }>(
  elevations: E[], optionId: string, masks: unknown[],
): { elevations: E[]; siblingIds: string[] } {
  const value = masks.length > 0 ? masks : null
  const elev = elevations.find(e => e.elevation_options.some(o => o.id === optionId))
  const saved = elev?.elevation_options.find(o => o.id === optionId)
  if (!elev || !saved) return { elevations, siblingIds: [] }
  const siblingIds = saved.imagePath
    ? elev.elevation_options.filter(o => o.id !== optionId && o.imagePath === saved.imagePath).map(o => o.id)
    : []
  const touched = new Set([optionId, ...siblingIds])
  return {
    siblingIds,
    elevations: elevations.map(e => (e !== elev ? e : {
      ...e,
      elevation_options: e.elevation_options.map(o => (touched.has(o.id) ? { ...o, foreground_masks: value } : o)),
    })),
  }
}
