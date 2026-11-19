import type { Context, Plugin } from '@deepseek-ai/cordis'
import {
  runtimeContextKey,
  runtimeContextTenantBlocksKey,
  runtimeContextTenantBlocksPlugin,
  runtimeContextTenantScopeKey,
} from '@omne-harness/runtime-context-cordis-contract/cordis'
import { tenantScopePlugin } from '@omne-harness/static-scope-holder/cordis'
import { defineRow } from '../../row.ts'

// The registration point stays while Runtime Context is away; the holder comes and goes with it.
const plugin: Plugin.Object = {
  name: 'runtime-context-tenant-scope',
  apply(ctx: Context) {
    ctx.plugin(runtimeContextTenantBlocksPlugin)
    ctx.plugin(tenantScopePlugin)
  },
}

export const runtimeContextTenantScopeRow = defineRow({
  row: 'runtime-context-tenant-scope',
  implementation: 'real',
  manifest: {
    provides: [runtimeContextTenantBlocksKey, runtimeContextTenantScopeKey],
    injects: [runtimeContextKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin,
})
