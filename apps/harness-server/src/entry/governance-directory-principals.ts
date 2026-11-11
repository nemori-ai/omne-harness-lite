import { Service, type Context } from '@deepseek-ai/cordis'
import type { ActingForTenantPrincipal } from '@omne-harness/identity'
import type { TenantId } from '@omne-harness/legal-identity'
import type { EntryObjectModule } from '../types.ts'
import { ENTRY_COMPONENTS, governanceDirectoryIssuerOf } from './principals.ts'

export const governanceDirectoryPrincipalsKey = ENTRY_COMPONENTS.governanceDirectory

export abstract class GovernanceDirectoryPrincipalsService extends Service {
  constructor(ctx: Context) {
    super(ctx, governanceDirectoryPrincipalsKey)
  }
  abstract readonly forTenant: (tenant: TenantId) => ActingForTenantPrincipal | undefined
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    governanceDirectoryPrincipals: GovernanceDirectoryPrincipalsService
  }
}

export const governanceDirectoryPrincipals: EntryObjectModule = {
  name: governanceDirectoryPrincipalsKey,
  implementation: 'real',
  install(scope, env) {
    new EntryGovernanceDirectoryPrincipals(scope, governanceDirectoryIssuerOf(env))
  },
}

class EntryGovernanceDirectoryPrincipals extends GovernanceDirectoryPrincipalsService {
  readonly forTenant: GovernanceDirectoryPrincipalsService['forTenant']
  constructor(ctx: Context, issue: GovernanceDirectoryPrincipalsService['forTenant']) {
    super(ctx)
    let active = true
    ctx.effect(
      () => () => {
        active = false
      },
      'governance-directory-principals.active',
    )
    this.forTenant = tenant => (active ? issue(tenant) : undefined)
  }
}
