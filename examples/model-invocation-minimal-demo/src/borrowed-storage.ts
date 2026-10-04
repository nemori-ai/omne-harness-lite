import type { Context } from '@deepseek-ai/cordis'
import { definePlugin } from '@omne-harness-lite/kernel-basis/cordis'
import type { AtomicStorage } from '@omne-harness-lite/storage'
import { StorageOwnerService, STORAGE_OWNER } from '@omne-harness-lite/storage/cordis'
import { SqlStorage } from '@omne-harness-lite/storage-sql'
import { SqlStorageService } from '@omne-harness-lite/storage-sql/cordis'
import { z } from 'zod'

export class StorageBacking extends StorageOwnerService {
  constructor(ctx: Context, private readonly storage: AtomicStorage) { super(ctx) }
  borrow() { return { storage: this.storage, async release() {} } }
}
export const borrowedStorage = definePlugin({
  name: 'acceptance-storage', inject: [STORAGE_OWNER], Config: z.object({}).strict(),
  apply(ctx) {
    const borrow = ctx.storageOwner.borrow()
    ctx.effect(() => borrow.release)
    // This application assembles the SQL provider. Its service preserves the exact transaction identity.
    if (!(borrow.storage instanceof SqlStorage)) throw new TypeError('SQL storage backing required')
    new SqlStorageService(ctx, borrow.storage)
  },
})
