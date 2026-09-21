/**
 * Which VAT view the budget is in, remembered per project.
 *
 * Its own module because two things need it and neither should own it: the
 * budget screen, which reads it on mount and writes it when the toggle is
 * used, and the export, which mounts a second copy of that screen off-screen
 * to photograph and has to put it in the same view the consultant was just
 * looking at. Exporting an ex-VAT page while the screen shows inc-VAT is a
 * quiet way to send a client the wrong numbers.
 */
const KEY = (projectId: string) => `elevation_budget_vat_mode_${projectId}`

/** True for the inc-VAT view. Defaults to ex-VAT, which is how prices are held. */
export function storedVatMode(projectId: string): boolean {
  try {
    return localStorage.getItem(KEY(projectId)) === 'incvat'
  } catch {
    // No storage (SSR, private mode). Ex-VAT is the safe default: it is the
    // basis every figure is stored in.
    return false
  }
}

export function rememberVatMode(projectId: string, incVat: boolean): void {
  try {
    localStorage.setItem(KEY(projectId), incVat ? 'incvat' : 'exvat')
  } catch { /* storage unavailable */ }
}
