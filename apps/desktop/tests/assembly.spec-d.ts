import { it } from 'vitest'
import { assetGovernanceKey, assetsCategoryPage } from '@omne-harness/assets-ui/cordis'
import { createMcpUiModule } from '@omne-harness/mcp-ui/cordis'
import { serviceKey } from '@omne-harness/shell-contract'

it('the asset governance key fits the port MCP declares', () => {
  createMcpUiModule({ page: assetsCategoryPage, governance: assetGovernanceKey })
})

it('a key for a port of another shape does not compile at the assembly', () => {
  const counted = serviceKey<{
    open: (tenantText: string, category: string) => { getSnapshot: () => number }
  }>('counted')
  // @ts-expect-error the snapshot is not what MCP reads
  createMcpUiModule({ page: assetsCategoryPage, governance: counted })
  const byTenantId = serviceKey<{
    open: (tenant: { organization: string }, category: string) => unknown
  }>('by-tenant-id')
  // @ts-expect-error the port is opened by tenant text, not by a tenant object
  createMcpUiModule({ page: assetsCategoryPage, governance: byTenantId })
})
