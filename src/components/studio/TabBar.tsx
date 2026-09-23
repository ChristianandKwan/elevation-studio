'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { optionTagClass, OPTION_NAME_MAX } from '@/lib/options'

interface ElevationTab {
  id: string
  name: string
  /** False while the consultant is still working on it: the client can't see it or its prices. */
  visibleToClient: boolean
  /**
   * `key` is the stored identity. `letter` is the position letter, `name` the
   * consultant's optional name, `label` / `title` whichever of those applies
   * (tab text / sentence form). See src/lib/options.ts.
   */
  options: Array<{ key: string; letter: string; label: string; title: string; name: string | null; hasArtworks: boolean; hasClientNotes: boolean }>
}

interface Props {
  elevations: ElevationTab[]
  activeElevId: string
  activeOption: string
  onSwitch: (elevId: string, option: string) => void
  onAddElevation: (name: string) => void
  onRenameElevation: (elevId: string, newName: string) => void
  onDeleteElevation: (elevId: string) => void
  onSetVisibleToClient: (elevId: string, visible: boolean) => void
  onAddOption: (elevId: string) => void
  onDeleteOption: (elevId: string, optKey: string) => void
  /** New left-to-right order of option keys for one elevation. Saved in one batched write. */
  onReorderOptions: (elevId: string, orderedKeys: string[]) => void
  /** Name (or clear, with '') one option. */
  onRenameOption: (elevId: string, optKey: string, name: string) => void
  /** Move an elevation one place left (-1) or right (+1). */
  onMoveElevation: (elevId: string, delta: number) => void
}

