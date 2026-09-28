/**
 * Where a proposal's files live: the `proposals` bucket (migration 039).
 *
 *   <proposal id>/pack.zip             the export pack it was built from
 *   <proposal id>/v<n>/proposal.html   what the engine edits
 *   <proposal id>/v<n>/proposal.pdf    what the consultant downloads
 *   <proposal id>/v<n>/pages/page-NN.png
 *   <proposal id>/sent/<uuid>.pdf     the PDF a consultant actually sent (040)
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

/** Where the PDF a consultant actually sent is uploaded: a fresh name each time. */
export function sentPdfPath(proposalId: string, name: string): string {
  return `${proposalId}/sent/${name}.pdf`
}

/**
 * Whether a path the browser hands back is one of this proposal's sent PDFs.
 * The browser uploads it itself, so the studio checks the name before it
 * records it, and never trusts a path into another proposal.
 */
export function isSentPdfPath(proposalId: string, path: unknown): path is string {
  if (typeof path !== 'string') return false
  const prefix = `${proposalId}/sent/`
  return path.startsWith(prefix)
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$/.test(path.slice(prefix.length))
}
