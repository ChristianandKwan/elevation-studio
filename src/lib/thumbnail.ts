/**
 * Server-only thumbnail compositing pipeline.
 *
 * This module replaces the inline `buildThumbnail` that used to live in
 * `src/app/(consultant)/dashboard/page.tsx`. The dashboard no longer
 * composites on every request — instead, the studio triggers a
 * regeneration whenever the option or its artworks change, the composed
 * PNG is uploaded to the `thumbnails` storage bucket, and the row's
 * `thumbnail_path` is patched. The dashboard then serves a plain signed
 * URL to that cached PNG.
 *
 * This file imports `sharp` and must only be used from server code
 * (route handlers, server components, server actions). Never import
 * from a client component.
 */
// NOTE: this file imports `sharp`, a native Node module. Do not import
// from any client component — it will break the bundler. Only server
// components, route handlers, and server actions may import from here.
import sharp from 'sharp'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  lipShadow, FRAME_LIP_SPREAD, MOUNT_LIP_SPREAD, mountLipOpacity, SHADOW_PUSH,
} from '@/lib/frameShadow'
import { frameRgb, mountRgb, frameGrainSvg } from '@/lib/frames'

const THUMB_W = 600 // max thumbnail width in pixels

export interface ArtworkEntry {
  url: string
  xF: number
  yF: number
  wCm: number
  hCm: number
  brightness?: number | null
  fade?: number | null
  frameType?: string | null
  frameWidthMm?: number | null
  mountColor?: string | null
  mountTopMm?: number | null
  mountRightMm?: number | null
  mountBottomMm?: number | null
  mountLeftMm?: number | null
  shadowAngle?: number | null
  shadowBlur?: number | null
  shadowOpacity?: number | null
}

type MaskPolygon = Array<{ x: number; y: number }>

async function fetchBuffer(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    return Buffer.from(await res.arrayBuffer())
  } catch {
    return null
  }
}

/**
 * The frame lip's shadow on an artwork `w` × `h` pixels, as a PNG to lay over
 * it. Built as a solid ring around the artwork, shifted by the shadow offset
 * and blurred; whatever of it spills inside the artwork's box is the shadow.
 * `blur` is in thumbnail pixels.
 */
async function frameLipShade(
  w: number, h: number, angle: number | null | undefined, blur: number, opacity: number,
  spread: number = FRAME_LIP_SPREAD,
): Promise<Buffer> {
  const lip = lipShadow(angle, blur, spread)
  // lip.blur is twice the standard deviation; 0.55 matches the wall shadow's sigma above.
  const sigma = Math.max(0.3, (lip.blur / 2) * 0.55)
  const ox = Math.round(lip.x)
  const oy = Math.round(lip.y)
  const pad = Math.ceil(sigma * 3) + Math.abs(ox) + Math.abs(oy) + 1
  const W = w + pad * 2
  const H = h + pad * 2
  const alpha = Math.round(opacity * 255)
  const pixels = new Uint8Array(W * H * 4)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const inHole = x >= pad + ox && x < pad + ox + w && y >= pad + oy && y < pad + oy + h
      if (!inHole) pixels[(y * W + x) * 4 + 3] = alpha
    }
  }
  // Blurred on its own before the crop, so the crop can't be planned first.
  const blurred = await sharp(Buffer.from(pixels.buffer), { raw: { width: W, height: H, channels: 4 } })
    .blur(sigma)
    .png()
    .toBuffer()
  return await sharp(blurred).extract({ left: pad, top: pad, width: w, height: h }).png().toBuffer()
}

/**
 * Pure compositing: takes signed URLs + artwork metadata and returns
 * a PNG `Buffer`. Returns `null` on failure (caller falls back).
 */
