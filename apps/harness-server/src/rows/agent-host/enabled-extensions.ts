import type { Context } from '@deepseek-ai/cordis'
import type { EnabledExtensions } from '@omne-harness/agent-contract'
import { runtimeContextTenantScopeKey } from '@omne-harness/runtime-context-cordis-contract/cordis'
import { createEnabledExtensions } from '../../entry/loop-extensions.ts'
import { tenantScopePrincipalsKey } from '../../entry/tenant-scope-principals.ts'

/** The port of the tenant-enabled extensions for this row: both services are asked at each read. */
export function enabledExtensionsOf(ctx: Context): EnabledExtensions<unknown> {
  return createEnabledExtensions({
    scope: () => ctx.get(runtimeContextTenantScopeKey),
    principal: tenant => ctx.get(tenantScopePrincipalsKey)?.forTenant(tenant),
  })
}
