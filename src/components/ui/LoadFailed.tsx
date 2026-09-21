'use client'

/**
 * What a screen shows when its data could not be loaded.
 *
 * The first thing it says is that nothing has been lost, because the failure
 * this exists for looks precisely like everything having been lost — a
 * project with no works, no index and no notes. See src/lib/loadGuard.ts.
 *
 * The second thing it says is what to do, which is almost always "wait a
 * moment and try again": the usual cause is a deploy and a migration passing
 * each other, and it resolves on its own.
 */
export default function LoadFailed({
  what, detail, schemaDrift = false, audience = 'consultant',
}: {
  what: string
  detail: string
  /** The app is asking for something the database does not have yet. */
  schemaDrift?: boolean
  /**
   * Who is looking.
   *
   * A client gets no database message and no link into the studio: the
   * message is theirs to act on, and "column does not exist" is neither
   * theirs to read nor ours to show them.
   */
  audience?: 'consultant' | 'client'
}) {
  if (audience === 'client') {
    return (
      <div className="load-failed">
        <div className="load-failed-card">
          <h1 className="load-failed-title">This didn&apos;t load</h1>
          <p className="load-failed-lead">
            Your proposal could not be shown just now. Nothing is wrong with
            it — please try again in a moment.
          </p>
          <div className="load-failed-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => window.location.reload()}
            >
              Try again
            </button>
          </div>
          <p className="load-failed-body">
            If it keeps happening, let your consultant know.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="load-failed">
      <div className="load-failed-card">
        <h1 className="load-failed-title">This didn&apos;t load</h1>

        <p className="load-failed-lead">
          <strong>Nothing has been lost.</strong> The {what} could not be
          fetched just now, so there is nothing to show — but the project and
          everything in it are untouched.
        </p>

        <p className="load-failed-body">
          {schemaDrift
            ? 'The app is asking the database for something it does not have yet. That happens for a few minutes when an update goes out before its database change. It fixes itself.'
            : 'This is usually a brief interruption between the app and the database. Trying again generally works.'}
        </p>

        <div className="load-failed-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => window.location.reload()}
          >
            Try again
          </button>
          <a className="btn" href="/dashboard">Back to projects</a>
        </div>

        {/* Small, and last. Nobody reading the paragraphs above needs this,
            and whoever does need it needs it exactly. */}
        <p className="load-failed-detail">{detail}</p>
      </div>
    </div>
  )
}
