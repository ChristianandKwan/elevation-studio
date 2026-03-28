'use client'

import { useState } from 'react'

interface Elevation {
  id: string
  name: string
}

interface Props {
  elevations: Elevation[]
  activeElevId: string
  activeOption: string
  onSwitch: (elevId: string, option: string) => void
  onAddElevation: (name: string) => void
  onRenameElevation: (elevId: string, newName: string) => void
  onDeleteElevation: (elevId: string) => void
}

export default function TabBar({ elevations, activeElevId, activeOption, onSwitch, onAddElevation, onRenameElevation, onDeleteElevation }: Props) {
  const [showAddModal, setShowAddModal] = useState(false)
  const [newName, setNewName] = useState('')
  const [renameElevId, setRenameElevId] = useState<string | null>(null)
  const [renameName, setRenameName] = useState('')
  const [confirmDeleteElevId, setConfirmDeleteElevId] = useState<string | null>(null)

  function handleAdd() {
    const name = newName.trim() || 'New Elevation'
    onAddElevation(name)
    setNewName('')
    setShowAddModal(false)
  }

  function openRename(elev: Elevation) {
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
      <div className="studio-tab-bar">
        {elevations.map((elev, i) => (
          <div key={elev.id} className="studio-tab-group">
            {i > 0 && <div className="studio-tab-divider" />}
            <button
              className={`studio-tab${activeElevId === elev.id && activeOption === 'A' ? ' active' : ''}`}
              onClick={() => onSwitch(elev.id, 'A')}
            >
              <span className="tag tag-option-a" style={{ marginRight: 5 }}>A</span>
              {elev.name}
            </button>
            <button
              className={`studio-tab${activeElevId === elev.id && activeOption === 'B' ? ' active' : ''}`}
              onClick={() => onSwitch(elev.id, 'B')}
            >
              <span className="tag tag-option-b" style={{ marginRight: 5 }}>B</span>
              {elev.name}
            </button>
            <button
              className="studio-tab-rename-btn"
              title="Rename elevation"
              onClick={() => openRename(elev)}
            >
              <PencilIcon />
            </button>
            {elevations.length > 1 && (
              <button
                className="studio-tab-rename-btn"
                title="Delete elevation"
                onClick={() => setConfirmDeleteElevId(elev.id)}
              >
                <TrashIcon />
              </button>
            )}
          </div>
        ))}
        <button className="studio-tab-add" onClick={() => setShowAddModal(true)}>
          + Add Elevation
        </button>
      </div>

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
              <button
                className="btn btn-primary"
                onClick={handleRename}
                disabled={!renameName.trim()}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Elevation confirmation modal */}
      {confirmDeleteElevId && (
        <div className="modal-bg open" onClick={e => { if (e.target === e.currentTarget) setConfirmDeleteElevId(null) }}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Delete Elevation</div>
            <div className="modal-sub" style={{ color: 'var(--red)' }}>
              This will permanently delete this elevation and all its artworks. This cannot be undone.
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setConfirmDeleteElevId(null)}>Cancel</button>
              <button
                className="btn btn-danger"
                onClick={() => { onDeleteElevation(confirmDeleteElevId); setConfirmDeleteElevId(null) }}
              >
                Delete Elevation
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
