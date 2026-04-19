'use client'

import type { BudgetCustomLineItem } from '@/types'

interface Props {
  items: BudgetCustomLineItem[]
  isConsultant: boolean
  onAdd: () => void
  onUpdate: (id: string, patch: Partial<BudgetCustomLineItem>) => void
  onRemove: (id: string) => void
}

export default function CustomLineItems({ items, isConsultant, onAdd, onUpdate, onRemove }: Props) {
  const visible = isConsultant ? items : items.filter(i => i.shownToClient)

  if (!isConsultant && visible.length === 0) return null

  return (
    <div className="budget-custom-items">
      {visible.map(item => (
        <div key={item.id} className="budget-cost-row budget-cost-row--stacked">
          <div className="budget-cost-row-main">
            <div className="budget-cost-label">
              {isConsultant ? (
                <input
                  className="budget-custom-name-input"
                  value={item.name}
                  onChange={e => onUpdate(item.id, { name: e.target.value })}
                  placeholder="Line item name"
                />
              ) : (
                <span>{item.name || 'Additional item'}</span>
              )}
            </div>
            <div className="budget-cost-value-group">
              {isConsultant ? (
                <>
                  <span className="budget-inline-prefix">£</span>
                  <input
                    className="budget-inline-input budget-inline-input--amount"
                    type="number"
                    min="0"
                    value={item.amount}
                    onChange={e => {
                      const v = parseInt(e.target.value, 10)
                      onUpdate(item.id, { amount: isNaN(v) ? 0 : v })
                    }}
                  />
                </>
              ) : (
                <span className="budget-cost-value">
                  £{item.amount.toLocaleString('en-GB')}
                </span>
              )}
              {isConsultant && (
                <button
                  className="budget-cost-edit budget-cost-edit--danger"
                  onClick={() => onRemove(item.id)}
                  title="Remove item"
                >
                  Remove
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
      ))}

      {isConsultant && (
        <button className="budget-add-item" onClick={onAdd}>
          <span>+</span> Add line item
        </button>
      )}
    </div>
  )
}
