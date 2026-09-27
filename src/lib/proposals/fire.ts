/**
 * Start a run of the proposal engine.
 *
 * The engine is a Claude Code routine with an API trigger: POSTing to its
 * /fire URL with its token starts a new cloud session, which reads the
 * proposal id from the `text` we send and does the rest (see ENGINE.md in
 * ChristianandKwan/proposal-design-system).
 *
 * Each fire is one run against the account's daily routine allowance (five a
 * day on Pro), so the studio fires only when no run is listening: a new
 * proposal, or a message after the engine has gone quiet. A running engine
 * picks messages up itself.
 */
/**
 * Said to the consultant when Anthropic refuses another start. The daily
 * cap and the hourly one both answer 429, and "for now" is true of both.
 * Honest and unembarrassed, as Tom asked: this is a small practice on
 * Tom's own Claude plan.
 */
export const DAILY_LIMIT_MESSAGE =
  'Claude can’t start again just now — Tom’s Claude plan allows a limited number of starts a day, and they’re used up. Your message is saved: write again later (or tomorrow) and Claude will pick everything up.'

/** Starts a day on Tom's plan: 5 on Pro, 15 on Max. Set PROPOSAL_DAILY_STARTS after an upgrade. */
export function dailyStartLimit(): number {
  const n = Number(process.env.PROPOSAL_DAILY_STARTS)
  return Number.isInteger(n) && n > 0 ? n : 5
}

export interface FireResult {
  ok: boolean
  runUrl?: string
  error?: string
}

export async function fireEngine(proposalId: string, studioUrl: string): Promise<FireResult> {
  const url = process.env.PROPOSAL_ROUTINE_URL
  const token = process.env.PROPOSAL_ROUTINE_TOKEN
  if (!url || !token) {
    return { ok: false, error: 'The proposal engine is not set up yet (PROPOSAL_ROUTINE_URL / PROPOSAL_ROUTINE_TOKEN).' }
  }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ text: JSON.stringify({ proposal: proposalId, studio: studioUrl }) }),
    })
    const body = await res.json().catch(() => ({})) as Record<string, unknown>
    if (!res.ok) {
      const err = (body.error as { message?: string } | undefined)?.message
      if (res.status === 429) {
        return { ok: false, error: DAILY_LIMIT_MESSAGE }
      }
      return { ok: false, error: err ?? `The proposal engine could not be started (${res.status}).` }
    }
    return { ok: true, runUrl: typeof body.claude_code_session_url === 'string' ? body.claude_code_session_url : undefined }
  } catch {
    return { ok: false, error: 'The proposal engine could not be reached.' }
  }
}

/**
 * Whether a run already has this proposal, so a new message should wait for
 * it rather than start another.
 *
 * A run checks in when it starts and every 50 seconds while it waits for the
 * consultant — but not while it is building, which can take several minutes.
 * So "alive" is generous: a run that took the job, or was started for it, in
 * the last twelve minutes and has not said it stopped. A message is never
 * lost either way; it waits in the table until a run picks it up.
 */
export const ENGINE_ALIVE_MS = 12 * 60_000

export function engineIsAlive(
  status: string,
  engineSeenAt: string | null,
  firedAt: string | null,
  now = Date.now(),
): boolean {
  if (status === 'resting' || status === 'failed') return false
  const last = Math.max(
    engineSeenAt ? new Date(engineSeenAt).getTime() : 0,
    firedAt ? new Date(firedAt).getTime() : 0,
  )
  return last > 0 && now - last < ENGINE_ALIVE_MS
}

/**
 * The address the engine should call back: the one the consultant is using.
 *
 * Not `new URL(request.url).origin` — on Vercel that is the deployment's own
 * address (elevation-studio-<hash>-….vercel.app), which sits behind Vercel's
 * login and is not the host the engine's credential is attached to. The
 * first real run was handed exactly that and could not have reached it. The
 * domain the browser asked for arrives as x-forwarded-host.
 * PROPOSAL_STUDIO_URL overrides both.
 */
export function studioUrlFor(request: Request): string {
  const configured = process.env.PROPOSAL_STUDIO_URL?.replace(/\/+$/, '')
  if (configured) return configured
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
  if (host) return `https://${host.split(',')[0].trim()}`
  return new URL(request.url).origin
}
