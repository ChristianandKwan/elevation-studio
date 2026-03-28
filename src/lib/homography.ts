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
    x[i] = M[i][n] / M[i][i]
    for (let j = i + 1; j < n; j++) {
      x[i] -= (M[i][j] / M[i][i]) * x[j]
    }
  }
  return x
}
