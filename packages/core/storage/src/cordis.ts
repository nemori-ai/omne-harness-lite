import { Service, type Context } from '@deepseek-ai/cordis'
import type { Storage } from './protocol.ts'

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
