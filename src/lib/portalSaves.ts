/**
 * What the client portal saves while the client arranges a wall: showing or
 * hiding a work, and moving works about.
 *
 * Both go through the shared saver (src/lib/saver.ts): a burst of changes is
 * one request once the client pauses, in order, and sent when the page closes.
 */
import { createSaver } from './saver.ts'

export const VISIBILITY_SAVE_DELAY_MS = 500
export const POSITION_SAVE_DELAY_MS = 600

interface PortalArtwork { id: string; xF: number; yF: number; visible: boolean }

export interface PortalSavesOptions {
  /** One request to the portal's server action. Throws if it fails. */
  send: (action: 'toggle_visibility' | 'move_artworks', payload: Record<string, unknown>) => Promise<void>
  /** The works on one option as the client sees them now. */
  artworksOn: (elevId: string, opt: string) => PortalArtwork[]
  /** A show/hide did not save: put the work back as the server has it. */
  showAgain: (elevId: string, opt: string, artId: string, visible: boolean) => void
  /** Say something to the client. */
  tell: (message: string) => void
}

export function createPortalSaves({ send, artworksOn, showAgain, tell }: PortalSavesOptions) {
  /** What the server had before the current burst of clicks, per work. */
  const beforeBurst = new Map<string, boolean>()

  const visibility = createSaver<{ elevId: string; opt: string }>({
    delayMs: VISIBILITY_SAVE_DELAY_MS,
    write: async (artId, { elevId, opt }) => {
      const baseline = beforeBurst.get(artId)
      beforeBurst.delete(artId)
      const art = artworksOn(elevId, opt).find(a => a.id === artId)
      // Clicked an even number of times: the server is already right.
      if (!art || baseline === art.visible) return
      try {
        await send('toggle_visibility', { artworkId: artId, visible: art.visible })
      } catch {
        if (baseline !== undefined) showAgain(elevId, opt, artId, baseline)
        tell('Failed to update visibility. Please try again.')
      }
    },
  })

  // Keyed by option: there used to be one timer for every option, so moving
  // works on one option and then another within the pause sent only the second.
  const positions = createSaver<{ elevId: string; opt: string }>({
    delayMs: POSITION_SAVE_DELAY_MS,
    write: async (_key, { elevId, opt }) => {
      try {
        await sendPositions(elevId, opt)
      } catch (err) {
        // Low-stakes: the screen already shows what the client wants, and a
        // pick or an approval sends the arrangement again before it locks.
        console.warn('move_artworks failed:', err)
      }
    },
  })

  async function sendPositions(elevId: string, opt: string) {
    const artworks = artworksOn(elevId, opt)
    if (artworks.length === 0) return
    await send('move_artworks', { artworks: artworks.map(a => ({ id: a.id, xF: a.xF, yF: a.yF })) })
  }

  return {
    /** The client finished dragging on this option. */
    moved(elevId: string, opt: string) {
      positions.save(`${elevId}\u0000${opt}`, { elevId, opt })
    },
    /**
     * Before a pick or an approval locks the wall: send the arrangement on
     * screen now, after anything already on its way. Throws if it fails, so
     * the pick or approval can say so rather than lock an unsaved layout.
     */
    async sendPositionsNow(elevId: string, opt: string) {
      await positions.flushAll()
      await sendPositions(elevId, opt)
    },
    /** The client clicked a work's eye. `wasVisible` is before the click. */
    toggled(elevId: string, opt: string, artId: string, wasVisible: boolean) {
      if (!beforeBurst.has(artId)) beforeBurst.set(artId, wasVisible)
      visibility.save(artId, { elevId, opt })
    },
    /** Write everything waiting now. */
    async flushAll() {
      await Promise.all([visibility.flushAll(), positions.flushAll()])
    },
    dispose() {
      void visibility.dispose()
      void positions.dispose()
    },
  }
}

export type PortalSaves = ReturnType<typeof createPortalSaves>
