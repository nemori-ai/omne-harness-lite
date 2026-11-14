import { type Context, Service } from '@deepseek-ai/cordis'
import type { SessionProtectedBasisSource } from '@omne-harness/session-storage-sql'

export abstract class SessionPermissionBackendService extends Service {
  static readonly provide = 'sessionPermissionBackend'
  constructor(ctx: Context) {
    super(ctx, SessionPermissionBackendService.provide)
  }
  abstract readonly basis: SessionProtectedBasisSource<unknown>
}

export const sessionPermissionBackendKey = SessionPermissionBackendService.provide

declare module '@deepseek-ai/cordis' {
  interface Context {
    sessionPermissionBackend: SessionPermissionBackendService
  }
}
