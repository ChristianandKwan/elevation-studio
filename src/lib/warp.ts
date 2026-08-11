import { applyHomography, type Homography } from './homography'

/**
 * Draws a canvas through a perspective transform.
 *
 * Canvas 2D cannot do this directly: `setTransform` takes six numbers and can
 * only express an affine map, which by definition keeps parallel lines
 * parallel. Perspective is exactly the case where they converge. So the source
 * is cut into an N x N mesh and each cell drawn under its own affine — small
 * enough that the difference between the true projective map and the affine
 * approximation falls below a pixel.
 *
 * The error per cell shrinks with the square of the cell size, so the grid is
 * sized against the source rather than fixed: a big artwork gets more cells,
 * and a thumbnail-sized one does not pay for detail it cannot show.
 */
const MIN_GRID = 8
const MAX_GRID = 32
const PX_PER_CELL = 24

/**
 * Neighbouring cells share an edge, and `clip()` antialiases both sides of it.
 * Two half-covered draws do not add up to one full one, so an untreated mesh is
 * crazed with transparent hairlines. Each destination triangle is therefore
 * grown, so that the later of the two neighbours covers the shared edge
 * outright rather than meeting the first halfway.
 *
 * The value is not cosmetic. Covering a pixel outright means reaching its far
 * corner, and the furthest a corner can sit from an edge crossing the pixel is
 * half the diagonal, 0.707. Anything less leaves a proportion of the seam only
 * partly covered — at 0.35 roughly one interior pixel in a hundred still let
 * the background through.
 */
const SEAM_INFLATE_PX = 0.75

/**
 * How far outside the destination canvas the warped result is still allocated,
 * so that an artwork hanging off the edge does not size a buffer by how far off
 * it goes.
 */
const CLAMP_MARGIN_PX = 2

/**
 * Draws `src` onto `ctx` as though it occupied the rectangle
 * (dx, dy, src.width, src.height) in layer space and that whole layer were then
 * transformed by `h`.
 *
 * The warp is composed in its own buffer and blitted once, so the caller's
 * `globalAlpha` and `filter` apply to the artwork as a whole — matching CSS,
 * where opacity and filters apply to the finished element, not to its pieces.
 *
 * @returns false if the transform is degenerate here, in which case nothing has
 *          been drawn and the caller should fall back to an unwarped draw.
 */
export function drawImageWarped(
  ctx: CanvasRenderingContext2D,
  src: HTMLCanvasElement,
  dx: number,
  dy: number,
  h: Homography
): boolean {
  const w = src.width
  const h0 = src.height
  if (w < 1 || h0 < 1) return false

  const n = Math.max(
    MIN_GRID,
    Math.min(MAX_GRID, Math.round(Math.max(w, h0) / PX_PER_CELL))
  )

  // Map every grid node up front: each is shared by up to four cells, and a
  // single unmappable node means the artwork crosses the horizon.
  const nodes: Array<[number, number]> = []
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      const p = applyHomography(h, dx + (i / n) * w, dy + (j / n) * h0)
      if (!p) return false
      nodes.push(p)
    }
  }
  const nodeAt = (i: number, j: number) => nodes[j * (n + 1) + i]

  // Allocate only the part of the result that can land on the canvas.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const [px, py] of nodes) {
    if (px < minX) minX = px
    if (px > maxX) maxX = px
    if (py < minY) minY = py
    if (py > maxY) maxY = py
  }
  const bx = Math.floor(Math.max(minX - 1, -CLAMP_MARGIN_PX))
  const by = Math.floor(Math.max(minY - 1, -CLAMP_MARGIN_PX))
  const bw = Math.ceil(Math.min(maxX + 1, ctx.canvas.width + CLAMP_MARGIN_PX)) - bx
  const bh = Math.ceil(Math.min(maxY + 1, ctx.canvas.height + CLAMP_MARGIN_PX)) - by
  if (bw < 1 || bh < 1) return true // entirely off-canvas; nothing to draw

  const out = document.createElement('canvas')
  out.width = bw
  out.height = bh
  const octx = out.getContext('2d')
  if (!octx) return false
  octx.imageSmoothingEnabled = true
  octx.imageSmoothingQuality = 'high'
  // Inflated triangles overlap by design. Under the default source-over the
  // overlap would composite twice, turning every seam into a darker line
  // wherever the source is not opaque — which is most of a drop shadow. `copy`
  // is confined to the clip region, so the later triangle replaces the band
  // instead of blending into it, and partial alpha survives intact.
  octx.globalCompositeOperation = 'copy'

  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      // Cell corners in source pixels…
      const u0 = (i / n) * w, u1 = ((i + 1) / n) * w
      const v0 = (j / n) * h0, v1 = ((j + 1) / n) * h0
      // …and where they land, already shifted into the buffer.
      const p00 = nodeAt(i, j), p10 = nodeAt(i + 1, j)
      const p11 = nodeAt(i + 1, j + 1), p01 = nodeAt(i, j + 1)
      const d00: [number, number] = [p00[0] - bx, p00[1] - by]
      const d10: [number, number] = [p10[0] - bx, p10[1] - by]
      const d11: [number, number] = [p11[0] - bx, p11[1] - by]
      const d01: [number, number] = [p01[0] - bx, p01[1] - by]

      drawTriangle(octx, src, [u0, v0], [u1, v0], [u1, v1], d00, d10, d11)
      drawTriangle(octx, src, [u0, v0], [u1, v1], [u0, v1], d00, d11, d01)
    }
  }

  ctx.drawImage(out, bx, by)
  return true
}

