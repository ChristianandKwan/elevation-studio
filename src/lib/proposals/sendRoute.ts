import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { isEngineRequest } from './engineAuth'
import { getSend, type SendRow } from './sends'
import { consultantAndProposal, type Consultant } from './consultantRoute'
import type { ProposalRow } from './store'
import type { SupabaseClient } from '@supabase/supabase-js'

/** The engine's routes about a sent proposal: its secret, the send, and a readable failure. */
export async function engineSendRoute(
  request: Request, sendId: string,
  handle: (db: SupabaseClient, send: SendRow) => Promise<unknown>,
) {
  if (!isEngineRequest(request)) {
    return NextResponse.json({ error: 'Not the proposal engine' }, { status: 401 })
  }
  const db = createServiceClient()
  const send = await getSend(db, sendId)
  if (!send) return NextResponse.json({ error: 'No such send' }, { status: 404 })
  try {
    return NextResponse.json(await handle(db, send))
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Something went wrong'
    console.error('[engine]', request.method, new URL(request.url).pathname, message)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

/** The consultant, the send, and its proposal, when the proposal's project is theirs. */
export async function consultantAndSend(
  sendId: string,
): Promise<{ who: Consultant; proposal: ProposalRow; send: SendRow } | NextResponse> {
  const send = await getSend(createServiceClient(), sendId)
  if (!send) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const found = await consultantAndProposal(send.proposal_id)
  if (found instanceof NextResponse) return found
  return { ...found, send }
}
