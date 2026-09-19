'use client'

import ArtworkLine from './ArtworkLine'
import OptionBlock from './OptionBlock'
import OptionNote from './OptionNote'
import { fmtGbp, optionTotal } from './budgetCalc'
import type { BudgetElevationData, BudgetArtworkPatch } from './budgetCalc'

interface Props {
  elevation: BudgetElevationData
  vatMode: boolean
  isConsultant: boolean
  onArtworkChange?: (artworkId: string, patch: BudgetArtworkPatch) => void
  onNoteChange?: (elevationId: string, optionKey: string, note: string, shownToClient: boolean) => void
}

/**
 * Up to this many options sit side by side. Beyond it they stack as cards:
 * the side-by-side row was drawn for two, and at ten it squeezed every block
 * to a sliver with prices printed over titles.
 */
const SIDE_BY_SIDE_MAX = 3

export default function ElevationSection({ elevation, vatMode, isConsultant, onArtworkChange, onNoteChange }: Props) {
  const picked = elevation.clientPickedOption

  if (picked) {
    const opt = elevation.options.find(o => o.key === picked)
    const displayTotal = opt ? optionTotal(opt.artworks, vatMode) : 0

    return (
      <div className="budget-elev-block budget-elev-block--picked">
        <div className="budget-elev-header budget-elev-header--picked">
          <span className="budget-elev-name">{elevation.name}</span>
          <span className="budget-elev-pick-badge">✓ {opt?.title ?? `Option ${picked}`}</span>
          <span className="budget-elev-total">{fmtGbp(displayTotal)}</span>
        </div>
        {opt && (
          <OptionNote
            note={opt.consultantNote}
            shownToClient={opt.consultantNoteShownToClient}
            isConsultant={isConsultant}
            onChange={onNoteChange && ((n, shown) => onNoteChange(elevation.id, opt.key, n, shown))}
          />
        )}
        <div className="budget-picked-artworks">
          {!opt || opt.artworks.length === 0 ? (
            <p className="budget-empty-note">No artworks added</p>
          ) : (
            opt.artworks.map(a => (
              <ArtworkLine
                key={a.id}
                artwork={a}
                vatMode={vatMode}
                isConsultant={isConsultant}
                onChange={onArtworkChange && (patch => onArtworkChange(a.id, patch))}
              />
            ))
          )}
        </div>
      </div>
    )
  }

  // Pending: client hasn't picked yet
  return (
    <div className="budget-elev-block">
      <div className="budget-elev-header budget-elev-header--pending">
        <span className="budget-elev-name">{elevation.name}</span>
        <span className="budget-elev-pending-badge">● Selection pending</span>
      </div>
      {elevation.options.length === 0 ? (
        <p className="budget-empty-note">No options added</p>
      ) : elevation.options.length <= SIDE_BY_SIDE_MAX ? (
        <div className="budget-options-row">
          {elevation.options.map(opt => (
            <OptionBlock
              key={opt.key}
              option={opt}
              vatMode={vatMode}
              isConsultant={isConsultant}
              onArtworkChange={onArtworkChange}
              onNoteChange={onNoteChange && ((k, n, shown) => onNoteChange(elevation.id, k, n, shown))}
            />
          ))}
        </div>
      ) : (
        <div className="budget-options-stack">
          {elevation.options.map(opt => (
            <OptionBlock
              key={opt.key}
              option={opt}
              vatMode={vatMode}
              isConsultant={isConsultant}
              onArtworkChange={onArtworkChange}
              onNoteChange={onNoteChange && ((k, n, shown) => onNoteChange(elevation.id, k, n, shown))}
              layout="card"
            />
          ))}
        </div>
      )}
    </div>
  )
}
