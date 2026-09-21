/**
 * Re-applying the print stylesheet to something that is not being printed.
 *
 * The budget's printed appearance — chrome hidden, collapsed options forced
 * open, elevations hidden from the client dropped — lives in `@media print`
 * blocks in budget.css, and has done since long before the export pack. The
 * export needs a picture that looks like that, but html2canvas renders screen
 * media, so those rules do not apply to it.
 *
 * The obvious fix is to copy the print rules into a `.printing` class and
 * have the capture add it. That is two copies of a twenty-selector list that
 * must agree forever, and they would not: someone would hide a new button
 * from print and the export would keep drawing it for a year before anybody
 * noticed.
 *
 * So instead the rules are read back out of the stylesheet at capture time
 * and re-emitted at `media: all` inside html2canvas's cloned document. The
 * print CSS stays the only place the printed appearance is described, and the
 * capture is by construction whatever printing currently is.
 */

/**
 * Every rule the document defines inside an `@media print` block, as CSS text.
 *
 * Returns an empty string when nothing can be read, which is a capture that
 * looks like the screen rather than no capture at all.
 */
export function collectPrintCss(doc: Document): string {
  const out: string[] = []

  for (const sheet of Array.from(doc.styleSheets)) {
    let rules: CSSRuleList
    try {
      // Reading `cssRules` of a cross-origin sheet throws. Google Fonts is
      // the one in this app, and it has no print rules to miss.
      rules = (sheet as CSSStyleSheet).cssRules
    } catch {
      continue
    }
    if (!rules) continue

    for (const rule of Array.from(rules)) {
      if (!isPrintMedia(rule)) continue
      // The inner rules only — the `@media print { }` wrapper is what we are
      // deliberately dropping.
      for (const inner of Array.from((rule as CSSMediaRule).cssRules)) {
        out.push(inner.cssText)
      }
    }
  }

  return out.join('\n')
}

/**
 * Whether a rule is an `@media` block that applies when printing.
 *
 * `@media print, screen` counts: printing is one of the things it covers.
 * A `screen`-only block does not, and neither does anything that is not a
 * media block at all.
 */
function isPrintMedia(rule: CSSRule): boolean {
  const media = (rule as CSSMediaRule).media
  if (!media) return false
  const text = media.mediaText
  return typeof text === 'string' && /\bprint\b/.test(text)
}

/**
 * Put the print rules into a cloned document, so a capture of it looks
 * printed. Safe to call with nothing to add.
 */
export function applyPrintCss(clone: Document, css: string): void {
  if (!css) return
  const style = clone.createElement('style')
  style.setAttribute('media', 'all')
  style.textContent = css
  clone.head.appendChild(style)
}
