import type { Context, Plugin } from '@deepseek-ai/cordis'
import type { StaticScopeHolder } from '@omne-harness/runtime-context-contract'
import {
  RuntimeContextTenantScopeService,
  runtimeContextKey,
  runtimeContextTenantBlocksKey,
} from '@omne-harness/runtime-context-cordis-contract/cordis'
import { createStaticScopeHolder } from './holder.ts'

export const TENANT_SCOPE_KIND = 'tenant'

class TenantScopeProvider extends RuntimeContextTenantScopeService<unknown> {
  private readonly holder: StaticScopeHolder<unknown>

  constructor(ctx: Context) {
    super(ctx)
    this.holder = createStaticScopeHolder<unknown>({
      kind: TENANT_SCOPE_KIND,
      runtime: ctx[runtimeContextKey],
      registration: () => ctx[runtimeContextTenantBlocksKey].current(),
    })
  }

  scopeOf(...args: Parameters<StaticScopeHolder<unknown>['scopeOf']>) {
    return this.holder.scopeOf(...args)
  }
  ensure(...args: Parameters<StaticScopeHolder<unknown>['ensure']>) {
    return this.holder.ensure(...args)
  }
  issue(...args: Parameters<StaticScopeHolder<unknown>['issue']>) {
    return this.holder.issue(...args)
  }
}

export const tenantScopePlugin: Plugin.Object = {
  name: 'runtime-context-tenant-scope',
  inject: [runtimeContextKey, runtimeContextTenantBlocksKey],
  apply(ctx: Context) {
    new TenantScopeProvider(ctx)
  },
}
