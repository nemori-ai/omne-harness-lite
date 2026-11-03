// The service definition of `systemActionAuthorization` (R2-D245, R2-D247): the system action
// decision (authorization SPEC AU-12) over the maintenance grant table of this release, as one
// Cordis key. The `authorization` row owns the key and is its one provider; the key is in the
// trusted table, so only the rows the assembly page lists see it (today `session-storage`).
//
// Why the key is defined here and not in `@omne-harness/authorization`: the grant table it answers
// from is a release constant of this application (`grants.ts`, tightened by the row configuration
// `maintenanceGrants`), and the provider and its one consumer are rows of this application. The
// package has no Cordis entry. When a member outside this application needs the key, it moves to
// a new `@omne-harness/authorization/cordis` entry (IC-4), with the same name and shape.
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
