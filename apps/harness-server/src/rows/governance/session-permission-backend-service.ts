import { type Context, Service } from '@deepseek-ai/cordis'
import type { SessionProtectedBasisSource } from '@omne-harness/session-storage-sql'

/**
 * Application assembly port. The backend of a Session permission write forms the commit basis of
 * the tenant that the command names. Forming a basis does not grant permission to write: the
 * access decision qualified the command before, and the commit checks the basis again.
 */
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
