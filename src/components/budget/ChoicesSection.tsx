'use client'

import { useMemo, useState } from 'react'
import ChoiceEditor, { type EditorWork } from './ChoiceEditor'
import { applyVat } from './budgetCalc'
import { useMoney } from './money'
import type { BudgetElevationData } from './budgetCalc'
import {
  alternativeSpan, alternativesOf, clientChoices, missingPrices, offeredAlternatives,
  optionsInPlay, pickedAlternative, worksInPlay, type PlacedAlternative,
} from './choices'
import type { BudgetChoice, BudgetChoiceKind, BudgetChoicePicks } from '@/types'

interface Props {
  choices: BudgetChoice[]
  picks: BudgetChoicePicks
  /** The elevations the client sees. Every figure and the works in play come from these. */
  clientElevations: BudgetElevationData[]
  /** Every elevation, hidden ones too, so the editor can list every work there is to price. */
  allElevations: BudgetElevationData[]
  vatMode: boolean
  isConsultant: boolean
  /** Every decision is made: the project is approved and picks stand. */
  locked: boolean
  /** The one choice whose pick would complete the approval, if there is one. */
  lastDecisionId: string | null
  /** Works whose own framing line a framing choice would count twice. */
  doubleFramed: Array<{ workId: string; name: string }>
  /** Absent in the consultant's client preview and in the export's copy. */
  onPick?: (choiceId: string, alternativeId: string | null) => void
  /** Editing. Absent wherever the budget is read-only. */
  onAdd?: (kind: BudgetChoiceKind) => string
  onUpdate?: (id: string, update: (prev: BudgetChoice) => BudgetChoice) => void
  onRemove?: (id: string) => void
  onRemoveFramingLines?: (workIds: string[]) => void
}

const SHORT_DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' })

function pickedOn(at: string): string {
  const t = Date.parse(at)
  return Number.isNaN(t) ? '' : `, ${SHORT_DATE.format(t)}`
}

/**
 * Budget choices: on the Budget page, the cards the consultant prices and
 * picks from; on the client's Budget tab, the alternatives to choose between.
 */
export default function ChoicesSection(props: Props) {
  const { choices, isConsultant, onAdd } = props
  const [editingId, setEditingId] = useState<string | null>(null)

  const visible = isConsultant
    ? choices
    : clientChoices(choices, props.clientElevations, props.picks)
  // Nothing to show and nothing to add: no heading either. The export's copy
  // of the budget, which cannot add, is photographed for every project.
  if (visible.length === 0 && !(isConsultant && onAdd)) return null

  const editing = editingId ? choices.find(c => c.id === editingId) ?? null : null

  return (
    <section className="budget-section">
      <div className="budget-section-kicker">{isConsultant ? 'Choices' : 'Your choices'}</div>
      <div className="bch-list">
        {visible.map(choice => isConsultant
          ? <ConsultantChoice key={choice.id} {...props} choice={choice} onEdit={props.onUpdate ? () => setEditingId(choice.id) : undefined} />
          : <ClientChoice key={choice.id} {...props} choice={choice} />)}
      </div>

      {isConsultant && onAdd && (
        <div className="bch-add">
          <span>+ Add a choice</span>
          {(['framing', 'shipping', 'other'] as const).map(kind => (
            <button key={kind} type="button" onClick={() => setEditingId(onAdd(kind))}>
              {kind === 'framing' ? 'Framing' : kind === 'shipping' ? 'Shipping' : 'Something else'}
            </button>
          ))}
        </div>
      )}
      {isConsultant && onAdd && choices.length === 0 && (
        <p className="budget-empty-note">
          Let the client pick between priced alternatives: two framers’ glass and frames, say, or two shippers.
        </p>
      )}

      {editing && props.onUpdate && (
        <ChoiceEditor
          choice={editing}
          works={editorWorks(props.allElevations, props.clientElevations)}
          onChange={update => props.onUpdate!(editing.id, update)}
          onDone={() => setEditingId(null)}
        />
      )}
    </section>
  )
}

/** Every work on a wall, the ones in play first, for the editor's grid. */
function editorWorks(all: BudgetElevationData[], clientElevations: BudgetElevationData[]): EditorWork[] {
  const inPlay = worksInPlay(clientElevations)
  const byId = new Map<string, EditorWork & { places: string[] }>()
  for (const elev of all) {
    for (const opt of elev.options) {
      for (const a of opt.artworks) {
        const w = byId.get(a.workId) ?? {
          workId: a.workId, name: a.name, artist: a.artist,
          dims: a.wCm && a.hCm ? `${a.wCm} × ${a.hCm} cm` : '',
          inPlay: inPlay.has(a.workId), where: '', places: [],
        }
        w.places.push(opt.title)
        byId.set(a.workId, w)
      }
    }
  }
  const list = [...byId.values()].map(({ places, ...w }) => ({ ...w, where: [...new Set(places)].join(', ') }))
  return [...list.filter(w => w.inPlay), ...list.filter(w => !w.inPlay)]
}

