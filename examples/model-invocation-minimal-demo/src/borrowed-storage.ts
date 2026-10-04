import type { Context } from '@deepseek-ai/cordis'
import { definePlugin } from '@omne-harness-lite/kernel-basis'
import type { AtomicStorage } from '@omne-harness-lite/storage'
import { StorageOwnerService, STORAGE_OWNER } from '@omne-harness-lite/storage/cordis'
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
    // Existing storage identity is part of StorageUnit.assertStorage; do not wrap it.
    ctx.provide('storage', borrow.storage)
  },
})
