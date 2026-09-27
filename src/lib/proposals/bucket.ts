/**
 * Where a proposal's files live: the `proposals` bucket (migration 039).
 *
 *   <proposal id>/pack.zip             the export pack it was built from
 *   <proposal id>/v<n>/proposal.html   what the engine edits
 *   <proposal id>/v<n>/proposal.pdf    what the consultant downloads
 *   <proposal id>/v<n>/pages/page-NN.png
 *
 * Kept out of /api/admin/sweep-storage, like `exports`: see 039.
 */
export const PROPOSALS_BUCKET = 'proposals'

export function packPath(proposalId: string): string {
  return `${proposalId}/pack.zip`
}

export function versionPrefix(proposalId: string, version: number): string {
  return `${proposalId}/v${version}`
}

/**
 * The files the engine may upload for a version, and nothing else: the
 * names come from the engine's request, so they are checked, not trusted.
 */
export function isVersionFile(name: string): boolean {
  return name === 'proposal.html'
    || name === 'proposal.pdf'
    || /^pages\/page-\d{2,3}\.png$/.test(name)
}
