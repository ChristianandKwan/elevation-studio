'use client'

import { ArcSpinner } from './Spinner'

/**
 * The arc spinner at the size asked for, where it is put.
 *
 * ArcSpinner is an overlay: it fills and centres itself in its nearest
 * positioned ancestor. Placed in a line of text with none nearby it spread
 * over the whole window and sat mid-screen, over the proposal's cover (Tom).
 * The studio's own inline uses wrap it by hand in a positioned box; this is
 * that box.
 */
export function InlineSpinner({ size }: { size: number }) {
  return (
    <span style={{ position: 'relative', display: 'inline-block', width: size + 2, height: size + 2, verticalAlign: 'middle', flexShrink: 0 }}>
      <ArcSpinner size={size} />
    </span>
  )
}
