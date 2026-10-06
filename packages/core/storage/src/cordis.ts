import { Service, type Context } from '@deepseek-ai/cordis'
import type { Storage } from './protocol.ts'
import type { StorageStartupResources, StorageCompletionPort } from './startup.ts'

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

/** @owner packages/core/storage */
export abstract class StorageStartup extends Service implements StorageStartupResources {
  static readonly provide = 'storageStartup'
  constructor(ctx: Context) {
    super(ctx, StorageStartup.provide)
  }
  abstract readonly migrations: StorageStartupResources['migrations']
  abstract readonly upgrade: StorageStartupResources['upgrade']
}
export const STORAGE_STARTUP_SERVICE = StorageStartup.provide

/** @owner packages/core/storage */
export abstract class StorageCompletion extends Service implements StorageCompletionPort {
  static readonly provide = 'storageCompletion'
  constructor(ctx: Context) {
    super(ctx, StorageCompletion.provide)
  }
  abstract closed: StorageCompletionPort['closed']
}
export const STORAGE_COMPLETION_SERVICE = StorageCompletion.provide

declare module '@deepseek-ai/cordis' {
  interface Context {
    storage: StorageService
    storageStartup: StorageStartup
    storageCompletion: StorageCompletion
  }
}
