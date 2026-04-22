'use client'

import { useState, useRef, useEffect } from 'react'
import { displayFrozenAmount } from './budgetCalc'
import type { BudgetCustomLineItem } from '@/types'

interface Props {
  items: BudgetCustomLineItem[]
  isConsultant: boolean
  vatMode: boolean
  onAdd: () => void
  onUpdate: (id: string, patch: Partial<BudgetCustomLineItem>) => void
  onRemove: (id: string) => void
}

interface DraftState {
  id: string
  name: string
  amount: string
  vatApplies: boolean
  shownToClient: boolean
}

export default function CustomLineItems({ items, isConsultant, vatMode, onAdd, onUpdate, onRemove }: Props) {
  const [draft, setDraft] = useState<DraftState | null>(null)
  const pendingAdd = useRef(false)

  const visible = isConsultant ? items : items.filter(i => i.shownToClient)

  function openEdit(item: BudgetCustomLineItem) {
    const displayAmt = displayFrozenAmount(
      item.amount, item.amountIncludesVat, item.vatApplies, vatMode,
    )
    setDraft({
      id: item.id,
      name: item.name,
      amount: item.amount === 0 && !item.name ? '' : String(displayAmt),
      vatApplies: item.vatApplies,
      shownToClient: item.shownToClient,
    })
  }

  function saveDraft() {
    if (!draft) return
    const parsed = parseInt(draft.amount.replace(/[^0-9]/g, ''), 10)
    const amount = isNaN(parsed) ? 0 : parsed
    onUpdate(draft.id, {
      name: draft.name,
      amount,
      vatApplies: draft.vatApplies,
      shownToClient: draft.shownToClient,
      amountIncludesVat: vatMode,
    })
    setDraft(null)
  }

  function cancelDraft() {
    if (!draft) return
    const item = items.find(i => i.id === draft.id)
    // Freshly-added blank item: remove on cancel instead of orphaning it
    if (item && !item.name && item.amount === 0) onRemove(item.id)
    setDraft(null)
  }

  function removeDraft() {
    if (!draft) return
    onRemove(draft.id)
    setDraft(null)
  }

  function handleAdd() {
    pendingAdd.current = true
    onAdd()
  }

  // After a click on "+ Add line item", open the newly-appended blank item
  // for editing. Matches by last-item identity so we open exactly one draft.
  useEffect(() => {
    if (!pendingAdd.current) return
    const last = items[items.length - 1]
    if (!last) return
    pendingAdd.current = false
    setDraft({
      id: last.id,
      name: last.name,
      amount: '',
      vatApplies: last.vatApplies,
      shownToClient: last.shownToClient,
    })
  }, [items])

  if (!isConsultant && visible.length === 0) return null

  return (
    <div className="budget-custom-items">
      {visible.map(item => {
        const isEditing = draft?.id === item.id
        const displayAmount = displayFrozenAmount(
          item.amount, item.amountIncludesVat, item.vatApplies, vatMode,
        )

        if (isEditing && draft) {
          return (
            <div key={item.id} className="budget-cost-row budget-cost-row--stacked">
              <div className="budget-cost-row-main">
                <div className="budget-cost-label">
                  <input
                    className="budget-custom-name-input"
                    value={draft.name}
                    onChange={e => setDraft({ ...draft, name: e.target.value })}
                    placeholder="Line item name"
                    autoFocus
                  />
                </div>
                <div className="budget-inline-edit">
                  <span className="budget-inline-prefix">£</span>
                  <input
                    className="budget-inline-input"
                    type="number"
                    min="0"
                    value={draft.amount}
                    onChange={e => setDraft({ ...draft, amount: e.target.value })}
                    onKeyDown={e => { if (e.key === 'Enter') saveDraft(); if (e.key === 'Escape') cancelDraft() }}
                    placeholder="0"
                  />
                  <button className="btn btn-sm btn-primary" onClick={saveDraft}>Save</button>
                  <button className="btn btn-sm btn-ghost" onClick={cancelDraft}>Cancel</button>
                  <button className="btn btn-sm btn-danger" onClick={removeDraft}>Remove</button>
                </div>
              </div>

              <div className="budget-custom-item-controls">
                <label className="budget-toggle">
                  <input
                    type="checkbox"
                    checked={draft.vatApplies}
                    onChange={e => setDraft({ ...draft, vatApplies: e.target.checked })}
                  />
                  <span>VAT applies</span>
                </label>
                <label className="budget-toggle">
                  <input
                    type="checkbox"
                    checked={draft.shownToClient}
                    onChange={e => setDraft({ ...draft, shownToClient: e.target.checked })}
                  />
                  <span>Shown to client</span>
                </label>
              </div>
            </div>
          )
        }

        return (
          <div key={item.id} className="budget-cost-row budget-cost-row--stacked">
            <div className="budget-cost-row-main">
              <div className="budget-cost-label">
                <span>{item.name || 'Additional item'}</span>
              </div>
              <div className="budget-cost-value-group">
                <span className="budget-cost-value">
                  £{displayAmount.toLocaleString('en-GB')}
                </span>
                {isConsultant && (
                  <button
                    className="budget-cost-edit"
                    onClick={() => openEdit(item)}
                  >
                    Edit
                  </button>
                )}
              </div>
            </div>

            {isConsultant && (
              <div className="budget-custom-item-controls">
                <label className="budget-toggle">
                  <input
                    type="checkbox"
                    checked={item.vatApplies}
                    onChange={e => onUpdate(item.id, { vatApplies: e.target.checked })}
                  />
                  <span>VAT applies</span>
                </label>
                <label className="budget-toggle">
                  <input
                    type="checkbox"
                    checked={item.shownToClient}
                    onChange={e => onUpdate(item.id, { shownToClient: e.target.checked })}
                  />
                  <span>Shown to client</span>
                </label>
              </div>
            )}
          </div>
        )
      })}

      {isConsultant && (
        <button className="budget-add-item" onClick={handleAdd}>
          <span>+</span> Add line item
        </button>
      )}
    </div>
  )
}
