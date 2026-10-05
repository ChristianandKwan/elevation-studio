'use client'

import { useEffect, useState } from 'react'
import { fmtGbp } from './budgetCalc'
import { newAlternative, newGroup } from './choices'
import type {
  BudgetChoice, BudgetChoiceAlternative, BudgetChoiceGroup, BudgetChoiceKind,
} from '@/types'

/** A work the choice can price, as the editor lists it. */
export interface EditorWork {
  workId: string
  name: string
  artist: string
  dims: string
  /** On an option still in play on a wall the client sees. Only these need a price. */
  inPlay: boolean
  /** Where it hangs, for the works folded away: "Paula Scher 1, Paula Scher 3". */
  where: string
}

interface Props {
  choice: BudgetChoice
  works: EditorWork[]
  onChange: (update: (prev: BudgetChoice) => BudgetChoice) => void
  onDone: () => void
}

const KINDS: { kind: BudgetChoiceKind; label: string }[] = [
  { kind: 'framing', label: 'Framing' },
  { kind: 'shipping', label: 'Shipping' },
  { kind: 'other', label: 'Other' },
]

/** Whole pounds from whatever was typed, or null for an empty box. */
function parsePounds(text: string): number | null {
  const digits = text.replace(/[^0-9]/g, '')
  return digits ? parseInt(digits, 10) : null
}

/**
 * A price box. Keeps what was typed while it parses to the stored figure, so
 * the box never rewrites itself under the cursor, and follows the stored
 * figure when it changes from elsewhere.
 */
function PriceInput({ value, onCommit, label }: {
  value: number | null | undefined
  onCommit: (v: number | null) => void
  label: string
}) {
  const [text, setText] = useState(value == null ? '' : String(value))
  // Followed during render rather than in an effect, so the box never shows
  // a stale figure for a frame.
  const [seen, setSeen] = useState(value)
  if (value !== seen) {
    setSeen(value)
    if (parsePounds(text) !== (value ?? null)) setText(value == null ? '' : String(value))
  }
  return (
    <span className={`bch-cell${value == null ? ' bch-cell--empty' : ''}`}>
      <span aria-hidden="true">£</span>
      <input
        type="text"
        inputMode="numeric"
        aria-label={label}
        value={text}
        placeholder="—"
        onChange={e => { setText(e.target.value); onCommit(parsePounds(e.target.value)) }}
      />
    </span>
  )
}

/**
 * Where the consultant writes a choice: its name, what it counts as, and for
 * each supplier a grid of alternatives against works, copied off the quote.
 * Every keystroke is saved with the rest of the budget.
 */
