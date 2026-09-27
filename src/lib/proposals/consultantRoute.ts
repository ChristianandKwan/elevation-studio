import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getProposal, type ProposalRow } from './store'

export interface Consultant {
  userId: string
  name: string
  db: SupabaseClient
}

/**
 * The signed-in consultant, or a response to return instead. The ownership
 * check reads through the user-scoped client, where RLS enforces
 * consultant-owns-project; the work afterwards uses the service role, as the
 * export route does. `middleware.ts` excludes /api/, so this is the check.
 */
export async function consultant(projectId?: string): Promise<Consultant | NextResponse> {
  const userClient = await createClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (projectId) {
    const { data: owned } = await userClient.from('projects').select('id').eq('id', projectId).maybeSingle()
    if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const { data: profile } = await userClient.from('profiles').select('name').eq('id', user.id).maybeSingle()
  return { userId: user.id, name: profile?.name ?? '', db: createServiceClient() }
}

/** The consultant and the proposal, when the proposal's project is theirs. */
export async function consultantAndProposal(
  proposalId: string,
): Promise<{ who: Consultant; proposal: ProposalRow } | NextResponse> {
  const service = createServiceClient()
  const proposal = await getProposal(service, proposalId)
  if (!proposal) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const who = await consultant(proposal.project_id)
  if (who instanceof NextResponse) return who
  return { who, proposal }
}

export function failure(err: unknown, fallback: string) {
  const message = err instanceof Error ? err.message : fallback
  console.error('[proposals]', message)
  return NextResponse.json({ error: message }, { status: 500 })
}
