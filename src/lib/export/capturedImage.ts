/**
 * Checking a picture that arrived in a request body.
 *
 * The budget page is photographed in the browser and posted up as a data URL,
 * which makes it the one part of the pack that comes from outside. It is
 * therefore checked rather than trusted: a declared type we accept, a size
 * ceiling, and the file's own magic number — because base64 will decode
 * almost any string into bytes, and only the magic number establishes that
 * what came back is actually an image.
 *
 * Kept apart from `pack.ts` so `node --test` can cover it: pack.ts imports
 * sharp and cannot be loaded without it.
 */

/**
 * The largest data URL we will take, in characters.
 *
 * The whole request body has to fit inside the platform's limit, which is
 * 4.5MB, and the choices travel in the same JSON. 3.5MB of base64 is about
 * 2.6MB of image — far past a page of type even at 2× — and leaves room.
 * The browser side steps down to JPEG before it gets near this; the ceiling
 * is here for the case where it did not.
 */
export const MAX_DATA_URL_CHARS = 3_500_000

/** What a picture of a page may be, and how each one announces itself. */
const ACCEPTED: Array<{ prefix: string; magic: number[]; ext: string }> = [
  {
    prefix: 'data:image/png;base64,',
    magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    ext: '.png',
  },
  {
    // The step-down for a page too big to send losslessly.
    prefix: 'data:image/jpeg;base64,',
    magic: [0xff, 0xd8, 0xff],
    ext: '.jpg',
  },
]

export interface CapturedImage {
  bytes: Uint8Array
  /** `.png` or `.jpg`, taken from what the bytes actually are. */
  ext: string
}

/**
 * The image in a data URL, or null for anything that is not one.
 *
 * Null is not an error worth failing the export over — it costs the pack its
 * budget page and nothing else.
 */
export function decodeCapturedImage(raw: unknown): CapturedImage | null {
  if (typeof raw !== 'string') return null
  if (raw.length > MAX_DATA_URL_CHARS) return null

  const kind = ACCEPTED.find(k => raw.startsWith(k.prefix))
  if (!kind) return null

  try {
    const bytes = Buffer.from(raw.slice(kind.prefix.length), 'base64')
    if (bytes.length < kind.magic.length) return null
    if (kind.magic.some((b, i) => bytes[i] !== b)) return null
    return { bytes: new Uint8Array(bytes), ext: kind.ext }
  } catch {
    return null
  }
}
