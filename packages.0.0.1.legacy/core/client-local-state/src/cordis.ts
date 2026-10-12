import { Service, type Context } from '@deepseek-ai/cordis'
import type { ClientLocalState, LocalStateStorageFactory } from './index.ts'

/** @contract capability.client-local-state */
export abstract class ClientLocalStateService extends Service implements ClientLocalState {
  static readonly provide = 'clientLocalState' as const
  constructor(ctx: Context) {
    super(ctx, ClientLocalStateService.provide)
  }
  abstract read: ClientLocalState['read']
  abstract compareAndReplace: ClientLocalState['compareAndReplace']
}

export const CLIENT_LOCAL_STATE_SERVICE = ClientLocalStateService.provide

/** @owner packages/core/client-local-state */
export abstract class ClientStateStorage extends Service implements LocalStateStorageFactory {
  static readonly provide = 'clientStateStorage' as const
  constructor(ctx: Context) {
    super(ctx, ClientStateStorage.provide)
  }
  abstract open: LocalStateStorageFactory['open']
}

export const CLIENT_STATE_STORAGE_SERVICE = ClientStateStorage.provide

declare module '@deepseek-ai/cordis' {
  interface Context {
    clientLocalState: ClientLocalStateService
    clientStateStorage: ClientStateStorage
  }
}
