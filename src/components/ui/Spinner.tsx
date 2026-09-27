/**
 * Spinner.tsx — Elevation Studio loading states
 *
 * Two components:
 *   <DrawLoader />   — Full-page transition screen (login→dashboard, dashboard→project).
 *                      Strokes the C&K circle in, fades in the mark, then loops.
 *
 *   <ArcSpinner />   — Overlay on an elevation photograph while it loads (studio wall,
 *                      client wall). Arc sweeps fully around then retracts from the
 *                      trailing end, on a frosted disc so it reads on any wall.
 *                      Photographs only: everywhere else, InlineSpinner.
 *
 * Both use design tokens from globals.css.
 */

'use client'

import React from 'react'

/* ─────────────────────────────────────────
   DRAW LOADER
   Full-page overlay. Use for page transitions.
   Mount it, then unmount once data is ready.
───────────────────────────────────────── */
export function DrawLoader({ label, variant = 'dark' }: { label?: string; variant?: 'dark' | 'cream' }) {
  const isCream = variant === 'cream'
  const bg = isCream ? '#F7F4EF' : '#1C1A18'
  const markColor = isCream ? '#1C1A18' : '#FDFBF9'
  const strokeColor = isCream ? 'rgba(28,26,24,0.85)' : 'rgba(253,251,249,0.85)'
  const captionColor = isCream ? 'rgba(28,26,24,0.3)' : 'rgba(255,255,255,0.3)'
  return (
    <div style={{ ...drawStyles.overlay, background: bg }}>
      <div style={drawStyles.inner}>
        <div style={drawStyles.wrap}>
          <svg
            viewBox="0 0 80 80"
            style={drawStyles.svg}
          >
            <circle
              cx="40" cy="40" r="38"
              fill="none"
              stroke={strokeColor}
              strokeWidth="0.6"
              strokeLinecap="round"
              style={{ animation: 'ck-draw-circle 2.2s ease-in-out infinite' }}
            />
          </svg>
          <span style={{ ...drawStyles.label, color: markColor, animation: 'ck-draw-label 2.2s ease-in-out infinite' }}>
            C&amp;K
          </span>
        </div>
        {label && <p style={{ ...drawStyles.caption, color: captionColor }}>{label}</p>}
      </div>
    </div>
  )
}

const drawStyles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: '#1C1A18',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  inner: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 20,
  },
  wrap: {
    width: 240,
    height: 240,
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  svg: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    transform: 'rotate(-90deg)',
  },
  label: {
    fontFamily: "'Cormorant Garamond', serif",
    fontSize: 57,
    fontWeight: 400,
    color: '#FDFBF9',
    letterSpacing: '0.03em',
    userSelect: 'none',
    position: 'relative',
    zIndex: 1,
    opacity: 0,
  },
  caption: {
    fontFamily: "'Karla', sans-serif",
    fontSize: 14,
    fontWeight: 500,
    letterSpacing: '0.14em',
    textTransform: 'uppercase' as const,
    color: 'rgba(255,255,255,0.3)',
  },
}


/* ─────────────────────────────────────────
   ARC SPINNER
   Overlay on a photograph. Renders centred on
   its container — give the parent position:relative.

   Usage:
     <div style={{ position: 'relative' }}>
       <img … />
       {loading && <ArcSpinner imageRef={imgRef} />}
     </div>

   imageRef: ref to the underlying <img> — used to
             sample centre luminance and auto-pick
             dark vs light spinner. Falls back to
             'light' (white) if canvas is unavailable.
───────────────────────────────────────── */

function sampleCentreLuminance(img: HTMLImageElement): 'light' | 'dark' {
  try {
    const canvas = document.createElement('canvas')
    const S = 40 // sample square size
    canvas.width = S; canvas.height = S
    const ctx = canvas.getContext('2d')!
    // draw centre crop
    const sx = (img.naturalWidth  - S) / 2
    const sy = (img.naturalHeight - S) / 2
    ctx.drawImage(img, sx, sy, S, S, 0, 0, S, S)
    const { data } = ctx.getImageData(0, 0, S, S)
    let sum = 0
    for (let i = 0; i < data.length; i += 4) {
      // perceived luminance (sRGB)
      sum += 0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2]
    }
    const avg = sum / (data.length / 4)
    return avg > 140 ? 'dark' : 'light' // light bg → dark spinner
  } catch {
    return 'light'
  }
}

export function ArcSpinner({
  imageRef,
}: {
  imageRef?: React.RefObject<HTMLImageElement | null>
}) {
  const [variant, setVariant] = React.useState<'light' | 'dark'>('light')

  React.useEffect(() => {
    const img = imageRef?.current
    if (!img) return
    const run = () => setVariant(sampleCentreLuminance(img))
    if (img.complete) run()
    else img.addEventListener('load', run, { once: true })
  }, [imageRef])

  const isDark = variant === 'dark'
  const stroke = isDark ? '#1C1A18' : '#FDFBF9'
  const trackStroke = isDark ? 'rgba(28,26,24,0.14)' : 'rgba(253,251,249,0.18)'
  const disc = isDark ? 'rgba(253,251,249,0.72)' : 'rgba(28,26,24,0.5)'

  return (
    <div style={arcStyles.overlay}>
      <div style={{ ...arcStyles.disc, background: disc }}>
        <div style={{ width: SIZE, height: SIZE, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg viewBox="0 0 84 84" style={{ ...arcStyles.svg, animation: 'ck-arc-rotate 1.6s linear infinite' }}>
            <circle cx="42" cy="42" r="40" fill="none" stroke={trackStroke} strokeWidth="1.5" />
            <circle cx="42" cy="42" r="40" fill="none" stroke={stroke} strokeWidth="1.5"
              strokeLinecap="round" transform="rotate(-90 42 42)"
              style={{ animation: 'ck-arc-dash 1.6s ease-in-out infinite' }} />
          </svg>
          <span style={{ ...arcStyles.label, color: stroke }}>C&amp;K</span>
        </div>
      </div>
    </div>
  )
}

/* One size: the mark is 13px and the ring is drawn for it. Smaller, the
   letters crowd the ring and the hairline breaks up — which is why anything
   that is not a photograph uses InlineSpinner instead. */
const SIZE = 56

const arcStyles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    pointerEvents: 'none',
    // Waits of under 0.4s (a wall already downloaded) show no spinner at all.
    animation: 'ck-spinner-in 0.2s ease 0.4s both',
  },
  // A frosted disc, so the ring reads on a busy wall as well as a plain one:
  // the soft glow it replaced was lost wherever the ring crossed several colours.
  disc: {
    width: Math.round(SIZE * 1.35),
    height: Math.round(SIZE * 1.35),
    borderRadius: '50%',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    boxShadow: '0 2px 14px rgba(0,0,0,.12)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  svg: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
  },
  label: {
    fontFamily: "'Cormorant Garamond', serif",
    fontSize: 13,
    fontWeight: 400,
    letterSpacing: '0.03em',
    userSelect: 'none' as const,
    position: 'relative' as const,
    zIndex: 1,
  },
}
