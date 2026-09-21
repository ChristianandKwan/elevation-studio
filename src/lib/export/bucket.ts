/**
 * Where an export pack is kept.
 *
 * Its own module because both halves need it and they cannot share one:
 * `pack.ts` imports sharp and must never be pulled into a client bundle,
 * while the dashboard deletes a project's pack from the browser.
 *
 * One object per project, `<projectId>.zip`, overwritten on every export.
 * That is the whole retention policy — and it is why this bucket must stay
 * out of /api/admin/sweep-storage, which aborts on any bucket where nothing
 * matched a live database row. No row anywhere points at an export, so every
 * object here would read as an orphan and the run would refuse.
 *
 * Which leaves deleting a project as the one moment a pack can be tidied up,
 * so DashboardClient does it there. See migration 036.
 */
export const EXPORTS_BUCKET = 'exports'

/** The object holding this project's pack. */
export function exportObjectPath(projectId: string): string {
  return `${projectId}.zip`
}
