/**
 * GET — the house style as the studio holds it: every rule, where it came
 * from and where it stands, and what Claude took from each sent proposal.
 * Any consultant: the house style belongs to the practice, not a project.
 */
import { NextResponse } from 'next/server'
import { houseStyle } from '@/lib/proposals/sends'
import { consultant, failure } from '@/lib/proposals/consultantRoute'

export const dynamic = 'force-dynamic'

export async function GET() {
  const who = await consultant()
  if (who instanceof NextResponse) return who
  try {
    return NextResponse.json(await houseStyle(who.db, who.userId))
  } catch (err) {
    return failure(err, 'The house style could not be loaded.')
  }
}
