/**
 * Where Claude's look back over a sent proposal stands (040). Kept apart
 * from sends.ts so it can be tested without the database.
 */

/** A review that was asked for this long ago and never reported has stopped. */
export const REVIEW_STALLED_MS = 45 * 60_000

interface ReviewTimes {
  review_asked_at: string | null
  reviewed_at: string | null
  review_error: string | null
}

/**
 * done: it reported after it was last asked · working: asked recently ·
 * waiting: it could not start, or went quiet · not-started: never asked.
 */
export function reviewState(send: ReviewTimes, now = Date.now()): 'done' | 'working' | 'waiting' | 'not-started' {
  const at = (iso: string | null) => (iso ? new Date(iso).getTime() : 0)
  if (send.reviewed_at && at(send.reviewed_at) >= at(send.review_asked_at)) return 'done'
  if (send.review_error) return 'waiting'
  if (!send.review_asked_at) return 'not-started'
  return now - at(send.review_asked_at) < REVIEW_STALLED_MS ? 'working' : 'waiting'
}
