import { isAbsolute } from 'node:path'
import { z } from 'zod'
import type { RowSpec } from './loader.ts'
import { sessionStorageRowConfigSchema } from './rows/session-storage/config.ts'
import { prepareTenantDirectory } from './rows/session-storage/initialize.ts'

const storageLocationSchema = z.object({
  storageRoot: z.string().refine(isAbsolute),
})

/** Prepare only the enabled real directory, using the final layered row configurations. */
export function prepareStartupDirectory(rows: readonly RowSpec[]): void {
  const session = rows.find(
    spec => spec.row.id === 'session-storage' && spec.implementation === 'real',
  )
  if (session === undefined) return
  const storage = rows.find(spec => spec.row.id === 'storage' && spec.implementation === 'real')
  if (storage === undefined) throw new Error('real directory requires a real storage row')
  const { directoryFile } = sessionStorageRowConfigSchema.parse(session.row.config)
  const { storageRoot } = storageLocationSchema.parse(storage.row.config)
  prepareTenantDirectory({ storageRoot, directoryFile })
}
