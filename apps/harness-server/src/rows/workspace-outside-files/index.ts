import type { Context } from '@deepseek-ai/cordis'
import {
  runtimeContextTenantBlocksKey,
  runtimeContextTenantScopeKey,
} from '@omne-harness/runtime-context-cordis-contract/cordis'
import { tenantScopePrincipalsKey } from '../../entry/tenant-scope-principals.ts'
import { defineRow } from '../../row.ts'
import { tenantIndependentSettingsKey } from '../governance/independent-settings-service.ts'
import { createOutsideFilesReader, outsideFilesBlock } from './block.ts'
import { WorkspaceOutsideFilesService, workspaceOutsideFilesKey } from './service.ts'
import { outsideFilesReader } from './setting.ts'

/** The setting for files outside the workspace through Runtime Context: contributes its block, and reads it for whoever accepts a tool call. */
export const workspaceOutsideFilesRow = defineRow({
  row: 'workspace-outside-files',
  implementation: 'real',
  manifest: {
    provides: [workspaceOutsideFilesKey],
    injects: [runtimeContextTenantBlocksKey, tenantIndependentSettingsKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'body', phase: 'composition' },
  async body(ctx: Context) {
    const supply = outsideFilesReader(() => ctx.get(tenantIndependentSettingsKey))
    ctx.inject([runtimeContextTenantBlocksKey], child => {
      child[runtimeContextTenantBlocksKey].register({ blocks: [outsideFilesBlock(supply)] })
    })
    new WorkspaceOutsideFilesService(
      ctx,
      createOutsideFilesReader<unknown>({
        scope: () => ctx.get(runtimeContextTenantScopeKey),
        principal: async tenant => ctx.get(tenantScopePrincipalsKey)?.forTenant(tenant) ?? null,
      }),
    )
    return { stop: async () => ({ kind: 'settled' as const }) }
  },
})
