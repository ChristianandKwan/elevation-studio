'use client'

import { useEffect, useRef, useState } from 'react'

interface Props {
  onShare: () => void
  /** The wall on screen, as the menu names it: "Living Room · Option B". */
  wallLabel: string
  /** False until the wall has a scale — a picture of it could not be sized. */
  canExportImage: boolean
  onExportImage: () => void
  onExportPack: () => void
  onFeedback: () => void
}

/**
 * The header's "⋯": everything done to a project now and then, rather than
 * moved between. Sharing with the client happens about once per project,
 * exports now and again, feedback when something is wrong. The places —
 * Studio, Index, Notes, Budget, Proposals — stay in the header itself, whose
 * right-hand group is measured by hand (see studio.css). Create proposal
 * lives on the Proposals view, beside the proposals already made.
 */
export default function ProjectMenu({ onShare, wallLabel, canExportImage, onExportImage, onExportPack, onFeedback }: Props) {
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
        className={`studio-more${at ? ' open' : ''}`}
        title="Share, export and feedback"
        aria-label="Share, export and feedback"
        aria-haspopup="menu"
        aria-expanded={!!at}
        onClick={e => {
          if (at) { setAt(null); return }
          const r = e.currentTarget.getBoundingClientRect()
          // Right-aligned under the button: it sits near the window's edge.
          setAt({ x: window.innerWidth - r.right, y: r.bottom + 4 })
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="19" cy="12" r="1.7" />
        </svg>
      </button>
      {at && (
        <div
          ref={menuRef}
          className="studio-tab-menu export-menu"
          role="menu"
          style={{ right: at.x, top: at.y }}
        >
          <button role="menuitem" onClick={() => { setAt(null); onShare() }}>
            Share with the client…
            <span className="export-menu-sub">The client’s link, and a new one if it’s needed</span>
          </button>
          <div className="studio-tab-menu-sep" />
          <div className="export-menu-head">Export</div>
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
          <button role="menuitem" onClick={() => { setAt(null); onExportPack() }}>
            Proposal pack…
            <span className="export-menu-sub">Every elevation, the works and the budget</span>
          </button>
          <div className="studio-tab-menu-sep" />
          <button role="menuitem" onClick={() => { setAt(null); onFeedback() }}>
            Report a problem or an idea
            <span className="export-menu-sub">Sent with a picture of the screen</span>
          </button>
        </div>
      )}
    </>
  )
}
