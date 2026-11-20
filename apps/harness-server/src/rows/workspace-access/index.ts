import type { Context } from '@deepseek-ai/cordis'
import { accessRegistryKey } from '@omne-harness/access-cordis-contract/cordis'
import { principalIssuerKey } from '@omne-harness/identity/cordis'
import type { WorkspaceFaces, WorkspacePrincipals } from '@omne-harness/workspace-access'
import { createWorkspaceAccessPlugin } from '@omne-harness/workspace-access/cordis'
import {
  workspaceCatalogKey,
  workspaceInstancesKey,
  workspaceGovernanceKey,
} from '@omne-harness/workspace-cordis-contract/cordis'
import { defineRow } from '../../row.ts'
import { memberActingOfCall } from '../server-entry/identity.ts'

function principalsOf(ctx: Context): WorkspacePrincipals {
  const actForMember = memberActingOfCall(ctx)
  return {
    async actingFor(login, tenant) {
      const issued = await actForMember(login, tenant)
      return issued.outcome === 'issued' ? { ok: issued.principal } : { refused: issued.outcome }
    },
  }
}

function facesOf(ctx: Context): WorkspaceFaces | undefined {
  const governance = ctx.get(workspaceGovernanceKey)
  const instances = ctx.get(workspaceInstancesKey)
  const catalog = ctx.get(workspaceCatalogKey)
  const absent = governance === undefined || instances === undefined || catalog === undefined
  return absent ? undefined : { governance, instances, catalog }
}

const plugin = createWorkspaceAccessPlugin({ principals: principalsOf, faces: facesOf })

export const workspaceAccessRow = defineRow({
  row: 'workspace-access',
  implementation: 'real',
  manifest: {
    provides: [],
    injects: [accessRegistryKey, principalIssuerKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin: { ...plugin, inject: [accessRegistryKey, principalIssuerKey] },
})