export async function buildThumbnailBuffer(
  elevUrl: string,
  artworks: ArtworkEntry[],
  origW: number,
  origH: number,
  scalePxPerCm: number | null,
  foregroundMasks: MaskPolygon[] | null = null
): Promise<Buffer | null> {
  try {
    const elevBuf = await fetchBuffer(elevUrl)
    if (!elevBuf) return null

    const scale = THUMB_W / origW
    const thumbH = Math.round(origH * scale)
    const hasMasks = (foregroundMasks ?? []).some(p => p && p.length >= 3)

    // No scale or no artworks — plain elevation thumbnail (no foreground to apply)
    if (!scalePxPerCm || artworks.length === 0) {
      return await sharp(elevBuf).resize(THUMB_W, thumbH, { fit: 'fill' }).png().toBuffer()
    }

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

        const shadowBlur    = art.shadowBlur    ?? 0
        const shadowOpacity = art.shadowOpacity ?? 0
        const hasShadow = shadowBlur > 0 && shadowOpacity > 0

        const frameType = art.frameType
        const frameWidthMm = art.frameWidthMm
        const framePxThumb = frameType && frameWidthMm && scalePxPerCm
          ? Math.max(1, Math.round((frameWidthMm / 10) * scalePxPerCm * scale))
          : 0

        // The mount, in the same thumbnail pixels. A side is only drawn when
        // a colour was chosen, matching mountOf on the wall.
        const mmToPx = (mm: number | null | undefined) =>
          art.mountColor && mm && scalePxPerCm
            ? Math.max(0, Math.round((mm / 10) * scalePxPerCm * scale))
            : 0
        const mountPx = {
          top:    mmToPx(art.mountTopMm),
          right:  mmToPx(art.mountRightMm),
          bottom: mmToPx(art.mountBottomMm),
          left:   mmToPx(art.mountLeftMm),
        }
        const hasMount = mountPx.top + mountPx.right + mountPx.bottom + mountPx.left > 0
        // Everything outside the artwork, per side.
        const outerPx = {
          top:    mountPx.top    + framePxThumb,
          right:  mountPx.right  + framePxThumb,
          bottom: mountPx.bottom + framePxThumb,
          left:   mountPx.left   + framePxThumb,
        }

        // ── 1. Drop shadow ───────────────────────────────────────────
        // Cast by the artwork and its frame together, as on the canvas.
        if (hasShadow) {
          try {
            const { data: rawPixels, info } = await sharp(artBuf)
              .resize(artThumbW, artThumbH, { fit: 'fill' })
              .ensureAlpha()
              .raw()
              .toBuffer({ resolveWithObject: true })

            const pixels = new Uint8Array(rawPixels)
            for (let i = 0; i < pixels.length; i += 4) {
              pixels[i]     = 0
              pixels[i + 1] = 0
              pixels[i + 2] = 0
              pixels[i + 3] = Math.round(pixels[i + 3] * shadowOpacity)
            }

            // The framed silhouette, then a transparent margin for the blur to
            // spread into — without one the blur stops dead at the edge and
            // the shadow shows as a hard grey line. Each step is materialised
            // because sharp would otherwise plan the extends after the blur.
            const blurSigma = Math.max(0.3, shadowBlur * 0.55 * scale)
            const margin = Math.ceil(blurSigma * 3)
            const silhouette = await sharp(Buffer.from(pixels.buffer), {
              raw: { width: info.width, height: info.height, channels: 4 },
            })
              .extend({
                top: outerPx.top, bottom: outerPx.bottom, left: outerPx.left, right: outerPx.right,
                background: { r: 0, g: 0, b: 0, alpha: shadowOpacity },
              })
              .png()
              .toBuffer()
            const padded = await sharp(silhouette)
              .extend({
                top: margin, bottom: margin, left: margin, right: margin,
                background: { r: 0, g: 0, b: 0, alpha: 0 },
              })
              .png()
              .toBuffer()
            const shadowBuf = await sharp(padded).blur(blurSigma).png().toBuffer()

            const rad  = ((art.shadowAngle ?? 225) * Math.PI) / 180
            const dist = shadowBlur * SHADOW_PUSH * scale
            const oX   = Math.round(-Math.sin(rad) * dist)
            const oY   = Math.round(Math.cos(rad) * dist)

            // sharp can't place an overlay past the image's top-left corner,
            // so trim whatever of the shadow would fall off that edge.
            const sLeft = left - margin + oX
            const sTop  = top  - margin + oY
            const meta = await sharp(shadowBuf).metadata()
            const cutX = Math.max(0, -sLeft)
            const cutY = Math.max(0, -sTop)
            const visible = cutX || cutY
              ? await sharp(shadowBuf)
                  .extract({ left: cutX, top: cutY, width: meta.width! - cutX, height: meta.height! - cutY })
                  .png()
                  .toBuffer()
              : shadowBuf
            compositeInputs.push({
              input: visible,
              left: sLeft + cutX,
              top:  sTop  + cutY,
              blend: 'over',
            })
          } catch { /* skip shadow */ }
        }

        // ── 2. Artwork (+ brightness, frame) ─────────────────────────
        let pipeline = sharp(artBuf).resize(artThumbW, artThumbH, { fit: 'fill' })

        // The mount's own lip, onto the artwork. Card is 2–3mm thick against a
        // frame's 10–20mm, so this is a sixth of the frame's shadow — enough
        // to say the picture sits behind an opening, no more.
        if (hasMount && hasShadow) {
          try {
            const shade = await frameLipShade(
              artThumbW, artThumbH, art.shadowAngle, shadowBlur * scale,
              mountLipOpacity(shadowOpacity), MOUNT_LIP_SPREAD,
            )
            pipeline = sharp(await pipeline.png().toBuffer()).composite([{ input: shade, blend: 'over' }])
          } catch { /* skip lip shadow */ }
        }

        // The mount goes on first — it sits between the artwork and the frame.
        // Materialised each time so the extend can't be planned ahead of the
        // lip shadow's composite.
        if (hasMount) {
          const mc = mountRgb(art.mountColor)
          pipeline = sharp(await pipeline.png().toBuffer()).extend({
            top:    mountPx.top,
            bottom: mountPx.bottom,
            left:   mountPx.left,
            right:  mountPx.right,
            background: { r: mc.r, g: mc.g, b: mc.b, alpha: 1 },
          })
          artThumbW += mountPx.left + mountPx.right
          artThumbH += mountPx.top + mountPx.bottom
        }

        // The frame's lip shades whatever sits immediately inside it — the
        // mount when there is one, the artwork when there is not. This has to
        // come after the mount is on, or the shadow lands on the picture and
        // the card around it stays flat.
        if (framePxThumb > 0 && hasShadow) {
          try {
            const shade = await frameLipShade(
              artThumbW, artThumbH, art.shadowAngle, shadowBlur * scale, shadowOpacity,
            )
            pipeline = sharp(await pipeline.png().toBuffer()).composite([{ input: shade, blend: 'over' }])
          } catch { /* skip lip shadow */ }
        }

        if (framePxThumb > 0) {
          const fc = frameRgb(frameType)
          pipeline = sharp(await pipeline.png().toBuffer()).extend({
            top:    framePxThumb,
            bottom: framePxThumb,
            left:   framePxThumb,
            right:  framePxThumb,
            background: { r: fc.r, g: fc.g, b: fc.b, alpha: 1 },
          })
          artThumbW += framePxThumb * 2
          artThumbH += framePxThumb * 2

          // Grain over the frame, on the wood types only.
          const grain = frameGrainSvg(
            frameType, artThumbW, artThumbH, framePxThumb, (scalePxPerCm ?? 0) * scale,
          )
          if (grain) {
            try {
              pipeline = sharp(await pipeline.png().toBuffer())
                .composite([{ input: Buffer.from(grain), blend: 'over' }])
            } catch { /* a frame without grain is better than no artwork */ }
          }
        }

        // Brightness last, over the artwork *and* its mount and frame.
        // On the wall this is a CSS filter on the whole overlay, and the PNG
        // export composes the tile before applying it — so dimming only the
        // picture, as this used to, left the mount and frame at full strength.
        // An ivory mount came back to the dashboard looking bright white.
        const brightness = art.brightness ?? 1
        if (brightness !== 1) {
          pipeline = sharp(await pipeline.png().toBuffer()).modulate({ brightness })
        }

        // Fade: multiply alpha so the elevation behind shows through
        // (slider 0–1 → up to 25 % reduction).
        //
        // The alpha band has to exist before it can be scaled. sharp plans the
        // whole pipeline against the *input* metadata, so a four-element
        // linear() chained after ensureAlpha() on a three-band JPEG is
        // rejected with "Band expansion using linear is unsupported". That
        // threw inside the per-artwork try below, the artwork was skipped
        // without a word, and the thumbnail showed its drop shadow sitting on
        // a bare wall. So render the alpha in, then scale it in a second pass.
        const fade = art.fade ?? 0
        let artFinal: Buffer
        if (fade > 0) {
          const alphaMul = 1 - fade * 0.25
          const withAlpha = await pipeline.ensureAlpha().png().toBuffer()
          artFinal = await sharp(withAlpha)
            .linear([1, 1, 1, alphaMul], [0, 0, 0, 0])
            .png()
            .toBuffer()
        } else {
          artFinal = await pipeline.png().toBuffer()
        }

        // The overlay on the wall is content-box with its bands outside, so
        // the artwork's recorded position is the *outer* corner of the mount
        // and frame, not the corner of the artwork. This used to subtract the
        // frame instead, centring it — invisible at a 20mm frame, but a 50mm
        // mount would have put the dashboard 7cm of wall out from the studio.
        compositeInputs.push({
          input: artFinal,
          left: Math.max(0, left),
          top:  Math.max(0, top),
          blend: 'over',
        })
      } catch (err) {
        // Carry on with the other artworks, but say so: a silent skip here
        // produces a thumbnail that looks plausible and is quietly wrong.
        console.error('[thumbnail] artwork skipped', { url: art.url, err })
      }
    }

    const elevResized = await sharp(elevBuf).resize(THUMB_W, thumbH, { fit: 'fill' }).png().toBuffer()

    // If any foreground masks exist, overlay a masked copy of the elevation on top so
    // foreground shapes hide artworks behind them (mirrors the studio PNG export pipeline).
    if (hasMasks) {
      const polys = (foregroundMasks ?? []).filter(p => p && p.length >= 3)
      const pathD = polys
        .map(poly => {
          const pts = poly
            .map((pt, i) => `${i === 0 ? 'M' : 'L'}${(pt.x * THUMB_W).toFixed(2)} ${(pt.y * thumbH).toFixed(2)}`)
            .join(' ')
          return `${pts} Z`
        })
        .join(' ')
      const maskSvg = Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${THUMB_W}" height="${thumbH}" viewBox="0 0 ${THUMB_W} ${thumbH}"><path d="${pathD}" fill="#fff"/></svg>`
      )
      try {
        const fgLayer = await sharp(elevResized)
          .ensureAlpha()
          .composite([{ input: maskSvg, blend: 'dest-in' }])
          .png()
          .toBuffer()
        compositeInputs.push({ input: fgLayer, left: 0, top: 0, blend: 'over' })
      } catch { /* skip foreground */ }
    }

    return await sharp(elevResized).composite(compositeInputs).png().toBuffer()
  } catch {
    return null
  }
}

