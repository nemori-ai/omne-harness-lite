import { Service, type Context } from '@deepseek-ai/cordis'
import type { Storage } from './protocol.ts'
import type { StorageOwnerOperations } from './owner.ts'

/** @owner packages/core/storage */
export abstract class StorageService extends Service implements Storage {
  static readonly provide = 'storage'

  constructor(ctx: Context) {
    super(ctx, StorageService.provide)
  }

  abstract read: Storage['read']
  abstract write: Storage['write']
}

export const STORAGE_SERVICE = StorageService.provide

declare module '@deepseek-ai/cordis' {
  interface Context {
    storage: StorageService
  }
}

/** Physical ownership remains with the application; this service lends the adopted instance. */
export abstract class StorageOwnerService extends Service implements StorageOwnerOperations {
  static readonly provide = 'storageOwner'
  constructor(ctx: Context) { super(ctx, StorageOwnerService.provide) }
  abstract borrow(): ReturnType<StorageOwnerOperations['borrow']>
}
export const STORAGE_OWNER = StorageOwnerService.provide

declare module '@deepseek-ai/cordis' { interface Context { storageOwner: StorageOwnerService } }
