import { createClient } from '@/lib/supabase/client'
import { STUDIO_SIGNED_URL_TTL } from '@/lib/utils'
import { WORK_COLUMNS, workStoragePath } from '@/lib/works'
import { rowToWork } from '@/lib/workRows'
import type { Work } from '@/types'

/** What the consultant types in when adding a work. */
export interface WorkMeta {
  name: string
  wCm: number
  hCm: number
  price: number
  artist: string
}

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
    image_path: path,
    w_cm: meta.wCm,
    h_cm: meta.hCm,
    price: meta.price,
  }).select(WORK_COLUMNS).single()

  if (error || !row) {
    onStatus('Could not save this work: ' + (error?.message ?? 'unknown error'))
    await supabase.storage.from('artwork-images').remove([path])
    return null
  }
  return rowToWork(row as Record<string, unknown>, signed?.signedUrl ?? null)
}
