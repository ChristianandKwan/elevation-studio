'use client'

/**
 * A small arc spinner that sits in a line of text, or anywhere that is not a
 * photograph.
 *
 * ArcSpinner is an overlay for photographs: a ring and the C&K mark on a
 * frosted disc, filling and centring itself in its nearest positioned
 * ancestor. Put anywhere else it came loose and floated mid-screen (the
 * export pack, the proposal's status line), vanished white on cream (the
 * budget, the client link), or outgrew what it sat in (the upload button).
 *
 * This is the same arc and the same motion (ck-arc-rotate, ck-arc-dash in
 * globals.css), drawn in the colour of the text around it, with no disc and
 * no mark.
 *
 * It fades in after 0.4s (ck-spinner-in), so a wait that is over sooner shows
 * no spinner at all. Pass `immediate` where it stands beside words describing
 * a long job, which appear at once and should not arrive without it.
 */
export function InlineSpinner({ size, immediate = false }: { size: number; immediate?: boolean }) {
  const rotate = 'ck-arc-rotate 1.6s linear infinite'
  return (
    <svg
      viewBox="0 0 84 84"
      width={size}
      height={size}
      aria-hidden="true"
      style={{
        flexShrink: 0,
        verticalAlign: 'middle',
        animation: immediate ? rotate : `${rotate}, ck-spinner-in 0.2s ease 0.4s both`,
      }}
    >
      <circle cx="42" cy="42" r="38" fill="none" stroke="currentColor" strokeOpacity="0.15" strokeWidth="6" />
      <circle
        cx="42" cy="42" r="38" fill="none" stroke="currentColor" strokeWidth="6"
        strokeLinecap="round" transform="rotate(-90 42 42)"
        style={{ animation: 'ck-arc-dash 1.6s ease-in-out infinite' }}
      />
    </svg>
  )
}
