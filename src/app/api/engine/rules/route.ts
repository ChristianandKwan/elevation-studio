/** GET — every house-style rule in force, for the engine to follow this run. */
import { engineRoute } from '@/lib/proposals/engineRoute'
import { rulesInForce } from '@/lib/proposals/store'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  return engineRoute(request, null, db => rulesInForce(db))
}
