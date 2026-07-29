import Image from 'next/image'

/**
 * Shown when a magic link resolves to a real token whose expiry has passed.
 *
 * That covers two cases and the copy has to be true of both: a link that ran
 * out its 90 days, and one the consultant deliberately replaced (which retires
 * the row by setting `expires_at` to now — see `regenerateShareToken`). So no
 * mention of time running out.
 *
 * A genuinely unknown token still falls through to `notFound()` — only links
 * that once worked get an explanation, so a mistyped URL cannot be used to
 * confirm that a project exists.
 *
 * The address is the shared info@ inbox rather than the consultant on the
 * project: this page has no session and no token, so it cannot know who that
 * would be. A plain mailto, not a form — nothing here to keep working.
 */
export default function ClientLinkExpired() {
  return (
    <div className="client-expired">
      <Image
        src="/ck-wordmark-white.png"
        alt="Christian & Kwan"
        className="client-expired-logo"
        width={176}
        height={88}
        preload
      />
      <h1 className="client-expired-title">This link is no longer active</h1>
      <p className="client-expired-body">
        The link has either expired or has been replaced by a newer one. Nothing has
        been lost — just let us know on{' '}
        <a className="client-expired-email" href="mailto:info@christianandkwan.com">
          info@christianandkwan.com
        </a>{' '}
        and we can send you the current link to the project.
      </p>
    </div>
  )
}
