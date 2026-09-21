/**
 * Telling a failed load apart from an empty one.
 *
 * Every screen here loads several tables at once and reads `data` while
 * ignoring `error`. When a query fails, `data` is null, `?? []` turns it into
 * an empty list, and the screen renders a project with no works, no index and
 * no notes. It looks exactly like data loss, and it is not: the rows are
 * fine, the query never ran.
 *
 * That is not hypothetical. Migration `034` added `set_aside`; before it had
 * been run, the deployed code asked for a column the database did not have,
 * the select 400'd, and every project went blank. The data was untouched the
 * whole time and there was nothing on screen to say so.
 *
 * So the rule is: a screen may render empty only when the database said
 * empty. Anything else says it could not load.
 */

/** The shape every Supabase query result shares, narrowed to what matters. */
export interface LoadResult {
  error: { message: string } | null
}

export interface LoadFailure {
  /** Which load failed, in words a consultant would recognise. */
  what: string
  /** The database's own message. Shown small — it is for whoever is fixing it. */
  detail: string
}

/**
 * The first of these loads that failed, or null if they all ran.
 *
 * Labelled rather than positional: "works" in the message is worth the extra
 * word at each call site, because the person reading it is usually trying to
 * work out which deploy went out of order.
 */
export function firstLoadFailure(
  loads: Array<[what: string, result: LoadResult | null | undefined]>,
): LoadFailure | null {
  for (const [what, result] of loads) {
    const error = result?.error
    if (error) return { what, detail: error.message ?? 'Unknown error' }
  }
  return null
}

/**
 * Whether a failure looks like the app and the database being out of step.
 *
 * Postgres reports an unknown column as `42703`, and PostgREST passes the
 * message through — that is the deploy-order case specifically, and it is
 * worth naming because the fix is "run the migration", not "call someone".
 */
export function looksLikeSchemaDrift(failure: LoadFailure): boolean {
  return /column .* does not exist|42703|schema cache/i.test(failure.detail)
}