export default function ChoiceEditor({ choice, works, onChange, onDone }: Props) {
  const [showOthers, setShowOthers] = useState<Record<string, boolean>>({})
  const inPlay = works.filter(w => w.inPlay)
  const others = works.filter(w => !w.inPlay)
  const perWork = choice.pricing === 'per_work'

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onDone() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onDone])

  function setGroup(groupId: string, update: (g: BudgetChoiceGroup) => BudgetChoiceGroup) {
    onChange(c => ({ ...c, groups: c.groups.map(g => (g.id === groupId ? update(g) : g)) }))
  }
  function setAlt(groupId: string, altId: string, update: (a: BudgetChoiceAlternative) => BudgetChoiceAlternative) {
    setGroup(groupId, g => ({ ...g, alternatives: g.alternatives.map(a => (a.id === altId ? update(a) : a)) }))
  }
  function setPrice(groupId: string, altId: string, workId: string, v: number | null) {
    setAlt(groupId, altId, a => {
      const prices = { ...a.prices }
      if (v == null) delete prices[workId]
      else prices[workId] = v
      return { ...a, prices }
    })
  }

  function workRow(group: BudgetChoiceGroup, w: EditorWork, dim: boolean) {
    return (
      <tr key={w.workId} className={dim ? 'bch-grid-dim' : undefined}>
        <th scope="row" className="bch-work">
          {w.name}
          <small>{dim ? w.where : [w.artist, w.dims].filter(Boolean).join(' · ')}</small>
        </th>
        {group.alternatives.map(a => (
          <td key={a.id}>
            <PriceInput
              value={a.prices[w.workId]}
              label={`${a.name || 'Alternative'}, ${w.name}`}
              onCommit={v => setPrice(group.id, a.id, w.workId, v)}
            />
          </td>
        ))}
      </tr>
    )
  }

  return (
    <div className="modal-bg open bch-editor-bg" onMouseDown={e => { if (e.target === e.currentTarget) onDone() }}>
      <div className="modal bch-editor" role="dialog" aria-label="Edit choice">
        <div className="bch-editor-head">
          <div className="modal-title">Edit choice</div>
          <button type="button" className="btn btn-sm btn-primary" onClick={onDone}>Done</button>
        </div>

        <div className="bch-fields">
          <label className="bch-field">
            <span>Choice</span>
            <input
              className="bch-input"
              value={choice.name}
              placeholder="Framing"
              onChange={e => onChange(c => ({ ...c, name: e.target.value }))}
            />
          </label>
          <div className="bch-field">
            <span>Counts as</span>
            <div className="bch-toggle" role="group" aria-label="Counts as">
              {KINDS.map(k => (
                <button
                  key={k.kind}
                  type="button"
                  className={choice.kind === k.kind ? 'active' : ''}
                  aria-pressed={choice.kind === k.kind}
                  onClick={() => onChange(c => ({ ...c, kind: k.kind }))}
                >{k.label}</button>
              ))}
            </div>
          </div>
          <div className="bch-field">
            <span>Priced</span>
            <div className="bch-toggle" role="group" aria-label="Priced">
              <button
                type="button"
                className={perWork ? 'active' : ''}
                aria-pressed={perWork}
                onClick={() => onChange(c => ({ ...c, pricing: 'per_work' }))}
              >For each work</button>
              <button
                type="button"
                className={!perWork ? 'active' : ''}
                aria-pressed={!perWork}
                onClick={() => onChange(c => ({ ...c, pricing: 'whole' }))}
              >As one figure</button>
            </div>
          </div>
          <label className="budget-toggle bch-field-check">
            <input
              type="checkbox"
              checked={choice.shownToClient}
              onChange={e => onChange(c => ({ ...c, shownToClient: e.target.checked }))}
            />
            Shown to client
          </label>
        </div>
        <p className="bch-hint">
          Prices are ex VAT, in whole pounds.{' '}
          {perWork
            ? 'Works on the walls the client can still end up with come first. An alternative is offered to the client once each of them has a price.'
            : 'An alternative is offered to the client once it has a price.'}
        </p>

        {choice.groups.map(group => {
          const open = !!showOthers[group.id]
          return (
            <div key={group.id} className="bch-group">
              <div className="bch-group-head">
                <input
                  className="bch-input bch-group-label"
                  value={group.label}
                  placeholder="Framer 1"
                  aria-label="Group label, as the client sees it"
                  onChange={e => setGroup(group.id, g => ({ ...g, label: e.target.value }))}
                />
                <label className="bch-cknote">
                  <b>C&amp;K only</b>
                  <input
                    value={group.internalNote}
                    placeholder="The supplier, the quote reference"
                    onChange={e => setGroup(group.id, g => ({ ...g, internalNote: e.target.value }))}
                  />
                </label>
                {choice.groups.length > 1 && (
                  <button
                    type="button"
                    className="budget-cost-edit budget-cost-edit--danger"
                    onClick={() => onChange(c => ({ ...c, groups: c.groups.filter(g => g.id !== group.id) }))}
                  >Remove group</button>
                )}
              </div>

              <div className="bch-grid-wrap">
                <table className="bch-grid">
                  <thead>
                    <tr>
                      <th className="bch-grid-corner" />
                      {group.alternatives.map(a => (
                        <th key={a.id} scope="col">
                          <div className="bch-alt-head">
                            <input
                              className="bch-alt-name"
                              value={a.name}
                              placeholder="Name, e.g. Museum glass"
                              aria-label="Alternative name"
                              onChange={e => setAlt(group.id, a.id, x => ({ ...x, name: e.target.value }))}
                            />
                            {group.alternatives.length > 1 && (
                              <button
                                type="button"
                                className="bch-alt-remove"
                                aria-label={`Remove ${a.name || 'this alternative'}`}
                                onClick={() => setGroup(group.id, g => ({ ...g, alternatives: g.alternatives.filter(x => x.id !== a.id) }))}
                              >×</button>
                            )}
                          </div>
                          <textarea
                            className="bch-alt-desc"
                            value={a.description}
                            rows={2}
                            placeholder="What makes it different"
                            aria-label="What makes it different"
                            onChange={e => setAlt(group.id, a.id, x => ({ ...x, description: e.target.value }))}
                          />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {perWork ? (
                      <>
                        {inPlay.length === 0 && (
                          <tr><td colSpan={group.alternatives.length + 1} className="bch-grid-note">No works on the walls yet.</td></tr>
                        )}
                        {inPlay.map(w => workRow(group, w, false))}
                        {others.length > 0 && (
                          <tr className="bch-grid-more">
                            <td colSpan={group.alternatives.length + 1}>
                              <button
                                type="button"
                                aria-expanded={open}
                                onClick={() => setShowOthers(s => ({ ...s, [group.id]: !open }))}
                              >
                                {open ? '▾' : '▸'} {others.length} more work{others.length === 1 ? '' : 's'} on options the client hasn’t picked.
                                Price {others.length === 1 ? 'it' : 'these'} only if they might switch.
                              </button>
                            </td>
                          </tr>
                        )}
                        {open && others.map(w => workRow(group, w, true))}
                        <tr className="bch-grid-total">
                          <th scope="row">{others.length > 0 ? 'On the walls in play' : 'Total'}</th>
                          {group.alternatives.map(a => (
                            <td key={a.id}>
                              {fmtGbp(inPlay.reduce((s, w) => s + (a.prices[w.workId] ?? 0), 0))}
                              {inPlay.some(w => a.prices[w.workId] == null) && (
                                <span className="bch-missing">
                                  {inPlay.filter(w => a.prices[w.workId] == null).length} missing
                                </span>
                              )}
                            </td>
                          ))}
                        </tr>
                      </>
                    ) : (
                      <tr>
                        <th scope="row" className="bch-work">The whole job</th>
                        {group.alternatives.map(a => (
                          <td key={a.id}>
                            <PriceInput
                              value={a.amount}
                              label={`${a.name || 'Alternative'}, whole job`}
                              onCommit={v => setAlt(group.id, a.id, x => ({ ...x, amount: v }))}
                            />
                          </td>
                        ))}
                      </tr>
                    )}
                    <tr className="bch-grid-vat">
                      <td />
                      {group.alternatives.map(a => (
                        <td key={a.id}>
                          <label className="budget-toggle">
                            <input
                              type="checkbox"
                              checked={a.vatApplies}
                              onChange={e => setAlt(group.id, a.id, x => ({ ...x, vatApplies: e.target.checked }))}
                            />
                            VAT applies
                          </label>
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
              <button
                type="button"
                className="budget-add-item"
                onClick={() => setGroup(group.id, g => ({ ...g, alternatives: [...g.alternatives, newAlternative()] }))}
              >
                <span>+</span> Add an alternative{group.label.trim() ? ` to ${group.label.trim()}` : ''}
              </button>
            </div>
          )
        })}

        <div className="bch-editor-foot">
          <button
            type="button"
            className="budget-add-item"
            onClick={() => onChange(c => ({
              ...c,
              groups: [...c.groups, newGroup(nextGroupLabel(c))],
            }))}
          >
            <span>+</span> Add another group
          </button>
          <button type="button" className="btn btn-sm btn-primary" onClick={onDone}>Done</button>
        </div>
      </div>
    </div>
  )
}

/** "Framer 2" after "Framer 1": the next number on the first group's label, if it has one. */
function nextGroupLabel(choice: BudgetChoice): string {
  const first = choice.groups[0]?.label.trim() ?? ''
  const m = first.match(/^(.*?)(\d+)$/)
  if (m) return `${m[1]}${choice.groups.length + 1}`
  return ''
}
