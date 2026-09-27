'use client'

import type { IndexElevation } from '@/lib/works'

interface Props {
  elevations: IndexElevation[]
  /** Every option id that is ticked. */
  picked: Set<string>
  onToggleOption: (id: string) => void
  onSetElevation: (elev: IndexElevation, on: boolean) => void
}

/**
 * Which elevations, and which options of each. Shared by the export pack and
 * Create proposal, which build from the same choice: every option starts
 * ticked (Tom), and unticking an elevation's last option leaves it out whole.
 */
export default function OptionPicker({ elevations, picked, onToggleOption, onSetElevation }: Props) {
  const toggleOption = onToggleOption
  const setElevation = onSetElevation
  return (
    <>
      {elevations.length === 0 ? (
        <p className="export-hint">This project has no elevations yet.</p>
      ) : (
        <div className="export-elevations">
          {elevations.map(elev => {
            const chosen = elev.options.filter(o => picked.has(o.id)).length
            const all = chosen === elev.options.length && chosen > 0
            return (
              <div key={elev.id} className={`export-elev${chosen ? '' : ' off'}`}>
                <label className="export-check">
                  <input
                    type="checkbox"
                    checked={chosen > 0}
                    // Part-way through is neither on nor off, and a box
                    // that looked empty while two of five were ticked
                    // would be lying about what is going out.
                    ref={el => { if (el) el.indeterminate = chosen > 0 && !all }}
                    disabled={elev.options.length === 0}
                    onChange={e => setElevation(elev, e.target.checked)}
                  />
                  <span className="export-elev-name">{elev.name}</span>
                  {elev.options.length > 1 && (
                    <span className="export-check-note">
                      {' '}— {chosen} of {elev.options.length}
                    </span>
                  )}
                </label>
                {elev.options.length > 1 && (
                  <div className="export-options">
                    {elev.options.map((opt, i) => (
                      <button
                        key={opt.id}
                        type="button"
                        className={`export-opt${picked.has(opt.id) ? ' active' : ''}`}
                        aria-pressed={picked.has(opt.id)}
                        onClick={() => toggleOption(opt.id)}
                      >
                        {opt.title}
                        {elev.clientPickedOption === elev.optionKeys[i] && (
                          <span className="export-opt-picked"> · picked</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
                {elev.options.length === 0 && (
                  <span className="export-elev-note">nothing on it yet</span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
