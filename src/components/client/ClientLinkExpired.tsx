import Image from 'next/image'

/**
 * Shown when a magic link resolves to a real token whose expiry has passed.
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
      <h1 className="client-expired-title">This link has expired</h1>
      <p className="client-expired-body">
        Preview links stay open for a limited time. This one has now closed, so the
        elevations it pointed to are no longer available here.
      </p>
      <p className="client-expired-body">
        Nothing has been lost — get in touch with Christian &amp; Kwan and they will
        send you a fresh link to the same project.
      </p>
    </div>
  )
}