// ── The consultant's card ─────────────────────────────────────────────────────

function ConsultantChoice({
  choice, picks, clientElevations, vatMode, doubleFramed, onPick, onUpdate, onRemove, onRemoveFramingLines, onEdit,
}: Props & { choice: BudgetChoice; onEdit?: () => void }) {
  const { fmtRange } = useMoney()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const inPlay = useMemo(() => worksInPlay(clientElevations), [clientElevations])
  const picked = pickedAlternative(choice, picks)
  const pick = picks[choice.id]
  const offered = new Set(offeredAlternatives(choice, inPlay).map(p => p.alt.id))
  const counted = clientChoices([choice], clientElevations, picks).length > 0
  const editable = !!onUpdate

  const spans = alternativesOf(choice)
    .filter(p => offered.has(p.alt.id))
    .map(p => alternativeSpan(choice, p.alt, clientElevations, vatMode))
  const headline = picked
    ? alternativeSpan(choice, picked.alt, clientElevations, vatMode)
    : spans.length
      ? { min: Math.min(...spans.map(s => s.min)), max: Math.max(...spans.map(s => s.max)) }
      : null

  const showDouble = choice.kind === 'framing' && choice.pricing === 'per_work' && counted && doubleFramed.length > 0

  return (
    <div className={`bch-card${choice.shownToClient ? '' : ' bch-card--hidden'}`}>
      <div className="bch-card-head">
        <span className="bch-name">{choice.name.trim() || 'Untitled choice'}</span>
        {!choice.shownToClient ? (
          <span className="budget-elev-hidden-badge">Hidden from client · not in client total</span>
        ) : picked && pick ? (
          <span className="budget-elev-pick-badge">
            ✓ Picked by {pick.by === 'us' ? 'C&K' : 'client'}{pickedOn(pick.at)}
          </span>
        ) : counted ? (
          <span className="budget-elev-pending-badge">● Waiting for client</span>
        ) : (
          <span className="budget-elev-hidden-badge">Not shown yet · no alternative fully priced</span>
        )}
        {headline && <span className="bch-total">{fmtRange(headline.min, headline.max)}</span>}
      </div>

      {choice.groups.map(group => (
        <div key={group.id} className="bch-group-view">
          <div className="bch-group-label-view">
            {group.label.trim() || 'Unlabelled'}
            {group.internalNote.trim() && <em>C&amp;K: {group.internalNote.trim()}</em>}
          </div>
          {group.alternatives.map(alt => {
            const missing = missingPrices(choice, alt, inPlay).length
            const isPicked = picked?.alt.id === alt.id
            const span = alternativeSpan(choice, alt, clientElevations, vatMode)
            return (
              <div
                key={alt.id}
                className={`bch-alt${isPicked ? ' bch-alt--picked' : ''}${picked && !isPicked ? ' bch-alt--other' : ''}`}
              >
                <b>{alt.name.trim() || 'Untitled'}</b>
                <span className="bch-alt-desc-view">
                  {alt.description.trim()}
                  {missing > 0 && (
                    <span className="bch-missing">
                      {choice.pricing === 'whole' ? 'No price yet' : `${missing} price${missing === 1 ? '' : 's'} missing`}
                      {' · '}not shown to the client until filled in
                    </span>
                  )}
                </span>
                <span className="bch-alt-price">{fmtRange(span.min, span.max)}</span>
                <span className="bch-alt-act">
                  {onPick && choice.shownToClient && (isPicked ? (
                    <button type="button" className="budget-cost-edit" onClick={() => onPick(choice.id, null)}>Clear pick</button>
                  ) : offered.has(alt.id) ? (
                    <button type="button" className="budget-cost-edit" onClick={() => onPick(choice.id, alt.id)}>Pick for client</button>
                  ) : null)}
                </span>
              </div>
            )
          })}
        </div>
      ))}

      {showDouble && (
        <div className="bch-warning" role="note">
          <span>
            {listNames(doubleFramed.map(w => w.name))} {doubleFramed.length === 1 ? 'also has its' : 'also have their'} own
            framing line, so {doubleFramed.length === 1 ? 'its' : 'their'} framing is counted twice.
          </span>
          {onRemoveFramingLines && (
            <button type="button" className="budget-cost-edit" onClick={() => onRemoveFramingLines(doubleFramed.map(w => w.workId))}>
              Remove {doubleFramed.length === 1 ? 'that line' : 'those lines'}
            </button>
          )}
        </div>
      )}

      {editable && (
        <div className="bch-card-foot">
          {onEdit && <button type="button" className="budget-cost-edit" onClick={onEdit}>Edit prices</button>}
          <button
            type="button"
            className="budget-cost-edit"
            onClick={() => onUpdate!(choice.id, c => ({ ...c, shownToClient: !c.shownToClient }))}
          >
            {choice.shownToClient ? 'Hide from client' : 'Show to client'}
          </button>
          {onRemove && (confirmDelete ? (
            <span className="bch-confirm">
              Delete {choice.name.trim() || 'this choice'}{picked ? ' and its pick' : ''}?
              <button type="button" className="budget-cost-edit budget-cost-edit--danger" onClick={() => onRemove(choice.id)}>Delete</button>
              <button type="button" className="budget-cost-edit" onClick={() => setConfirmDelete(false)}>Keep</button>
            </span>
          ) : (
            <button type="button" className="budget-cost-edit budget-cost-edit--danger" onClick={() => setConfirmDelete(true)}>Delete</button>
          ))}
        </div>
      )}
    </div>
  )
}

