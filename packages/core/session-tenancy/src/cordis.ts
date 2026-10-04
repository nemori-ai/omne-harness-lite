import { Context, Service } from '@deepseek-ai/cordis'
import type { SessionAccessOperations, SessionAccessAuthorityOperations } from './index.ts'

/** @owner packages/core/session-tenancy */
export abstract class SessionAccessService extends Service implements SessionAccessOperations {
  static readonly provide = 'sessionAccess'
  constructor(ctx: Context) { super(ctx, SessionAccessService.provide) }
  abstract authorize(...args: Parameters<SessionAccessOperations['authorize']>): ReturnType<SessionAccessOperations['authorize']>
}
export const SESSION_ACCESS = SessionAccessService.provide

/** @owner packages/core/session-tenancy */
export abstract class SessionAccessAuthorityService extends Service implements SessionAccessAuthorityOperations {
  static readonly provide = 'sessionAccessAuthority'
  constructor(ctx: Context) { super(ctx, SessionAccessAuthorityService.provide) }
  abstract check(...args: Parameters<SessionAccessAuthorityOperations['check']>): ReturnType<SessionAccessAuthorityOperations['check']>
}
export const SESSION_ACCESS_AUTHORITY = SessionAccessAuthorityService.provide

declare module '@deepseek-ai/cordis' {
  interface Context {
    sessionAccess: SessionAccessService
    sessionAccessAuthority: SessionAccessAuthorityService
  }
}
import type { SessionTenancyService as Operations0 } from './index.ts'

/** @contract capability.session-tenancy */
export abstract class SessionTenancyService extends Service implements Operations0 {
  static readonly provide = 'sessionTenancy'
  constructor(ctx: Context) { super(ctx, SessionTenancyService.provide) }
  abstract holdingTenant(...args: Parameters<Operations0['holdingTenant']>): ReturnType<Operations0['holdingTenant']>
}
export const SESSION_TENANCY = SessionTenancyService.provide

declare module '@deepseek-ai/cordis' {
  interface Context {
    sessionTenancy: SessionTenancyService
  }
}
