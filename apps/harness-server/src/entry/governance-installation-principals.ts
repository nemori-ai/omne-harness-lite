import { Service, type Context } from '@deepseek-ai/cordis'
import type { ActingForTenantPrincipal } from '@omne-harness/identity'
import type { TenantId } from '@omne-harness/legal-identity'
import type { EntryObjectModule } from '../types.ts'
import { ENTRY_COMPONENTS, governanceInstallationIssuerOf } from './principals.ts'

export const governanceInstallationPrincipalsKey = ENTRY_COMPONENTS.governanceInstallation

export abstract class GovernanceInstallationPrincipalsService extends Service {
  constructor(ctx: Context) {
    super(ctx, governanceInstallationPrincipalsKey)
  }
  abstract readonly forTenant: (tenant: TenantId) => ActingForTenantPrincipal | undefined
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    governanceInstallationPrincipals: GovernanceInstallationPrincipalsService
  }
}

export const governanceInstallationPrincipals: EntryObjectModule = {
  name: governanceInstallationPrincipalsKey,
  implementation: 'real',
  install(scope, env) {
    new EntryGovernanceInstallationPrincipals(scope, governanceInstallationIssuerOf(env))
  },
}

class EntryGovernanceInstallationPrincipals extends GovernanceInstallationPrincipalsService {
  readonly forTenant: GovernanceInstallationPrincipalsService['forTenant']
  constructor(ctx: Context, issue: GovernanceInstallationPrincipalsService['forTenant']) {
    super(ctx)
    let active = true
    ctx.effect(
      () => () => {
        active = false
      },
      'governance-installation-principals.active',
    )
    this.forTenant = tenant => (active ? issue(tenant) : undefined)
  }
}