function listNames(names: string[]): string {
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

// ── The client's choice ───────────────────────────────────────────────────────

function ClientChoice({
  choice, picks, clientElevations, vatMode, locked, lastDecisionId, onPick,
}: Props & { choice: BudgetChoice }) {
  const { fmt, fmtRange } = useMoney()
  const inPlay = worksInPlay(clientElevations)
  const picked = pickedAlternative(choice, picks)
  const offered = offeredAlternatives(choice, inPlay)
  const perWork = choice.pricing === 'per_work'
  const wallsUndecided = clientElevations.some(e => optionsInPlay(e).length > 1)

  // The works in play, named, for the per-work breakdown under each card.
  const workNames = new Map<string, string>()
  for (const elev of clientElevations) {
    for (const opt of optionsInPlay(elev)) {
      for (const a of opt.artworks) if (a.visible) workNames.set(a.workId, a.name)
    }
  }

  const name = choice.name.trim() || 'Choice'

  if (picked) {
    const span = alternativeSpan(choice, picked.alt, clientElevations, vatMode)
    return (
      <div className="bch-client">
        <h3 className="bch-client-name">{name}</h3>
        <div className="bch-chosen">
          <div>
            <div className="bch-chosen-who">Your choice</div>
            <div className="bch-chosen-name">{altTitle(picked)}</div>
            {picked.alt.description.trim() && <div className="bch-chosen-desc">{picked.alt.description.trim()}</div>}
          </div>
          <span className="bch-chosen-price">{perWork && 'Total: '}{fmtRange(span.min, span.max)}</span>
          {onPick && !locked && (
            <button type="button" className="budget-cost-edit" onClick={() => onPick(choice.id, null)}>Change</button>
          )}
        </div>
      </div>
    )
  }

  // Grouped as the consultant grouped them, keeping only what is on offer.
  const groups = choice.groups
    .map(g => ({ group: g, alts: offered.filter(p => p.group.id === g.id) }))
    .filter(g => g.alts.length > 0)

  return (
    <div className="bch-client">
      <h3 className="bch-client-name">
        {name}
        <span className="budget-elev-pending-badge">To choose</span>
      </h3>
      <p className="bch-client-intro">
        Choose one.
        {perWork && (wallsUndecided
          ? ' Prices are for the works on your walls, and depend on the option you choose for each.'
          : ' Prices are for the works on your chosen walls.')}
        {lastDecisionId === choice.id && ' This is your last decision: choosing completes your approval.'}
      </p>
      {groups.map(({ group, alts }) => (
        <div key={group.id}>
          {group.label.trim() && <div className="bch-client-group">{group.label.trim()}</div>}
          <div className="bch-cards">
            {alts.map(({ alt }) => {
              const span = alternativeSpan(choice, alt, clientElevations, vatMode)
              const priced = [...workNames].filter(([id]) => alt.prices[id] != null)
              return (
                <div key={alt.id} className="bch-option">
                  <h4>{alt.name.trim() || 'Untitled'}</h4>
                  <span className="bch-option-desc">{alt.description.trim()}</span>
                  <span className="bch-option-price">{perWork && 'Total: '}{fmtRange(span.min, span.max)}</span>
                  {perWork && priced.length > 1 && (
                    <details className="bch-option-each">
                      <summary>Price for each work</summary>
                      {priced.map(([id, workName]) => (
                        <div key={id}>
                          <span>{workName}</span>
                          <span>{fmt(applyVat(alt.prices[id], alt.vatApplies, vatMode))}</span>
                        </div>
                      ))}
                    </details>
                  )}
                  {onPick && (
                    <button type="button" className="bch-option-pick" onClick={() => onPick(choice.id, alt.id)}>
                      Choose this
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

function altTitle({ group, alt }: PlacedAlternative): string {
  return [alt.name.trim() || 'Untitled', group.label.trim()].filter(Boolean).join(' · ')
}
