/**
 * What a wall save writes.
 *
 * A save writes only what differs from what the database last saw: moving
 * one work writes that one placement, not the whole wall. "What the database
 * last saw" is kept per option. It used to be one record for whichever wall
 * was open, so a save still waiting when the consultant switched walls was
 * compared against the new wall's record — and its cut-outs were then shared
 * onto the new wall's options.
 */
import { placementRow, workRow } from './works.ts'
import type { Artwork } from '@/types'

/** The writes a wall save can make. Each throws if the database refuses. */
export interface WallDb {
  saveMasks: (optionId: string, masks: unknown[] | null) => Promise<void>
  savePlacement: (placementId: string, row: ReturnType<typeof placementRow>) => Promise<void>
  saveWork: (workId: string, row: ReturnType<typeof workRow>) => Promise<void>
}

/** The parts of a wall that are saved: its cut-outs and its placements. */
export interface WallContent {
  masks: unknown[]
  artworks: Artwork[]
}

interface Snapshot {
  masks: string
  placements: Map<string, string>
  works: Map<string, string>
}

function snapshotOf({ masks, artworks }: WallContent): Snapshot {
  return {
    masks: JSON.stringify(masks.length > 0 ? masks : null),
    placements: new Map(artworks.map(a => [a.id, JSON.stringify(placementRow(a))])),
    works: new Map(artworks.map(a => [a.workId, JSON.stringify(workRow(a))])),
  }
}

export function createWallSaves({ db, onMasksSaved }: {
  db: WallDb
  /** The cut-outs of this option were written; its sibling options share them. */
  onMasksSaved?: (optionId: string, masks: unknown[]) => void
}) {
  const saved = new Map<string, Snapshot>()

  return {
    /** What the database holds for this option, as it has just been loaded. */
    remember(optionId: string, content: WallContent) {
      saved.set(optionId, snapshotOf(content))
    },

    /**
     * One placement was written elsewhere (the budget or the index saved its
     * work). Only that one is marked: another placement may have an unsaved
     * drag waiting, and marking the whole wall would drop it.
     */
    markSaved(optionId: string, artwork: Artwork) {
      const was = saved.get(optionId)
      if (!was) return
      was.placements.set(artwork.id, JSON.stringify(placementRow(artwork)))
      was.works.set(artwork.workId, JSON.stringify(workRow(artwork)))
    },

    /**
     * Write what changed on this option since it was last saved or loaded.
     * Resolves to whether anything was written, so the caller knows whether
     * the wall's picture needs rendering again.
     */
    async write(optionId: string, content: WallContent): Promise<boolean> {
      const was = saved.get(optionId) ?? snapshotOf({ masks: [], artworks: [] })
      const now = snapshotOf(content)
      let wrote = false

      if (now.masks !== was.masks) {
        await db.saveMasks(optionId, content.masks.length > 0 ? content.masks : null)
        was.masks = now.masks
        wrote = true
        onMasksSaved?.(optionId, content.masks)
      }

      const placements = content.artworks.filter(a => was.placements.get(a.id) !== now.placements.get(a.id))
      const works = content.artworks.filter(a => was.works.get(a.workId) !== now.works.get(a.workId))
      await Promise.all([
        ...placements.map(a => db.savePlacement(a.id, placementRow(a))),
        ...works.map(a => db.saveWork(a.workId, workRow(a))),
      ])
      placements.forEach(a => was.placements.set(a.id, now.placements.get(a.id)!))
      works.forEach(a => was.works.set(a.workId, now.works.get(a.workId)!))
      saved.set(optionId, was)
      return wrote || placements.length > 0 || works.length > 0
    },
  }
}