/**
 * Shape of the data returned by `fetchOptionForThumbnail`. The regenerate
 * pipeline only needs a handful of fields from the row, so we keep this
 * structural rather than importing a generated type.
 */
interface OptionRowForThumbnail {
  id: string
  image_path: string | null
  orig_w: number
  orig_h: number
  scale_px_per_cm: number | null
  foreground_masks: unknown
  artworks: Array<{
    image_path: string
    x_fraction: number
    y_fraction: number
    w_cm: number
    h_cm: number
    visible: boolean
    brightness: number | null
    fade: number | null
    frame_type: string | null
    frame_width_mm: number | null
    mount_color: string | null
    mount_top_mm: number | null
    mount_right_mm: number | null
    mount_bottom_mm: number | null
    mount_left_mm: number | null
    shadow_angle: number | null
    shadow_blur: number | null
    shadow_opacity: number | null
    /** The work this placement shows. Null only for a straggler row (see migration 026). */
    work: { image_path: string | null; w_cm: number; h_cm: number } | null
  }>
}

async function fetchOptionForThumbnail(
  supabase: SupabaseClient,
  optionId: string
): Promise<OptionRowForThumbnail | null> {
  const { data } = await supabase
    .from('elevation_options')
    .select(`
      id, image_path, orig_w, orig_h, scale_px_per_cm, foreground_masks,
      artworks(
        x_fraction, y_fraction, visible,
        brightness, fade, frame_type, frame_width_mm,
        mount_color, mount_top_mm, mount_right_mm, mount_bottom_mm, mount_left_mm,
        shadow_angle, shadow_blur, shadow_opacity,
        work:works(image_path, w_cm, h_cm)
      )
    `)
    .eq('id', optionId)
    .single<OptionRowForThumbnail>()
  return data ?? null
}

