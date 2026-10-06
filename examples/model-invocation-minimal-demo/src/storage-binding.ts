import { definePlugin } from '@omne-harness-lite/kernel-basis/cordis'
import { SqlStorageService } from '@omne-harness-lite/storage-sql/cordis'
import type { SqlStorage } from '@omne-harness-lite/storage-sql'
import { z } from 'zod'

/** Publishes the application-owned SQL instance. The application closes it after consumers drain. */
export function storageBinding(storage: SqlStorage) {
  return definePlugin({
    name: 'acceptance-storage',
    Config: z.object({}).strict(),
    apply(ctx) {
      new SqlStorageService(ctx, storage)
    },
  })
}
