'use client'

/**
 * A small arc spinner that sits in a line of text.
 *
 * ArcSpinner is an overlay for photographs: white, with a white halo and the
 * C&K mark, filling and centring itself in its nearest positioned ancestor.
 * Put in the proposal's status line it spread over the whole window and sat
 * mid-screen over the cover (Tom) — and even contained, white on the chat's
 * warm white would not have shown, nor a 13px "C&K" fitted in 14px.
 *
 * This is the same arc and the same motion (ck-arc-rotate, ck-arc-dash in
 * globals.css), drawn in the colour of the text around it, with no halo and
 * no mark.
 */
export function InlineSpinner({ size }: { size: number }) {
  return (
    <svg
      viewBox="0 0 84 84"
      width={size}
      height={size}
      aria-hidden="true"
      style={{ flexShrink: 0, verticalAlign: 'middle', animation: 'ck-arc-rotate 1.6s linear infinite' }}
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
