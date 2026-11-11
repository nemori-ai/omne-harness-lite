import { Service, type Context } from '@deepseek-ai/cordis'
import type { ActingForTenantPrincipal } from '@omne-harness/identity'
import type { TenantId } from '@omne-harness/legal-identity'
import type { EntryObjectModule } from '../types.ts'
import { ENTRY_COMPONENTS, sessionModesIssuerOf } from './principals.ts'

export const sessionModesPrincipalsKey = ENTRY_COMPONENTS.sessionModes

export abstract class SessionModesPrincipalsService extends Service {
  constructor(ctx: Context) {
    super(ctx, sessionModesPrincipalsKey)
  }
  abstract readonly forTenant: (tenant: TenantId) => ActingForTenantPrincipal | undefined
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    sessionModesPrincipals: SessionModesPrincipalsService
  }
}

export const sessionModesPrincipals: EntryObjectModule = {
  name: sessionModesPrincipalsKey,
  implementation: 'real',
  install(scope, env) {
    new EntrySessionModesPrincipals(scope, sessionModesIssuerOf(env))
  },
}

class EntrySessionModesPrincipals extends SessionModesPrincipalsService {
  readonly forTenant: SessionModesPrincipalsService['forTenant']
  constructor(ctx: Context, issue: SessionModesPrincipalsService['forTenant']) {
    super(ctx)
    let active = true
    ctx.effect(
      () => () => {
        active = false
      },
      'session-modes-principals.active',
    )
    this.forTenant = tenant => (active ? issue(tenant) : undefined)
  }
}