/**
 * Regenerate the cached thumbnail for a single option. Uploads to
 * `thumbnails/<optionId>.png` (overwriting any prior version) and
 * patches `elevation_options.thumbnail_path`.
 *
 * Pass a service-role `supabase` client so storage writes and the
 * `elevation_options` update both succeed regardless of RLS context.
 *
 * Returns `true` if a thumbnail was produced and persisted,
 * `false` if the option has no elevation image yet (no-op) or
 * compositing failed.
 */
export async function regenerateOptionThumbnail(
  supabase: SupabaseClient,
  optionId: string
): Promise<boolean> {
  const row = await fetchOptionForThumbnail(supabase, optionId)
  if (!row) return false
  if (!row.image_path || !row.orig_w || !row.orig_h) return false

  // Sign the elevation image
  const { data: elevSigned } = await supabase.storage
    .from('elevation-images')
    .createSignedUrl(row.image_path, 3600)
  if (!elevSigned?.signedUrl) return false

  // Sign each visible artwork's image once — one work may hang on the wall
  // more than once, and every placement of it shares the file.
  const visible = (row.artworks ?? []).filter(a => a.visible && a.work?.image_path)
  const paths = [...new Set(visible.map(a => a.work!.image_path as string))]
  const urls = new Map<string, string>()
  await Promise.all(paths.map(async path => {
    const { data } = await supabase.storage.from('artwork-images').createSignedUrl(path, 3600)
    if (data?.signedUrl) urls.set(path, data.signedUrl)
  }))
  const signed = await Promise.all(
    visible.map(async (a): Promise<ArtworkEntry | null> => {
      const url = urls.get(a.work!.image_path as string)
      if (!url) return null
      return {
        url,
        xF:            a.x_fraction,
        yF:            a.y_fraction,
        wCm:           a.work!.w_cm,
        hCm:           a.work!.h_cm,
        brightness:    a.brightness ?? 1,
        fade:          a.fade ?? null,
        frameType:     a.frame_type,
        mountColor:    a.mount_color,
        mountTopMm:    a.mount_top_mm,
        mountRightMm:  a.mount_right_mm,
        mountBottomMm: a.mount_bottom_mm,
        mountLeftMm:   a.mount_left_mm,
        frameWidthMm:  a.frame_width_mm,
        shadowAngle:   a.shadow_angle,
        shadowBlur:    a.shadow_blur,
        shadowOpacity: a.shadow_opacity,
      }
    })
  )
  const artworkEntries: ArtworkEntry[] = signed.filter((a): a is ArtworkEntry => a !== null)

  const buf = await buildThumbnailBuffer(
    elevSigned.signedUrl,
    artworkEntries,
    row.orig_w,
    row.orig_h,
    row.scale_px_per_cm,
    (row.foreground_masks as MaskPolygon[] | null) ?? null
  )
  if (!buf) return false

  // Upload (overwrite prior PNG). We key by optionId so regens are idempotent.
  // `cacheControl: 0` so the dashboard always picks up the newest regen.
  const thumbPath = `${optionId}.png`
  const { error: uploadErr } = await supabase.storage
    .from('thumbnails')
    .upload(thumbPath, buf, {
      contentType: 'image/png',
      upsert: true,
      cacheControl: '0',
    })
  if (uploadErr) return false

  // Patch the row (idempotent — path is deterministic)
  await supabase
    .from('elevation_options')
    .update({ thumbnail_path: thumbPath })
    .eq('id', optionId)

  return true
}
