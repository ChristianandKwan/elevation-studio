'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { ProjectBudget, BudgetInstallation, BudgetConsultantFee, BudgetCustomLineItem } from '@/types'

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export interface UseBudgetStateResult {
  budget: ProjectBudget | null
  saveStatus: SaveStatus
  isLoading: boolean
  setInstallation: (v: BudgetInstallation) => void
  setConsultantFee: (v: BudgetConsultantFee | null) => void
  addCustomLineItem: () => void
  updateCustomLineItem: (id: string, patch: Partial<BudgetCustomLineItem>) => void
  removeCustomLineItem: (id: string) => void
  setVatIncludedDefault: (v: boolean) => void
}

function mapRow(row: Record<string, unknown>): ProjectBudget {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    installation: (row.installation ?? { indicative: true, confirmedAmount: null }) as BudgetInstallation,
    consultantFee: (row.consultant_fee ?? null) as BudgetConsultantFee | null,
    customLineItems: (row.custom_line_items ?? []) as BudgetCustomLineItem[],
    vatIncludedDefault: (row.vat_included_default ?? false) as boolean,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

export function useBudgetState(projectId: string): UseBudgetStateResult {
  const [budget, setBudget] = useState<ProjectBudget | null>(null)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [isLoading, setIsLoading] = useState(true)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const budgetIdRef = useRef<string | null>(null)

  // Load on mount — lazy-create row if none exists
  useEffect(() => {
    let cancelled = false
    async function load() {
      setIsLoading(true)
      const supabase = createClient()

      const { data: existing } = await supabase
        .from('project_budgets')
        .select('*')
        .eq('project_id', projectId)
        .maybeSingle()

      if (cancelled) return

      if (existing) {
        const mapped = mapRow(existing as Record<string, unknown>)
        setBudget(mapped)
        budgetIdRef.current = mapped.id
      } else {
        const { data: created } = await supabase
          .from('project_budgets')
          .insert({
            project_id: projectId,
            installation: { indicative: true, confirmedAmount: null },
            consultant_fee: null,
            custom_line_items: [],
            vat_included_default: false,
          })
          .select('*')
          .single()
        if (cancelled) return
        if (created) {
          const mapped = mapRow(created as Record<string, unknown>)
          setBudget(mapped)
          budgetIdRef.current = mapped.id
        }
      }
      if (!cancelled) setIsLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [projectId])

  // Stable debounced persist — references only refs, never stale state
  const persistDebounced = useCallback((next: ProjectBudget) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    setSaveStatus('saving')
    debounceRef.current = setTimeout(async () => {
      if (!budgetIdRef.current) return
      const supabase = createClient()
      const { error } = await supabase
        .from('project_budgets')
        .update({
          installation: next.installation,
          consultant_fee: next.consultantFee,
          custom_line_items: next.customLineItems,
          vat_included_default: next.vatIncludedDefault,
          updated_at: new Date().toISOString(),
        })
        .eq('id', budgetIdRef.current)
      setSaveStatus(error ? 'error' : 'saved')
      if (!error) setTimeout(() => setSaveStatus(prev => prev === 'saved' ? 'idle' : prev), 2500)
    }, 500)
  }, [])

  function mutateBudget(updater: (prev: ProjectBudget) => ProjectBudget) {
    setBudget(prev => {
      if (!prev) return prev
      const next = updater(prev)
      persistDebounced(next)
      return next
    })
  }

  function setInstallation(v: BudgetInstallation) {
    mutateBudget(prev => ({ ...prev, installation: v }))
  }

  function setConsultantFee(v: BudgetConsultantFee | null) {
    mutateBudget(prev => ({ ...prev, consultantFee: v }))
  }

  function addCustomLineItem() {
    const newItem: BudgetCustomLineItem = {
      id: crypto.randomUUID(),
      name: '',
      amount: 0,
      vatApplies: true,
      shownToClient: true,
    }
    mutateBudget(prev => ({ ...prev, customLineItems: [...prev.customLineItems, newItem] }))
  }

  function updateCustomLineItem(id: string, patch: Partial<BudgetCustomLineItem>) {
    mutateBudget(prev => ({
      ...prev,
      customLineItems: prev.customLineItems.map(item => item.id === id ? { ...item, ...patch } : item),
    }))
  }

  function removeCustomLineItem(id: string) {
    mutateBudget(prev => ({
      ...prev,
      customLineItems: prev.customLineItems.filter(item => item.id !== id),
    }))
  }

  function setVatIncludedDefault(v: boolean) {
    mutateBudget(prev => ({ ...prev, vatIncludedDefault: v }))
  }

  return {
    budget, saveStatus, isLoading,
    setInstallation, setConsultantFee,
    addCustomLineItem, updateCustomLineItem, removeCustomLineItem,
    setVatIncludedDefault,
  }
}
