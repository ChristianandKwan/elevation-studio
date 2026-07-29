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
 * Deliberately has no contact form or email address: the client already knows
 * who sent them the link, and anything more would be another surface to keep
 * working.
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
        The elevations it pointed to are not available at this address any more.
        That usually means the link has been replaced by a newer one.
      </p>
      <p className="client-expired-body">
        Nothing has been lost — get in touch with Christian &amp; Kwan and they will
        send you a current link to the same project.
      </p>
    </div>
  )
}
