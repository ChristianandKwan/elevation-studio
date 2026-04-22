/**
 * Computes the CSS matrix3d string for a perspective transform that maps
 * a rectangle of size (rectW x rectH) to an arbitrary quadrilateral.
 *
 * @param rectW  Width of the source rectangle (the element's CSS width)
 * @param rectH  Height of the source rectangle (the element's CSS height)
 * @param quad   Destination corners [TL, TR, BR, BL] in display pixels
 * @returns      CSS matrix3d(...) string, or '' if the computation fails
 */
export function quadToCSSMatrix3d(
  rectW: number,
  rectH: number,
  quad: [[number, number], [number, number], [number, number], [number, number]]
): string {
  const [tl, tr, br, bl] = quad
  const src: Array<[number, number]> = [
    [0, 0],
    [rectW, 0],
    [rectW, rectH],
    [0, rectH],
  ]
  const dst: Array<[number, number]> = [tl, tr, br, bl]

  try {
    const h = computeHomography(src, dst)
    // CSS matrix3d is column-major 4x4:
    //   col0: [h[0], h[3], 0, h[6]]
    //   col1: [h[1], h[4], 0, h[7]]
    //   col2: [0,    0,    1, 0   ]
    //   col3: [h[2], h[5], 0, h[8]]
    // Flat row: matrix3d(h0,h3,0,h6, h1,h4,0,h7, 0,0,1,0, h2,h5,0,h8)
    const [h0, h1, h2, h3, h4, h5, h6, h7, h8] = h
    return `matrix3d(${h0},${h3},0,${h6},${h1},${h4},0,${h7},0,0,1,0,${h2},${h5},0,${h8})`
  } catch {
    return ''
  }
}

/**
 * Produces a CSS matrix3d transform that skews the artwork layer to match a
 * wall quad, WITHOUT crushing artworks by the ratio of photo-to-wall size.
 *
 * Problem with the naive approach (passing full-photo dims into
 * quadToCSSMatrix3d): the homography maps the whole photo rectangle into the
 * wall quad, so if the wall only covers, say, half the photo, everything
 * inside — including every artwork — gets compressed to ~50%. Artworks were
 * already calibrated against the wall via the scale line; this second
 * compression is wrong.
 *
 * Fix: treat the wall itself as the unit of reference, not the photo.
 *   1. Infer the wall's flat-on rectangle from the quad. Design decision:
 *        - height = max(left edge, right edge)  → the "tall" (near) vertical edge
 *        - width  = max(top edge, bottom edge)  → the "near" horizontal edge
 *        - anchored so the rect's tall edge coincides in photo coords with the
 *          quad's tall edge (left-near or right-near depending on which vertical
 *          edge of the quad is longer)
 *   2. Solve H: wallRect → wallQuad. By construction this leaves the tall edge
 *      at 1:1 scale; only the foreshortened edge shrinks.
 *   3. Apply H to the photo's four corners to obtain an extrapolated photoQuad.
 *   4. Feed photoQuad into quadToCSSMatrix3d. A homography is determined by 4
 *      point correspondences, so the resulting transform agrees with H at every
 *      point — including every artwork — and therefore scales correctly.
 *
 * @returns CSS matrix3d(...) string, or '' if the computation fails or the
 *          wall quad is degenerate.
 */
export function wallQuadToSkewMatrix(
  photoW: number,
  photoH: number,
  wallQuad: [[number, number], [number, number], [number, number], [number, number]]
): string {
  const [TL, TR, BR, BL] = wallQuad
  const d = (a: [number, number], b: [number, number]) =>
    Math.hypot(a[0] - b[0], a[1] - b[1])
  const leftLen = d(TL, BL)
  const rightLen = d(TR, BR)
  const topLen = d(TL, TR)
  const bottomLen = d(BL, BR)

  const hWall = Math.max(leftLen, rightLen)
  const wWall = Math.max(topLen, bottomLen)
  if (hWall < 1 || wWall < 1) return ''

  // Anchor the flat-on wall rect so its near (tall) edge sits where the
  // quad's tall edge sits. The near edge is whichever vertical edge is longer.
  const leftIsNear = leftLen >= rightLen
  let xWall: number, yWall: number
  if (leftIsNear) {
    // Near edge = TL–BL; rect extends to the right
    xWall = (TL[0] + BL[0]) / 2
    yWall = TL[1]
  } else {
    // Near edge = TR–BR; rect extends to the left
    xWall = (TR[0] + BR[0]) / 2 - wWall
    yWall = TR[1]
  }

  const wallRect: Array<[number, number]> = [
    [xWall, yWall],
    [xWall + wWall, yWall],
    [xWall + wWall, yWall + hWall],
    [xWall, yWall + hWall],
  ]

  let h: number[]
  try {
    h = computeHomography(wallRect, [TL, TR, BR, BL])
  } catch {
    return ''
  }

  const apply = (x: number, y: number): [number, number] => {
    const denom = h[6] * x + h[7] * y + h[8]
    if (Math.abs(denom) < 1e-9) return [0, 0]
    return [
      (h[0] * x + h[1] * y + h[2]) / denom,
      (h[3] * x + h[4] * y + h[5]) / denom,
    ]
  }

  const photoQuad: [[number, number], [number, number], [number, number], [number, number]] = [
    apply(0, 0),
    apply(photoW, 0),
    apply(photoW, photoH),
    apply(0, photoH),
  ]

  return quadToCSSMatrix3d(photoW, photoH, photoQuad)
}

/** Solves for the 3×3 homography H mapping src[i] → dst[i] via DLT. */
function computeHomography(
  src: Array<[number, number]>,
  dst: Array<[number, number]>
): number[] {
  const A: number[][] = []
  const b: number[] = []
  for (let i = 0; i < 4; i++) {
    const [sx, sy] = src[i]
    const [dx, dy] = dst[i]
    A.push([sx, sy, 1, 0, 0, 0, -dx * sx, -dx * sy])
    b.push(dx)
    A.push([0, 0, 0, sx, sy, 1, -dy * sx, -dy * sy])
    b.push(dy)
  }
  const h = gaussianElimination(A, b)
  return [...h, 1] // h8 = 1
}

/** Solves Ax = b via Gaussian elimination with partial pivoting. */
function gaussianElimination(A: number[][], b: number[]): number[] {
  const n = 8
  const M = A.map((row, i) => [...row, b[i]])

  for (let col = 0; col < n; col++) {
    // Partial pivot
    let maxRow = col
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(M[row][col]) > Math.abs(M[maxRow][col])) maxRow = row
    }
    ;[M[col], M[maxRow]] = [M[maxRow], M[col]]

    if (Math.abs(M[col][col]) < 1e-10) throw new Error('Degenerate quad: cannot compute homography')

    // Eliminate below
    for (let row = col + 1; row < n; row++) {
      const factor = M[row][col] / M[col][col]
      for (let j = col; j <= n; j++) {
        M[row][j] -= factor * M[col][j]
      }
    }
  }

  // Back substitution
  const x = new Array(n).fill(0)
  for (let i = n - 1; i >= 0; i--) {
    if (Math.abs(M[i][i]) < 1e-10) throw new Error('Degenerate quad: cannot compute homography')
    x[i] = M[i][n] / M[i][i]
    for (let j = i + 1; j < n; j++) {
      x[i] -= (M[i][j] / M[i][i]) * x[j]
    }
  }
  return x
}
