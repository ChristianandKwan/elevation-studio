import { createClient } from '@/lib/supabase/client'
import { STUDIO_SIGNED_URL_TTL } from '@/lib/utils'
import { WORK_COLUMNS, workStoragePath } from '@/lib/works'
import { rowToWork } from '@/lib/workRows'
import type { WorkMeta } from '@/lib/workMeta'
import type { Work } from '@/types'

/** Re-exported so callers of `uploadWork` need only this module. */
export type { WorkMeta }

/**
 * Upload one image and create its work — without placing it anywhere. The
 * studio then adds a placement; the index stops here.
 *
 * Returns null after reporting if either step fails. A failed insert takes
 * its uploaded file with it so the sweep has nothing to find.
 */
export async function uploadWork(
  projectId: string,
  file: File,
  meta: WorkMeta,
  onStatus: (msg: string) => void,
): Promise<Work | null> {
  const supabase = createClient()
  const path = workStoragePath(projectId, file.name, crypto.randomUUID())

  const { error: uploadError } = await supabase.storage.from('artwork-images').upload(path, file)
  if (uploadError) { onStatus('Upload failed: ' + uploadError.message); return null }

  const { data: signed } = await supabase.storage.from('artwork-images').createSignedUrl(path, STUDIO_SIGNED_URL_TTL)

  const name = meta.name.trim() || file.name.replace(/\.[^.]+$/, '')
  const { data: row, error } = await supabase.from('works').insert({
    project_id: projectId,
    name,
    artist: meta.artist.trim(),
    // The spelling is what gets displayed; the id is the identity. Writing
    // only the spelling leaves a work whose artist cannot be renamed or
    // given a standing note, and which splits from its own artist's group.
    artist_id: meta.artistId ?? null,
    image_path: path,
    w_cm: meta.wCm,
    h_cm: meta.hCm,
    price: meta.price,
    year: meta.year,
    medium: meta.medium,
    edition: meta.edition,
    source: meta.source,
  }).select(WORK_COLUMNS).single()

  if (error || !row) {
    onStatus('Could not save this work: ' + (error?.message ?? 'unknown error'))
    await supabase.storage.from('artwork-images').remove([path])
    return null
  }
  return rowToWork(row as Record<string, unknown>, signed?.signedUrl ?? null)
}
