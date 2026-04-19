import { createClient, createServiceClient } from '@/lib/supabase/server'
import DashboardClient from '@/components/dashboard/DashboardClient'
import sharp from 'sharp'

const THUMB_W = 600 // max thumbnail width in pixels

async function fetchBuffer(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    return Buffer.from(await res.arrayBuffer())
  } catch {
    return null
  }
}

interface ArtworkEntry {
  url: string
  xF: number
  yF: number
  wCm: number
  hCm: number
  brightness?: number | null
  frameType?: string | null
  frameWidthMm?: number | null
  shadowAngle?: number | null
  shadowBlur?: number | null
  shadowOpacity?: number | null
}

const FRAME_COLORS: Record<string, { r: number; g: number; b: number }> = {
  black:      { r: 26,  g: 26,  b: 26  },
  white:      { r: 240, g: 237, b: 232 },
  'pale-wood': { r: 196, g: 168, b: 130 },
  'mid-wood':  { r: 125, g: 90,  b: 53  },
  'dark-wood': { r: 61,  g: 40,  b: 20  },
}

async function buildThumbnail(
  elevUrl: string,
  artworks: ArtworkEntry[],
  origW: number,
  origH: number,
  scalePxPerCm: number | null
): Promise<string | null> {
  try {
    const elevBuf = await fetchBuffer(elevUrl)
    if (!elevBuf) return null

    const scale = THUMB_W / origW
    const thumbH = Math.round(origH * scale)

    // If no scale, just return the plain elevation thumbnail
    if (!scalePxPerCm || artworks.length === 0) {
      const buf = await sharp(elevBuf).resize(THUMB_W, thumbH, { fit: 'fill' }).png().toBuffer()
      return `data:image/png;base64,${buf.toString('base64')}`
    }

    // Build composite overlays — shadows first, then framed artwork on top
    const compositeInputs: sharp.OverlayOptions[] = []

    for (const art of artworks) {
      try {
        const artBuf = await fetchBuffer(art.url)
        if (!artBuf) continue

        const artOrigW = Math.round(art.wCm * scalePxPerCm)
        const artOrigH = Math.round(art.hCm * scalePxPerCm)
        let artThumbW = Math.max(1, Math.round(artOrigW * scale))
        let artThumbH = Math.max(1, Math.round(artOrigH * scale))
        const left = Math.round(art.xF * THUMB_W)
        const top  = Math.round(art.yF * thumbH)

        // ── 1. Drop shadow ──────────────────────────────────────────────
        const shadowBlur    = art.shadowBlur    ?? 0
        const shadowOpacity = art.shadowOpacity ?? 0
        if (shadowBlur > 0 && shadowOpacity > 0) {
          try {
            // Build an artwork-shaped shadow: take the artwork's raw pixels,
            // set all RGB channels to 0 (black) while scaling alpha by shadowOpacity
            const { data: rawPixels, info } = await sharp(artBuf)
              .resize(artThumbW, artThumbH, { fit: 'fill' })
              .ensureAlpha()
              .raw()
              .toBuffer({ resolveWithObject: true })

            const pixels = new Uint8Array(rawPixels)
            for (let i = 0; i < pixels.length; i += 4) {
              pixels[i]     = 0   // R → black
              pixels[i + 1] = 0   // G → black
              pixels[i + 2] = 0   // B → black
              pixels[i + 3] = Math.round(pixels[i + 3] * shadowOpacity)  // A scaled
            }

            const blurSigma = Math.max(0.3, shadowBlur * 0.55 * scale)
            const shadowBuf = await sharp(Buffer.from(pixels.buffer), {
              raw: { width: info.width, height: info.height, channels: 4 },
            }).blur(blurSigma).png().toBuffer()

            // Offset based on shadow angle (same formula as CSS drop-shadow in the studio)
            const rad  = ((art.shadowAngle ?? 225) * Math.PI) / 180
            const dist = shadowBlur * 0.55 * scale
            const oX   = Math.round(-Math.sin(rad) * dist)
            const oY   = Math.round(Math.cos(rad) * dist)

            compositeInputs.push({
              input: shadowBuf,
              left: Math.max(0, left + oX),
              top:  Math.max(0, top  + oY),
              blend: 'over',
            })
          } catch { /* skip shadow if it fails — artwork still composited below */ }
        }

        // ── 2. Artwork image (with optional brightness + frame) ─────────
        let pipeline = sharp(artBuf).resize(artThumbW, artThumbH, { fit: 'fill' })

        // Brightness
        const brightness = art.brightness ?? 1
        if (brightness !== 1) {
          pipeline = pipeline.modulate({ brightness })
        }

        // Frame — extend the image with the frame colour, adjust position
        let frameOffset = 0
        const frameType = art.frameType
        const frameWidthMm = art.frameWidthMm
        if (frameType && frameWidthMm && scalePxPerCm) {
          const framePxOrig  = (frameWidthMm / 10) * scalePxPerCm
          const framePxThumb = Math.max(1, Math.round(framePxOrig * scale))
          const fc = FRAME_COLORS[frameType] ?? FRAME_COLORS.black
          pipeline = pipeline.extend({
            top:    framePxThumb,
            bottom: framePxThumb,
            left:   framePxThumb,
            right:  framePxThumb,
            background: { r: fc.r, g: fc.g, b: fc.b, alpha: 1 },
          })
          frameOffset  = framePxThumb
          artThumbW   += framePxThumb * 2
          artThumbH   += framePxThumb * 2
        }

        const artFinal = await pipeline.png().toBuffer()

        compositeInputs.push({
          input: artFinal,
          left: Math.max(0, left - frameOffset),
          top:  Math.max(0, top  - frameOffset),
          blend: 'over',
        })
      } catch { /* skip failed artwork */ }
    }

    const elevResized = await sharp(elevBuf).resize(THUMB_W, thumbH, { fit: 'fill' }).png().toBuffer()
    const buf = await sharp(elevResized).composite(compositeInputs).png().toBuffer()
    return `data:image/png;base64,${buf.toString('base64')}`
  } catch { return null }
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const supabaseService = await createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()

  // Fetch profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user!.id)
    .single()

  // Fetch projects with elevations count + first thumbnail path + artworks for preview + approval status
  const { data: projects } = await supabase
    .from('projects')
    .select(`
      id, name, client_name, status, created_at,
      elevations(
        id, client_picked_option, display_order,
        elevation_options(
          id, option, image_path, orig_w, orig_h, scale_px_per_cm, approved,
          artworks(id, image_path, x_fraction, y_fraction, w_cm, h_cm, visible, brightness, frame_type, frame_width_mm, shadow_angle, shadow_blur, shadow_opacity)
        )
      )
    `)
    .eq('consultant_id', user!.id)
    .eq('archived', false)
    .order('created_at', { ascending: false })

  const projectsWithThumbs = await Promise.all(
    (projects ?? []).map(async (p) => { try {
      const sortedElevations = [...(p.elevations ?? [])].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
      const firstOption = sortedElevations[0]?.elevation_options?.find(
        (o: { option: string }) => o.option === 'A'
      )

      const origW = firstOption?.orig_w ?? 0
      const origH = firstOption?.orig_h ?? 0
      const scalePxPerCm = firstOption?.scale_px_per_cm ?? null

      let thumbnailUrl: string | null = null

      if (firstOption?.image_path) {
        const { data: elevSigned } = await supabaseService.storage
          .from('elevation-images')
          .createSignedUrl(firstOption.image_path, 3600)

        if (elevSigned?.signedUrl && origW > 0 && origH > 0) {
          // Build signed URLs for visible artworks
          const visibleArts = (firstOption.artworks ?? []).filter((a: { visible: boolean }) => a.visible)
          const artworkEntries = await Promise.all(
            visibleArts.map(async (a: {
              image_path: string; x_fraction: number; y_fraction: number; w_cm: number; h_cm: number;
              brightness?: number | null; frame_type?: string | null; frame_width_mm?: number | null;
              shadow_angle?: number | null; shadow_blur?: number | null; shadow_opacity?: number | null;
            }) => {
              const { data: artSigned } = await supabaseService.storage
                .from('artwork-images')
                .createSignedUrl(a.image_path, 3600)
              return {
                url:          artSigned?.signedUrl ?? '',
                xF:           a.x_fraction,
                yF:           a.y_fraction,
                wCm:          a.w_cm,
                hCm:          a.h_cm,
                brightness:   a.brightness   ?? 1,
                frameType:    a.frame_type   ?? null,
                frameWidthMm: a.frame_width_mm ?? null,
                shadowAngle:  a.shadow_angle  ?? null,
                shadowBlur:   a.shadow_blur   ?? null,
                shadowOpacity: a.shadow_opacity ?? null,
              }
            })
          )
          const validArts = artworkEntries.filter(a => a.url)
          thumbnailUrl = await buildThumbnail(elevSigned.signedUrl, validArts, origW, origH, scalePxPerCm)
          // Fall back to plain elevation URL if compositing failed
          if (!thumbnailUrl) thumbnailUrl = elevSigned.signedUrl
        }
      }

      const elevCount = p.elevations?.length ?? 0
      const pickedCount = (p.elevations ?? []).filter((e: { client_picked_option: string | null }) => e.client_picked_option != null).length
      const approvedCount = (p.elevations ?? []).filter((e: { elevation_options: Array<{ approved: boolean }> }) =>
        e.elevation_options?.some(o => o.approved)
      ).length

      return {
        ...p,
        thumbnailUrl,
        elevCount,
        artCount: 0,
        artworks: [],   // no longer needed — composited into thumbnail
        origW,
        origH,
        scalePxPerCm,
        pickedCount,
        approvedCount,
      }
    } catch { return { ...p, thumbnailUrl: null, elevCount: p.elevations?.length ?? 0, artCount: 0, artworks: [], origW: 0, origH: 0, scalePxPerCm: null, pickedCount: 0, approvedCount: 0 } }
    })
  )

  return (
    <DashboardClient
      profile={profile ?? { id: user!.id, name: user!.email ?? 'Consultant', initials: 'CK', role: 'consultant' }}
      projects={projectsWithThumbs}
    />
  )
}