export default function TabBar({
  elevations, activeElevId, activeOption, onSwitch,
  onAddElevation, onRenameElevation, onDeleteElevation, onSetVisibleToClient,
  onAddOption, onDeleteOption, onReorderOptions, onRenameOption, onMoveElevation,
}: Props) {
  const barRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const checkScroll = useCallback(() => {
    const el = barRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 0)
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
  }, [])

  useEffect(() => {
    const el = barRef.current
    if (!el) return
    checkScroll()
    el.addEventListener('scroll', checkScroll, { passive: true })
    const ro = new ResizeObserver(checkScroll)
    ro.observe(el)
    return () => { el.removeEventListener('scroll', checkScroll); ro.disconnect() }
  }, [checkScroll])

  const [showAddModal, setShowAddModal] = useState(false)
  const [newName, setNewName] = useState('')
  const [renameElevId, setRenameElevId] = useState<string | null>(null)
  const [renameName, setRenameName] = useState('')
  const [confirmDeleteElevId, setConfirmDeleteElevId] = useState<string | null>(null)
  const [confirmDeleteOpt, setConfirmDeleteOpt] = useState<{ elevId: string; optKey: string; title: string; hasArtworks: boolean } | null>(null)
  const [renameOpt, setRenameOpt] = useState<{ elevId: string; key: string; title: string } | null>(null)
  const [renameOptName, setRenameOptName] = useState('')

  function openRenameOption(elevId: string, key: string, title: string, name: string | null) {
    setRenameOpt({ elevId, key, title })
    setRenameOptName(name ?? '')
  }

  function handleRenameOption() {
    if (!renameOpt) return
    onRenameOption(renameOpt.elevId, renameOpt.key, renameOptName)
    setRenameOpt(null)
  }

  // ── Reordering ────────────────────────────────────────────────
  // Tabs can be dragged within their elevation. Because letters are worked
  // out from position, moving a tab re-letters the strip on the spot.
  // Fallbacks for people who can't (or don't want to) drag: right-click a
  // tab for "Move left / Move right", or focus it and press Alt+←/→.
  const [dragging, setDragging] = useState<{ elevId: string; key: string } | null>(null)
  const [dropTarget, setDropTarget] = useState<{ elevId: string; key: string; side: 'before' | 'after' } | null>(null)
  const [menu, setMenu] = useState<{ elevId: string; key: string; title: string; name: string | null; hasArtworks: boolean; x: number; y: number } | null>(null)
  const [elevMenu, setElevMenu] = useState<{ elevId: string; x: number; y: number } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  function moveOption(elevId: string, key: string, delta: number) {
    const elev = elevations.find(e => e.id === elevId)
    if (!elev) return
    const keys = elev.options.map(o => o.key)
    const from = keys.indexOf(key)
    const to = from + delta
    if (from < 0 || to < 0 || to >= keys.length) return
    keys.splice(from, 1)
    keys.splice(to, 0, key)
    onReorderOptions(elevId, keys)
  }

  function dropOption(elevId: string, key: string, targetKey: string, side: 'before' | 'after') {
    const elev = elevations.find(e => e.id === elevId)
    if (!elev || key === targetKey) return
    const keys = elev.options.map(o => o.key).filter(k => k !== key)
    const at = keys.indexOf(targetKey) + (side === 'after' ? 1 : 0)
    keys.splice(at, 0, key)
    if (keys.every((k, i) => k === elev.options[i]?.key)) return
    onReorderOptions(elevId, keys)
  }

  function sideOf(e: React.DragEvent<HTMLElement>): 'before' | 'after' {
    const r = e.currentTarget.getBoundingClientRect()
    return e.clientX < r.left + r.width / 2 ? 'before' : 'after'
  }

  // The context menu closes on any mouse press elsewhere, on Escape, or on scroll.
  // Presses inside the menu are exempted by checking the target, not by
  // stopPropagation: Next.js mounts React on the document, so a React
  // handler's stopPropagation cannot stop a native listener on that same
  // document, and the menu would unmount before the item's click arrived.
  useEffect(() => {
    if (!menu && !elevMenu) return
    const close = () => { setMenu(null); setElevMenu(null) }
    const onPress = (e: MouseEvent) => {
      if (menuRef.current && e.target instanceof Node && menuRef.current.contains(e.target)) return
      close()
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    document.addEventListener('mousedown', onPress)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', close, true)
    return () => {
      document.removeEventListener('mousedown', onPress)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', close, true)
    }
  }, [menu, elevMenu])

  function handleAdd() {
    const name = newName.trim() || 'New Elevation'
    onAddElevation(name)
    setNewName('')
    setShowAddModal(false)
  }

  function openRename(elev: ElevationTab) {
    setRenameElevId(elev.id)
    setRenameName(elev.name)
  }

  function handleRename() {
    if (!renameElevId || !renameName.trim()) return
    onRenameElevation(renameElevId, renameName.trim())
    setRenameElevId(null)
  }

  return (
    <>
      <div className="studio-tab-bar" ref={barRef}>
        <div className={`studio-tab-bar-fade studio-tab-bar-fade--left${canScrollLeft ? ' visible' : ''}`} />
        <div className={`studio-tab-bar-fade studio-tab-bar-fade--right${canScrollRight ? ' visible' : ''}`} />
        {elevations.map((elev, i) => {
          const multiOption = elev.options.length > 1
          // Faded italic tabs alone are easy to miss, so the first tab of a
          // hidden elevation also carries a crossed-out eye.
          const hiddenMark = !elev.visibleToClient && (
            <span className="studio-tab-hidden-mark" title="Hidden from client · not in their budget" aria-label="Hidden from client">
              <EyeOffIcon />
            </span>
          )
          return (
            <div key={elev.id} className={`studio-tab-group${elev.visibleToClient ? '' : ' studio-tab-group--hidden'}`}>
              {i > 0 && <div className="studio-tab-divider" />}

              {multiOption ? (
                // Multiple options: render a tab per option
                elev.options.map((opt, optIndex) => {
                  const isActive = activeElevId === elev.id && activeOption === opt.key
                  const isDragging = dragging?.elevId === elev.id && dragging.key === opt.key
                  const dropSide = dropTarget?.elevId === elev.id && dropTarget.key === opt.key ? dropTarget.side : null
                  const classes = ['studio-tab', isActive && 'active', isDragging && 'dragging', dropSide && `drop-${dropSide}`]
                  return (
                    <button
                      key={opt.key}
                      className={classes.filter(Boolean).join(' ')}
                      onClick={() => onSwitch(elev.id, opt.key)}
                      title="Drag to reorder · double-click to rename · right-click for more"
                      aria-label={`${opt.title}, ${elev.name}, position ${optIndex + 1} of ${elev.options.length}. Alt+arrow keys to move.`}
                      onDoubleClick={() => openRenameOption(elev.id, opt.key, opt.title, opt.name)}
                      draggable
                      onDragStart={e => {
                        e.dataTransfer.effectAllowed = 'move'
                        e.dataTransfer.setData('text/plain', opt.key)
                        setDragging({ elevId: elev.id, key: opt.key })
                      }}
                      onDragEnd={() => { setDragging(null); setDropTarget(null) }}
                      onDragOver={e => {
                        // Only within the same elevation — options belong to their wall.
                        if (!dragging || dragging.elevId !== elev.id) return
                        e.preventDefault()
                        e.dataTransfer.dropEffect = 'move'
                        const side = sideOf(e)
                        if (dropTarget?.key !== opt.key || dropTarget.side !== side) {
                          setDropTarget({ elevId: elev.id, key: opt.key, side })
                        }
                      }}
                      onDragLeave={() => {
                        if (dropTarget?.key === opt.key) setDropTarget(null)
                      }}
                      onDrop={e => {
                        if (!dragging || dragging.elevId !== elev.id) return
                        e.preventDefault()
                        dropOption(elev.id, dragging.key, opt.key, sideOf(e))
                        setDragging(null)
                        setDropTarget(null)
                      }}
                      onContextMenu={e => {
                        e.preventDefault()
                        setElevMenu(null)
                        setMenu({ elevId: elev.id, key: opt.key, title: opt.title, name: opt.name, hasArtworks: opt.hasArtworks, x: e.clientX, y: e.clientY })
                      }}
                      onKeyDown={e => {
                        if (!e.altKey) return
                        if (e.key === 'ArrowLeft') { e.preventDefault(); moveOption(elev.id, opt.key, -1) }
                        if (e.key === 'ArrowRight') { e.preventDefault(); moveOption(elev.id, opt.key, 1) }
                      }}
                    >
                      {optIndex === 0 && hiddenMark}
                      {/* A named option shows its name; an unnamed one its letter badge and the wall it belongs to */}
                      {opt.name
                        ? opt.name
                        : <><span className={optionTagClass(opt.letter)} style={{ marginRight: 5 }}>{opt.letter}</span>{elev.name}</>}
                      {opt.hasClientNotes && !isActive && (
                        <span className="studio-tab-notes-dot" title="Client has left notes on this option" aria-label="Has client notes" />
                      )}
                      {elev.options.length > 1 && (
                        <span
                          className="studio-tab-del-opt"
                          title={`Remove ${opt.title}`}
                          onClick={e => {
                            e.stopPropagation()
                            setConfirmDeleteOpt({ elevId: elev.id, optKey: opt.key, title: opt.title, hasArtworks: opt.hasArtworks })
                          }}
                        >
                          ×
                        </span>
                      )}
                    </button>
                  )
                })
              ) : (
                // Single option: just elevation name, no letter badge
                (() => {
                  const onlyOpt = elev.options[0]
                  const isActive = activeElevId === elev.id
                  return (
                    <button
                      className={`studio-tab${isActive ? ' active' : ''}`}
                      onClick={() => onSwitch(elev.id, onlyOpt?.key ?? 'A')}
                    >
                      {hiddenMark}
                      {elev.name}
                      {onlyOpt?.hasClientNotes && !isActive && (
                        <span className="studio-tab-notes-dot" title="Client has left notes on this elevation" aria-label="Has client notes" />
                      )}
                    </button>
                  )
                })()
              )}

              {/* Everything you can do to the elevation lives behind one "more" button,
                  so the strip has no hover-only gap waiting for icons to appear. */}
              <button
                className={`studio-tab-more${elevMenu?.elevId === elev.id ? ' open' : ''}`}
                title="Elevation options"
                aria-label={`Options for ${elev.name}`}
                aria-haspopup="menu"
                aria-expanded={elevMenu?.elevId === elev.id}
                onClick={e => {
                  if (elevMenu?.elevId === elev.id) { setElevMenu(null); return }
                  const r = e.currentTarget.getBoundingClientRect()
                  setMenu(null)
                  setElevMenu({ elevId: elev.id, x: r.left, y: r.bottom + 4 })
                }}
              >
                <MoreIcon />
              </button>
            </div>
          )
        })}
        <button className="studio-tab-add" onClick={() => setShowAddModal(true)}>
          + Add Elevation
        </button>
      </div>

      {/* Elevation menu: add option, rename, client visibility, delete */}
      {elevMenu && (() => {
        const elevIndex = elevations.findIndex(e => e.id === elevMenu.elevId)
        const elev = elevations[elevIndex]
        if (!elev) return null
        return (
          <div
            ref={menuRef}
            className="studio-tab-menu"
            role="menu"
            style={{ left: elevMenu.x, top: elevMenu.y }}
          >
            {/* First, so the one hint that an elevation can hold several options is the first thing seen. */}
            <button role="menuitem" onClick={() => { onAddOption(elev.id); setElevMenu(null) }}>
              <PlusIcon /> Add option
            </button>
            <button role="menuitem" onClick={() => { openRename(elev); setElevMenu(null) }}>
              <PencilIcon /> Rename elevation…
            </button>
            <button role="menuitem" onClick={() => { onSetVisibleToClient(elev.id, !elev.visibleToClient); setElevMenu(null) }}>
              {elev.visibleToClient
                ? <><EyeOffIcon /> Hide from client</>
                : <><EyeIcon /> Show to client</>}
            </button>
            {elevations.length > 1 && (
              <>
                <div className="studio-tab-menu-sep" />
                <button role="menuitem" disabled={elevIndex <= 0} onClick={() => { onMoveElevation(elev.id, -1); setElevMenu(null) }}>
                  ← Move left
                </button>
                <button role="menuitem" disabled={elevIndex >= elevations.length - 1} onClick={() => { onMoveElevation(elev.id, 1); setElevMenu(null) }}>
                  Move right →
                </button>
                <div className="studio-tab-menu-sep" />
                <button role="menuitem" className="danger" onClick={() => { setConfirmDeleteElevId(elev.id); setElevMenu(null) }}>
                  <TrashIcon /> Delete elevation…
                </button>
              </>
            )}
          </div>
        )
      })()}

      {/* Option context menu: reorder without dragging, or remove */}
      {menu && (() => {
        const count = elevations.find(e => e.id === menu.elevId)?.options.length ?? 0
        const index = elevations.find(e => e.id === menu.elevId)?.options.findIndex(o => o.key === menu.key) ?? -1
        return (
          <div
            ref={menuRef}
            className="studio-tab-menu"
            role="menu"
            style={{ left: menu.x, top: menu.y }}
          >
            <button role="menuitem" onClick={() => { openRenameOption(menu.elevId, menu.key, menu.title, menu.name); setMenu(null) }}>
              Rename option…
            </button>
            <div className="studio-tab-menu-sep" />
            <button role="menuitem" disabled={index <= 0} onClick={() => { moveOption(menu.elevId, menu.key, -1); setMenu(null) }}>
              ← Move left
            </button>
            <button role="menuitem" disabled={index < 0 || index >= count - 1} onClick={() => { moveOption(menu.elevId, menu.key, 1); setMenu(null) }}>
              Move right →
            </button>
            <div className="studio-tab-menu-sep" />
            <button role="menuitem" className="danger" disabled={count <= 1} onClick={() => {
              setConfirmDeleteOpt({ elevId: menu.elevId, optKey: menu.key, title: menu.title, hasArtworks: menu.hasArtworks })
              setMenu(null)
            }}>
              Remove {menu.title}…
            </button>
          </div>
        )
      })()}

      {/* Add Elevation modal */}
      {showAddModal && (
        <div className="modal-bg open" onClick={e => { if (e.target === e.currentTarget) setShowAddModal(false) }}>
          <div className="modal">
            <div className="modal-title">Add Elevation</div>
            <div className="modal-sub">Name this elevation view.</div>
            <div className="field">
              <label className="field-label">Elevation Name</label>
              <input
                className="field-input"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="e.g. North Wall, Living Room"
                onKeyDown={e => e.key === 'Enter' && handleAdd()}
                autoFocus
              />
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setShowAddModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAdd}>Add Elevation</button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Elevation modal */}
      {renameElevId && (
        <div className="modal-bg open" onClick={e => { if (e.target === e.currentTarget) setRenameElevId(null) }}>
          <div className="modal">
            <div className="modal-title">Rename Elevation</div>
            <div className="field">
              <label className="field-label">Elevation Name</label>
              <input
                className="field-input"
                value={renameName}
                onChange={e => setRenameName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleRename()}
                autoFocus
              />
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setRenameElevId(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleRename} disabled={!renameName.trim()}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Option modal */}
      {renameOpt && (
        <div className="modal-bg open" onClick={e => { if (e.target === e.currentTarget) setRenameOpt(null) }}>
          <div className="modal">
            <div className="modal-title">Name this option</div>
            <div className="modal-sub">Shown instead of the letter everywhere this option appears, including to your client. Leave blank to go back to the letter.</div>
            <div className="field">
              <label className="field-label">Option Name</label>
              <input
                className="field-input"
                value={renameOptName}
                maxLength={OPTION_NAME_MAX}
                onChange={e => setRenameOptName(e.target.value)}
                placeholder={`e.g. Kandinsky 1 (currently ${renameOpt.title})`}
                onKeyDown={e => e.key === 'Enter' && handleRenameOption()}
                autoFocus
              />
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setRenameOpt(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleRenameOption}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Elevation confirmation modal */}
      {confirmDeleteElevId && (
        <div className="modal-bg open" onClick={e => { if (e.target === e.currentTarget) setConfirmDeleteElevId(null) }}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">
              Delete {(() => {
                const name = elevations.find(e => e.id === confirmDeleteElevId)?.name
                return name ? `“${name}”` : 'Elevation'
              })()}?
            </div>
            <div className="modal-sub" style={{ color: 'var(--red)' }}>
              This will permanently delete this elevation and all its artworks. This cannot be undone.
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setConfirmDeleteElevId(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={() => { onDeleteElevation(confirmDeleteElevId); setConfirmDeleteElevId(null) }}>
                Delete Elevation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Option confirmation modal */}
      {confirmDeleteOpt && (
        <div className="modal-bg open" onClick={e => { if (e.target === e.currentTarget) setConfirmDeleteOpt(null) }}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Remove {confirmDeleteOpt.title}?</div>
            <div className="modal-sub" style={{ color: 'var(--red)' }}>
              {confirmDeleteOpt.hasArtworks
                ? 'This option has artworks. Removing it will permanently delete them and their images.'
                : 'This will permanently remove this option.'}
              {' '}This cannot be undone.
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setConfirmDeleteOpt(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={() => {
                onDeleteOption(confirmDeleteOpt.elevId, confirmDeleteOpt.optKey)
                setConfirmDeleteOpt(null)
              }}>
                Remove Option
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function PencilIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <line x1="12" y1="5" x2="12" y2="19"/>
      <line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  )
}

function MoreIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="5" cy="12" r="1.8"/>
      <circle cx="12" cy="12" r="1.8"/>
      <circle cx="19" cy="12" r="1.8"/>
    </svg>
  )
}

function EyeIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  )
}

function EyeOffIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 19c-7 0-11-7-11-7a18.45 18.45 0 0 1 5.06-5.94"/>
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 7 11 7a18.5 18.5 0 0 1-2.16 3.19"/>
      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6l-1 14H6L5 6"/>
      <path d="M10 11v6M14 11v6"/>
      <path d="M9 6V4h6v2"/>
    </svg>
  )
}