/**
 * Draws the triangle of `src` spanning s1–s3 into the destination triangle
 * d1–d3, under the affine that is the unique map between the two.
 */
function drawTriangle(
  ctx: CanvasRenderingContext2D,
  src: HTMLCanvasElement,
  s1: [number, number], s2: [number, number], s3: [number, number],
  d1: [number, number], d2: [number, number], d3: [number, number]
) {
  const [u1, v1] = s1, [u2, v2] = s2, [u3, v3] = s3
  const [x1, y1] = d1, [x2, y2] = d2, [x3, y3] = d3

  const det = (u2 - u1) * (v3 - v1) - (u3 - u1) * (v2 - v1)
  if (Math.abs(det) < 1e-12) return

  const a = ((x2 - x1) * (v3 - v1) - (x3 - x1) * (v2 - v1)) / det
  const b = ((x3 - x1) * (u2 - u1) - (x2 - x1) * (u3 - u1)) / det
  const c = ((y2 - y1) * (v3 - v1) - (y3 - y1) * (v2 - v1)) / det
  const d = ((y3 - y1) * (u2 - u1) - (y2 - y1) * (u3 - u1)) / det
  const e = x1 - a * u1 - b * v1
  const f = y1 - c * u1 - d * v1

  const grown = inflate([[x1, y1], [x2, y2], [x3, y3]], SEAM_INFLATE_PX)

  ctx.save()
  ctx.beginPath()
  ctx.moveTo(grown[0][0], grown[0][1])
  ctx.lineTo(grown[1][0], grown[1][1])
  ctx.lineTo(grown[2][0], grown[2][1])
  ctx.closePath()
  ctx.clip()
  ctx.setTransform(a, c, b, d, e, f)
  // The whole source, not just this cell's slice of it. Under `copy` any part
  // of the clip the source fails to reach is cleared rather than left alone,
  // and the clip deliberately overhangs the cell — by a margin that is fixed in
  // destination pixels but arbitrarily large in source pixels once perspective
  // compresses the far end of a wall. Passing the whole image removes the
  // question. Only the clip's bounds are rasterised either way.
  ctx.drawImage(src, 0, 0)
  ctx.restore()
}

/**
 * Grows a triangle by moving every edge `d` px along its outward normal.
 *
 * Scaling the vertices away from the centroid instead is the obvious thing to
 * reach for and does not work: how far it moves an edge depends on how far that
 * edge's vertices happen to sit from the centroid, so a long thin cell — which
 * is what perspective produces at the far end of a wall — barely moves at all,
 * and the seam stays open. Offsetting the edges themselves and re-deriving the
 * vertices from where the offset edges now cross gives every edge the same
 * clearance whatever the triangle's shape.
 */
function inflate(
  tri: Array<[number, number]>,
  d: number
): Array<[number, number]> {
  const gx = (tri[0][0] + tri[1][0] + tri[2][0]) / 3
  const gy = (tri[0][1] + tri[1][1] + tri[2][1]) / 3

  // Each edge as an offset line n·p = c, with n pointing away from the centroid.
  const lines: Array<[number, number, number]> = []
  for (let i = 0; i < 3; i++) {
    const [ax, ay] = tri[i]
    const [bx, by] = tri[(i + 1) % 3]
    let nx = by - ay
    let ny = -(bx - ax)
    const len = Math.hypot(nx, ny)
    if (len < 1e-9) return tri
    nx /= len
    ny /= len
    if (nx * (gx - ax) + ny * (gy - ay) > 0) { nx = -nx; ny = -ny }
    lines.push([nx, ny, nx * ax + ny * ay + d])
  }

  // Vertex i+1 is where edges i and i+1 meet.
  const out: Array<[number, number]> = [tri[0], tri[1], tri[2]]
  for (let i = 0; i < 3; i++) {
    const [a1, b1, c1] = lines[i]
    const [a2, b2, c2] = lines[(i + 1) % 3]
    const det = a1 * b2 - a2 * b1
    if (Math.abs(det) < 1e-9) return tri // near-collinear; leave it alone
    out[(i + 1) % 3] = [(c1 * b2 - c2 * b1) / det, (a1 * c2 - a2 * c1) / det]
  }
  return out
}
