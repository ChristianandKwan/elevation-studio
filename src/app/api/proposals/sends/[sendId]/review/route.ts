/** POST — ask Claude again to look back over a sent proposal (it had no starts left, say). */
import { NextResponse } from 'next/server'
import { askForReview } from '@/lib/proposals/sends'
import { studioUrlFor } from '@/lib/proposals/fire'
import { failure } from '@/lib/proposals/consultantRoute'
import { consultantAndSend } from '@/lib/proposals/sendRoute'

export const dynamic = 'force-dynamic'

export async function POST(request: Request, ctx: { params: Promise<{ sendId: string }> }) {
  const { sendId } = await ctx.params
  const found = await consultantAndSend(sendId)
  if (found instanceof NextResponse) return found
  try {
    const fired = await askForReview(found.who.db, found.send, studioUrlFor(request))
    return NextResponse.json({ started: fired.ok, notice: fired.ok ? null : fired.error })
  } catch (err) {
    return failure(err, 'Claude could not be asked.')
  }
}
