/**
 * The decisions as the database holds them now, for the server's "is the
 * project approved?" after a client approves or picks (src/lib/decisions.ts).
 *
 * Takes any Supabase client: the portal's server route passes the service
 * client, and the studio passes the consultant's own, whose policies already
 * let them read all of this for their projects.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { BudgetChoice, BudgetChoicePicks } from '@/types'
import { sortOptions } from '@/lib/options'
import { readChoices, readPicks } from '@/components/budget/choices'
import type { DecisionElevation } from '@/lib/decisions'

export interface DecisionState {
  elevations: DecisionElevation[]
  choices: BudgetChoice[]
  picks: BudgetChoicePicks
}

interface OptionRow {
  option: string
  sort_order: number | null
  created_at: string | null
  image_path: string | null
  wall_color: string | null
  approved: boolean | null
  artworks: Array<{ work_id: string | null; visible: boolean | null }> | null
}

/** Null when any read fails: a missing answer must never be taken for "not approved". */
export async function loadDecisionState(supabase: SupabaseClient, projectId: string): Promise<DecisionState | null> {
  const [elevRes, budgetRes, picksRes] = await Promise.all([
    supabase
      .from('elevations')
      .select('id, name, display_order, client_picked_option, elevation_options(option, sort_order, created_at, image_path, wall_color, approved, artworks(work_id, visible))')
      .eq('project_id', projectId)
      .eq('visible_to_client', true)
      .order('display_order', { ascending: true }),
    supabase.from('project_budgets').select('choices').eq('project_id', projectId).maybeSingle(),
    supabase.from('budget_choice_picks').select('choice_id, alternative_id, picked_by, picked_at').eq('project_id', projectId),
  ])
  if (elevRes.error || budgetRes.error || picksRes.error) return null

  const elevations: DecisionElevation[] = (elevRes.data ?? []).map(e => ({
    id: e.id as string,
    name: e.name as string,
    clientPickedOption: (e.client_picked_option as string | null) ?? null,
    options: sortOptions((e.elevation_options ?? []) as OptionRow[]).map(o => ({
      key: o.option,
      hasWall: !!o.image_path || !!o.wall_color,
      approved: !!o.approved,
      artworks: (o.artworks ?? [])
        .filter(a => a.work_id)
        .map(a => ({ workId: a.work_id as string, visible: a.visible !== false })),
    })),
  }))

  return {
    elevations,
    choices: readChoices(budgetRes.data?.choices),
    picks: readPicks(picksRes.data as Array<Record<string, unknown>>),
  }
}
