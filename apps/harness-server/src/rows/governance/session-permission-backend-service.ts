import { type Context, Service } from '@deepseek-ai/cordis'
import type { SessionPermissionBackendReader } from './session-permission-commit.ts'

/** Application assembly port; selecting a backend does not grant permission to write. */
export abstract class SessionPermissionBackendService extends Service {
  static readonly provide = 'sessionPermissionBackend'
  constructor(ctx: Context) {
    super(ctx, SessionPermissionBackendService.provide)
  }
  abstract readonly read: SessionPermissionBackendReader
}

export const sessionPermissionBackendKey = SessionPermissionBackendService.provide

declare module '@deepseek-ai/cordis' {
  interface Context {
    sessionPermissionBackend: SessionPermissionBackendService
  }
}
