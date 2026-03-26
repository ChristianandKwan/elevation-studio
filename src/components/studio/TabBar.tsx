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
}

export default function TabBar({ elevations, activeElevId, activeOption, onSwitch, onAddElevation }: Props) {
  const [showModal, setShowModal] = useState(false)
  const [newName, setNewName] = useState('')

  function handleAdd() {
    const name = newName.trim() || 'New Elevation'
    onAddElevation(name)
    setNewName('')
    setShowModal(false)
  }

  return (
    <>
      <div className="studio-tab-bar">
        {elevations.map((elev, i) => (
          <div key={elev.id} style={{ display: 'flex', alignItems: 'center' }}>
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
          </div>
        ))}
        <button className="studio-tab-add" onClick={() => setShowModal(true)}>
          + Add Elevation
        </button>
      </div>

      {showModal && (
        <div className="modal-bg open" onClick={e => { if (e.target === e.currentTarget) setShowModal(false) }}>
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
              <button className="btn" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAdd}>Add Elevation</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
