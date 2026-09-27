import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { isEngineRequest } from './engineAuth'
import { getProposal, type ProposalRow } from './store'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * The shape of every /api/engine route: the engine's secret or nothing, the
 * proposal found or a 404, and any failure reported as a sentence the
 * engine can read back and act on.
 */
export async function engineRoute(
  request: Request,
  proposalId: string | null,
  handle: (db: SupabaseClient, proposal: ProposalRow | null) => Promise<unknown>,
) {
  if (!isEngineRequest(request)) {
    return NextResponse.json({ error: 'Not the proposal engine' }, { status: 401 })
  }
  const db = createServiceClient()
  let proposal: ProposalRow | null = null
  if (proposalId) {
    proposal = await getProposal(db, proposalId)
    if (!proposal) return NextResponse.json({ error: 'No such proposal' }, { status: 404 })
  }
  try {
    return NextResponse.json(await handle(db, proposal))
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Something went wrong'
    console.error('[engine]', request.method, new URL(request.url).pathname, message)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export async function jsonBody(request: Request): Promise<Record<string, unknown>> {
  const body = await request.json().catch(() => null)
  return typeof body === 'object' && body !== null ? body as Record<string, unknown> : {}
}
