'use client'

import { useEffect, useRef, useState } from 'react'

interface Props {
  /** The wall on screen, as the menu names it: "Living Room · Option B". */
  wallLabel: string
  /** False until the wall has a scale — a picture of it could not be sized. */
  canExportImage: boolean
  onExportImage: () => void
  onExportPack: () => void
}

/**
 * The header's one Export button. There are two things to take out of a
 * project — the whole proposal as a pack, or the wall on screen as a picture
 * — and they used to be two buttons in two places, both called "Export". One
 * button that asks is shorter than either label that would tell them apart.
 */
export default function ExportMenu({ wallLabel, canExportImage, onExportImage, onExportPack }: Props) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  // Closes on a press elsewhere, Escape or scroll — the same rules as the tab
  // strip's menus, and checked by target for the same reason (see TabBar).
  useEffect(() => {
    if (!at) return
    const close = () => setAt(null)
    const onPress = (e: MouseEvent) => {
      if (!(e.target instanceof Node)) return
      if (menuRef.current?.contains(e.target) || buttonRef.current?.contains(e.target)) return
      close()
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    document.addEventListener('mousedown', onPress)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('mousedown', onPress)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [at])

  return (
    <>
      <button
        ref={buttonRef}
        className="btn btn-sm"
        aria-haspopup="menu"
        aria-expanded={!!at}
        onClick={e => {
          if (at) { setAt(null); return }
          const r = e.currentTarget.getBoundingClientRect()
          // Right-aligned under the button: it sits near the window's edge.
          setAt({ x: window.innerWidth - r.right, y: r.bottom + 4 })
        }}
      >
        Export
      </button>
      {at && (
        <div
          ref={menuRef}
          className="studio-tab-menu export-menu"
          role="menu"
          style={{ right: at.x, top: at.y }}
        >
          <button role="menuitem" onClick={() => { setAt(null); onExportPack() }}>
            Proposal pack…
            <span className="export-menu-sub">Every elevation, the works and the budget</span>
          </button>
          <button
            role="menuitem"
            disabled={!canExportImage}
            onClick={() => { setAt(null); onExportImage() }}
          >
            This option as an image
            <span className="export-menu-sub">
              {canExportImage ? `${wallLabel} · PNG` : 'Set the wall’s scale first'}
            </span>
          </button>
        </div>
      )}
    </>
  )
}
