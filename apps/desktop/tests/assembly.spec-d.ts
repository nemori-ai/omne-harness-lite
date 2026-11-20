import { expectTypeOf, it } from 'vitest'
import { assetGovernanceKey, assetsCategoryPage } from '@omne-harness/assets-ui/cordis'
import { createMcpUiModule } from '@omne-harness/mcp-ui/cordis'
import { modelChoicesKey } from '@omne-harness/model-ui/cordis'
import { sessionModelChoicesKey, sessionWorkspaceChoicesKey } from '@omne-harness/session-ui/cordis'
import { serviceKey } from '@omne-harness/shell-contract'
import { workspaceChoicesKey } from '@omne-harness/workspace-ui/cordis'
import { handOver } from '../src/page/hand-over.ts'

it('the asset governance key fits the port MCP declares', () => {
  expectTypeOf(createMcpUiModule).toBeCallableWith({
    page: assetsCategoryPage,
    governance: assetGovernanceKey,
  })
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

it('the list Model gives fits the place the session interface opened for one', () => {
  expectTypeOf(handOver).toBeCallableWith(sessionModelChoicesKey, modelChoicesKey)
})

it('a list of another shape does not compile at the assembly', () => {
  const byNumber = serviceKey<{ list: (tenant: number) => Promise<never> }>('by-number')
  // @ts-expect-error the session interface asks for the list by tenant text
  handOver(sessionModelChoicesKey, byNumber)
  const names = serviceKey<{ list: (tenant: string) => Promise<readonly string[]> }>('names')
  // @ts-expect-error a list of names is not a listing that says whether each can be picked
  handOver(sessionModelChoicesKey, names)
})

it('the list Workspace gives fits the place the session interface opened for one', () => {
  expectTypeOf(handOver).toBeCallableWith(sessionWorkspaceChoicesKey, workspaceChoicesKey)
  // @ts-expect-error a list of models is not a list of workspaces
  handOver(sessionWorkspaceChoicesKey, modelChoicesKey)
})
