import type { Context } from '@deepseek-ai/cordis'
import { defineRow } from '../../src/row.ts'
import { provideTenantAssets, tenantAssetsKey } from '../../src/rows/tenant-assets/service.ts'

/** The neighbour that holds a tenant's assets, for an assembly that leaves the assets rows out: no tenant holds any. */
export const tenantAssetsStandIn = defineRow({
  row: 'tenant-assets',
  implementation: 'contract-double',
  manifest: { provides: [tenantAssetsKey], injects: [], sameProviderGroup: null },
  lifecycle: { kind: 'none' },
  plugin: {
    name: 'tenant-assets-stand-in',
    apply(ctx: Context) {
      provideTenantAssets(ctx, {
        open: async () => undefined,
        standing: async () => 'unregistered',
        layerSources: () => [],
        official: () => [],
      })
    },
  },
})
