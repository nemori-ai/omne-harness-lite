import { type Context, Service } from '@deepseek-ai/cordis'
import type { SystemActionAuthorization } from '@omne-harness/authorization'

/** @owner apps/harness-server/src/rows/authorization */
export abstract class SystemActionAuthorizationService
  extends Service
  implements SystemActionAuthorization
{
  static readonly provide = 'systemActionAuthorization'
  constructor(ctx: Context) {
    super(ctx, SystemActionAuthorizationService.provide)
  }
  abstract readonly check: SystemActionAuthorization['check']
}
export const systemActionAuthorizationKey = SystemActionAuthorizationService.provide

declare module '@deepseek-ai/cordis' {
  interface Context {
    systemActionAuthorization: SystemActionAuthorizationService
  }
}
