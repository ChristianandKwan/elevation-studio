/** GET — house-style rules approved but not yet written into the design system. */
import { engineRoute } from '@/lib/proposals/engineRoute'
import { approvedRules } from '@/lib/proposals/store'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  return engineRoute(request, null, db => approvedRules(db))
}
