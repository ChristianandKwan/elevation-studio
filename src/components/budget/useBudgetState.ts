'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useSaver } from '@/hooks/useSaver'
import { newChoice, readChoices, readPicks } from './choices'
import { parseCurrency } from '@/lib/lineItems'
import type {
  ProjectBudget, BudgetInstallation, BudgetConsultantFee, BudgetCustomLineItem,
  BudgetChoice, BudgetChoiceKind, BudgetChoicePick, Currency,
} from '@/types'

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export interface UseBudgetStateResult {
  budget: ProjectBudget | null
  saveStatus: SaveStatus
  isLoading: boolean
  /** The budget could not be fetched (or created). `retry` tries again. */
  loadFailed: boolean
  retry: () => void
  setInstallation: (v: BudgetInstallation) => void
  setConsultantFee: (v: BudgetConsultantFee | null) => void
  addCustomLineItem: () => void
  updateCustomLineItem: (id: string, patch: Partial<BudgetCustomLineItem>) => void
  removeCustomLineItem: (id: string) => void
  setVatIncludedDefault: (v: boolean) => void
  /** The second currency this project's budget can be shown in, or null (042). */
  setClientCurrency: (v: Currency | null) => void
  /** Adds a choice of this kind and returns its id, for the editor to open on. */
  addChoice: (kind: BudgetChoiceKind) => string
  updateChoice: (id: string, update: (prev: BudgetChoice) => BudgetChoice) => void
  removeChoice: (id: string) => void
  /**
   * Picks an alternative (null clears the pick). Shown at once, saved after,
   * and put back if the save fails. Resolves to whether it saved.
   */
  pickChoice: (choiceId: string, alternativeId: string | null) => Promise<boolean>
}

/**
 * Where a pick is saved. The studio writes the pick row itself; the portal
 * passes a function that asks its server route.
 */
export type SavePick = (choiceId: string, alternativeId: string | null) => Promise<boolean>

