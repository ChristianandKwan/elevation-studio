/**
 * Quietly fetching the pictures someone is about to look at.
 *
 * The point of options is flicking between them to compare, and a spinner on
 * every click gets in the way of that. So the studio and the client portal
 * each hand this module every other image in the project — the rest of this
 * elevation first — and once the option on screen has finished loading it
 * downloads them a few at a time in the background. By the time a tab is
 * clicked its images are already in the browser, and the switch is as quick
 * as drawing them.
 *
 * Every image is requested with `crossOrigin = 'anonymous'`, the same way the
 * canvases and their tiles ask for them. The browser keeps a separate copy for
 * each way of asking, so a request made any other way would be a second
 * download of the same file rather than a hit on this one.
 *
 * The `Image` objects are held on purpose: a held image is one the browser
 * keeps in memory rather than going back to its disk cache for. Only the
 * compressed bytes are held — a picture is not unpacked until it is drawn.
 */

/** How many background downloads run at once. Low, so the option actually on
 *  screen never waits behind a queue of ones that are not. */
const CONCURRENT = 3

const held = new Map<string, HTMLImageElement>()
let queue: string[] = []
let running = 0
let paused = false

/**
 * Replace the list of images to fetch, most wanted first. Anything already
 * fetched or in flight is skipped; anything queued from an earlier call but
 * not in this one is dropped, because the priorities have moved on.
 */
export function preloadImages(urls: Array<string | null | undefined>) {
  const seen = new Set<string>()
  queue = []
  for (const u of urls) {
    // Plain walls are drawn from a data URL — nothing to fetch.
    if (!u || !u.startsWith('http') || held.has(u) || seen.has(u)) continue
    seen.add(u)
    queue.push(u)
  }
  pump()
}

/** Hold back new background downloads while the option on screen is still
 *  loading its own. Ones already started are left to finish. */
export function setPreloadPaused(value: boolean) {
  paused = value
  if (!paused) pump()
}

/** Forget everything. Called on leaving a project: its image links are signed
 *  per visit, so none of them will be asked for again. */
export function clearPreloads() {
  queue = []
  held.clear()
}

function pump() {
  while (!paused && running < CONCURRENT && queue.length > 0) {
    const url = queue.shift()!
    if (held.has(url)) continue
    const img = new Image()
    img.crossOrigin = 'anonymous'
    held.set(url, img)
    running++
    const done = () => { running--; pump() }
    img.onload = done
    // A failed one is let go, so the canvas makes its own attempt — with the
    // re-signing retry it has and this does not.
    img.onerror = () => { held.delete(url); done() }
    img.src = url
  }
}
