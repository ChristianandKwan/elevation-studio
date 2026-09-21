/**
 * A picture of the budget, as it would print.
 *
 * The export pack carries the budget twice over: as a table in the markdown,
 * which is the figures, and as this image, which is the page. Claude Design
 * can lay the numbers out itself from the table, or use the picture as it
 * stands — Tom asked for both so the choice is downstream.
 *
 * ── Why a screenshot and not a drawing ──────────────────────
 *
 * The budget's layout is not simple: struck-through list prices, sub-lines
 * under a work, two columns while an elevation is undecided, VAT modes, and
 * a set of rules about what a client may see. Drawing that again server-side
 * would be a second implementation to keep in step with the first, and the
 * two would drift the first time a row changed. Photographing the real screen
 * cannot drift.
 *
 * ── Why it renders off-screen ───────────────────────────────
 *
 * The export is started from the Index, where the budget is not mounted —
 * StudioScreen renders it only for `view === 'budget'`. So the caller mounts
 * a second, read-only copy somewhere invisible and hands the node here.
 * `display: none` would not do: an element with no layout has nothing to
 * photograph, so the host is positioned off the left edge instead.
 */
import { applyPrintCss, collectPrintCss } from '@/lib/printStyles'
import { MAX_DATA_URL_CHARS } from '@/lib/export/capturedImage'

/**
 * A4 at 96dpi, which is what the browser means by a page.
 *
 * The width matters more than it looks: the budget is a fluid layout, so
 * whatever it is given is what the columns lay out to. Giving it a page's
 * width is what makes the capture look like a printed page rather than a
 * wide screen, and it is what lets the design step treat it as one.
 */
export const PAGE_W = 794

/** Doubled so the text is still sharp when the picture is placed at size. */
const CAPTURE_SCALE = 2

/** Give up rather than hang: something is wrong and the export can go without. */
const LOAD_TIMEOUT_MS = 8000

/**
 * Wait until the off-screen budget has finished loading its own data.
 *
 * `useBudgetState` fetches the project's budget row on mount and shows a
 * spinner until it lands. Photographing before then captures the spinner.
 */
async function waitForContent(host: HTMLElement): Promise<boolean> {
  const deadline = Date.now() + LOAD_TIMEOUT_MS
  while (Date.now() < deadline) {
    const loading = host.querySelector('.budget-loading')
    const content = host.querySelector('.budget-content')
    if (!loading && content) {
      // One more frame, so the layout that just appeared has been laid out.
      await new Promise(requestAnimationFrame)
      return true
    }
    await new Promise(r => setTimeout(r, 50))
  }
  return false
}

/**
 * Photograph the budget inside `host`, returning a PNG data URL.
 *
 * Returns null rather than throwing: a missing budget picture should cost the
 * consultant that picture, not the whole pack.
 */
export async function captureBudgetImage(host: HTMLElement): Promise<string | null> {
  try {
    if (!(await waitForContent(host))) return null

    const mod = await import('html2canvas-pro')
    const html2canvas = mod.default

    // Read the print rules from the live document, not the clone — the clone
    // has them too, but this is the document we know is fully loaded.
    const printCss = collectPrintCss(document)

    const canvas = await html2canvas(host, {
      backgroundColor: '#FDFBF9',
      useCORS: true,
      logging: false,
      scale: CAPTURE_SCALE,
      windowWidth: PAGE_W,
      onclone: (clone) => applyPrintCss(clone, printCss),
    })

    // PNG rather than JPEG: this is type and ruled lines on a flat ground,
    // which is exactly what JPEG smears and PNG keeps small.
    const png = canvas.toDataURL('image/png')
    if (png.length <= MAX_DATA_URL_CHARS) return png

    // A very long budget can still outgrow what a request body will carry.
    // A slightly soft page is worth more than no page, and at 0.92 the
    // difference is not visible at reading size.
    const jpeg = canvas.toDataURL('image/jpeg', 0.92)
    return jpeg.length <= MAX_DATA_URL_CHARS ? jpeg : null
  } catch {
    return null
  }
}
