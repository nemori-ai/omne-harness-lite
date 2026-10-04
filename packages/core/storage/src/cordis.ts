import { Context, Service } from '@deepseek-ai/cordis'
import type { StorageOwnerOperations } from './owner.ts'
/** @owner packages/core/storage */
export abstract class StorageOwnerService extends Service implements StorageOwnerOperations {
  static readonly provide = 'storageOwner'
  constructor(ctx: Context) { super(ctx, StorageOwnerService.provide) }
  abstract borrow(): ReturnType<StorageOwnerOperations['borrow']>
}
export const STORAGE_OWNER = StorageOwnerService.provide

declare module '@deepseek-ai/cordis' { interface Context { storageOwner: StorageOwnerService } }
