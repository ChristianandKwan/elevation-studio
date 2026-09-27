import { timingSafeEqual } from 'node:crypto'

/**
 * Is this request from the proposal engine?
 *
 * The engine is a Claude Code routine in Anthropic's cloud. It never logs in:
 * the cloud environment holds PROPOSAL_ENGINE_SECRET as an API credential and
 * attaches it to every request for the studio's host, so the engine itself
 * never sees the value. Fails closed when the secret is not configured.
 */
export function isEngineRequest(request: Request): boolean {
  const secret = process.env.PROPOSAL_ENGINE_SECRET
  if (!secret) return false
  const header = request.headers.get('authorization') ?? ''
  const given = Buffer.from(header)
  const expected = Buffer.from(`Bearer ${secret}`)
  return given.length === expected.length && timingSafeEqual(given, expected)
}
