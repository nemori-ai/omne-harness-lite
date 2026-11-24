import { Service, type Context } from '@deepseek-ai/cordis'
import type { ActingForTenantPrincipal } from '@omne-harness/identity'
import type { TenantId } from '@omne-harness/legal-identity'
import type { EntryObjectModule } from '../types.ts'
import { ENTRY_COMPONENTS, tenantScopeIssuerOf } from './principals.ts'

export const tenantScopePrincipalsKey = ENTRY_COMPONENTS.tenantScope

export abstract class TenantScopePrincipalsService extends Service {
  constructor(ctx: Context) {
    super(ctx, tenantScopePrincipalsKey)
  }
  abstract readonly forTenant: (tenant: TenantId) => ActingForTenantPrincipal | undefined
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    tenantScopePrincipals: TenantScopePrincipalsService
  }
}

export const tenantScopePrincipals: EntryObjectModule = {
  name: tenantScopePrincipalsKey,
  implementation: 'real',
  install(scope, env) {
    new EntryTenantScopePrincipals(scope, tenantScopeIssuerOf(env))
  },
}

class EntryTenantScopePrincipals extends TenantScopePrincipalsService {
  readonly forTenant: TenantScopePrincipalsService['forTenant']
  constructor(ctx: Context, issue: TenantScopePrincipalsService['forTenant']) {
    super(ctx)
    let active = true
    ctx.effect(
      () => () => {
        active = false
      },
      'tenant-scope-principals.active',
    )
    this.forTenant = tenant => (active ? issue(tenant) : undefined)
  }
}