export function mapRow(row: Record<string, unknown>, pickRows?: ReadonlyArray<Record<string, unknown>> | null): ProjectBudget {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    installation: (row.installation ?? { indicative: true, confirmedAmount: null }) as BudgetInstallation,
    consultantFee: (row.consultant_fee ?? null) as BudgetConsultantFee | null,
    customLineItems: (row.custom_line_items ?? []) as BudgetCustomLineItem[],
    choices: readChoices(row.choices),
    choicePicks: readPicks(pickRows),
    clientCurrency: row.client_currency == null ? null : parseCurrency(row.client_currency),
    vatIncludedDefault: (row.vat_included_default ?? false) as boolean,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

/**
 * @param initialBudget  When provided (client portal), the row has already been
 *   fetched server-side and the hook skips Supabase entirely — the browser
 *   there holds no database access. `undefined` keeps the consultant
 *   behaviour: load on mount, lazy-create, and persist edits.
 */
export function useBudgetState(
  projectId: string,
  initialBudget?: ProjectBudget | null,
  savePick?: SavePick,
): UseBudgetStateResult {
  const serverProvided = initialBudget !== undefined
  const [budget, setBudget] = useState<ProjectBudget | null>(initialBudget ?? null)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [isLoading, setIsLoading] = useState(!serverProvided)
  const [loadFailed, setLoadFailed] = useState(false)
  // Bumped to load again: the Try again button, or the connection coming back.
  const [attempt, setAttempt] = useState(0)
  const retry = useCallback(() => setAttempt(n => n + 1), [])
  const budgetIdRef = useRef<string | null>(initialBudget?.id ?? null)

  // Load on mount — lazy-create row if none exists
  useEffect(() => {
    if (serverProvided) return
    let cancelled = false
    async function load() {
      setIsLoading(true)
      setLoadFailed(false)
      const supabase = createClient()

      const [{ data: existing, error: readErr }, { data: pickRows, error: picksErr }] = await Promise.all([
        supabase
          .from('project_budgets')
          .select('*')
          .eq('project_id', projectId)
          .maybeSingle(),
        supabase
          .from('budget_choice_picks')
          .select('choice_id, alternative_id, picked_by, picked_at')
          .eq('project_id', projectId),
      ])

      if (cancelled) return

      // A read that failed (no connection, a timeout) says nothing about
      // whether the row exists, so it must not fall through to creating one.
      if (readErr || picksErr) {
        console.error('[useBudgetState] Failed to load budget row:', readErr ?? picksErr)
        setLoadFailed(true)
        setIsLoading(false)
        return
      }

      if (existing) {
        const mapped = mapRow(existing as Record<string, unknown>, pickRows as Array<Record<string, unknown>>)
        setBudget(mapped)
        budgetIdRef.current = mapped.id
      } else {
        const { data: created, error: insertErr } = await supabase
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
        if (insertErr) {
          console.error('[useBudgetState] Failed to create budget row:', insertErr)
        }
        if (created) {
          const mapped = mapRow(created as Record<string, unknown>)
          setBudget(mapped)
          budgetIdRef.current = mapped.id
        } else {
          setLoadFailed(true)
        }
      }
      if (!cancelled) setIsLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [projectId, serverProvided, attempt])

  // Back online after a failed load: try again without being asked.
  useEffect(() => {
    if (!loadFailed) return
    window.addEventListener('online', retry)
    return () => window.removeEventListener('online', retry)
  }, [loadFailed, retry])

  // Written through the shared saver (src/lib/saver.ts): once typing pauses,
  // in order, and before an export or on leaving — none of which this had on
  // its own. Never in the client portal, where the row came from the server
  // and the browser cannot write to project_budgets.
  const saver = useSaver<ProjectBudget>(async (budgetId, next) => {
    const supabase = createClient()
    const { error } = await supabase
      .from('project_budgets')
      .update({
        installation: next.installation,
        consultant_fee: next.consultantFee,
        custom_line_items: next.customLineItems,
        // Never the picks: they are rows of their own (041), so a page opened
        // before the client picked cannot write the pick away.
        choices: next.choices,
        client_currency: next.clientCurrency,
        vat_included_default: next.vatIncludedDefault,
        updated_at: new Date().toISOString(),
      })
      .eq('id', budgetId)
    setSaveStatus(error ? 'error' : 'saved')
    if (!error) setTimeout(() => setSaveStatus(prev => prev === 'saved' ? 'idle' : prev), 2500)
  }, { delayMs: 500 })

  const persistDebounced = useCallback((next: ProjectBudget) => {
    if (serverProvided || !budgetIdRef.current) return
    setSaveStatus('saving')
    saver.save(budgetIdRef.current, next)
  }, [serverProvided, saver])

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

  function setClientCurrency(v: Currency | null) {
    mutateBudget(prev => ({ ...prev, clientCurrency: v === 'GBP' ? null : v }))
  }

  function addChoice(kind: BudgetChoiceKind): string {
    const choice = newChoice(kind)
    mutateBudget(prev => ({ ...prev, choices: [...prev.choices, choice] }))
    return choice.id
  }

  function updateChoice(id: string, update: (prev: BudgetChoice) => BudgetChoice) {
    mutateBudget(prev => ({
      ...prev,
      choices: prev.choices.map(c => (c.id === id ? update(c) : c)),
    }))
  }

  function removeChoice(id: string) {
    mutateBudget(prev => ({ ...prev, choices: prev.choices.filter(c => c.id !== id) }))
    // Its pick row would be harmless, since nothing reads a pick without its
    // choice, but it is tidier gone. Best-effort.
    if (!serverProvided) {
      void createClient().from('budget_choice_picks').delete().eq('project_id', projectId).eq('choice_id', id)
    }
  }

  // Picks are shown at once and never go through the saver: they are not
  // part of the budget row, and a pick is one decision, not typing.
  function setPickLocal(choiceId: string, pick: BudgetChoicePick | null) {
    setBudget(prev => {
      if (!prev) return prev
      const choicePicks = { ...prev.choicePicks }
      if (pick) choicePicks[choiceId] = pick
      else delete choicePicks[choiceId]
      return { ...prev, choicePicks }
    })
  }

  async function savePickHere(choiceId: string, alternativeId: string | null): Promise<boolean> {
    const supabase = createClient()
    const { error } = alternativeId
      ? await supabase.from('budget_choice_picks').upsert({
        project_id: projectId,
        choice_id: choiceId,
        alternative_id: alternativeId,
        picked_by: 'us',
        picked_at: new Date().toISOString(),
      }, { onConflict: 'project_id,choice_id' })
      : await supabase.from('budget_choice_picks').delete().eq('project_id', projectId).eq('choice_id', choiceId)
    if (error) console.error('[useBudgetState] Failed to save pick:', error)
    return !error
  }

  async function pickChoice(choiceId: string, alternativeId: string | null): Promise<boolean> {
    const before = budget?.choicePicks[choiceId] ?? null
    setPickLocal(choiceId, alternativeId
      ? { alternativeId, by: serverProvided ? 'client' : 'us', at: new Date().toISOString() }
      : null)
    const save = savePick ?? (serverProvided ? null : savePickHere)
    const ok = save ? await save(choiceId, alternativeId) : false
    if (!ok) setPickLocal(choiceId, before)
    return ok
  }

  return {
    budget, saveStatus, isLoading, loadFailed, retry,
    setInstallation, setConsultantFee,
    addCustomLineItem, updateCustomLineItem, removeCustomLineItem,
    setVatIncludedDefault,
    setClientCurrency,
    addChoice, updateChoice, removeChoice, pickChoice,
  }
}
