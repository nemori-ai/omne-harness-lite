import { z } from 'zod'
import type { PrincipalVerifier, TenantStandingSource } from '@omne-harness/identity'
import { principalVerifierKey, tenantStandingKey } from '@omne-harness/identity/cordis'
import { combinationManifest, manifestDigest, type SqlStorage } from '@omne-harness/sql-contract'
import { storageKey } from '@omne-harness/sql-contract/cordis'
import {
  workspaceCatalogKey,
  workspaceGovernanceKey,
  workspaceInstancesKey,
  workspaceTypesKey,
} from '@omne-harness/workspace-cordis-contract/cordis'
import { DirectoryType } from '@omne-harness/workspace-filesystem'
import {
  createDomainBinding,
  workspacePersistenceParticipant,
  type WorkspaceBinding,
} from '@omne-harness/workspace-local'
import { createWorkspaceLocalPlugin } from '@omne-harness/workspace-local/cordis'
import { defineRow } from '../../row.ts'
import { productionStorageCatalog } from '../storage/production-catalog.ts'
import { createWorkspaceAuthority } from './authority.ts'

/** The name of this node. A position belongs to at most one active instance of a node. */
export const workspaceConfig = z.strictObject({ node: z.string().min(1) })

/** The storage combination of the workspace participant, from the catalogue of the running code. */
export async function workspaceCombination(): Promise<WorkspaceBinding> {
  const catalog = await productionStorageCatalog()
  const participants = [workspacePersistenceParticipant]
  const manifest = combinationManifest({ catalog, participants })
  if (manifest.kind !== 'manifest') throw new Error('workspace combination is not registrable')
  const digest = manifestDigest(manifest.manifest)
  return { combinationVersion: `harness-workspace/${digest.slice(0, 16)}`, manifestDigest: digest }
}

export const workspaceRow = defineRow({
  row: 'workspace',
  implementation: 'real',
  manifest: {
    provides: [
      workspaceGovernanceKey,
      workspaceInstancesKey,
      workspaceCatalogKey,
      workspaceTypesKey,
    ],
    injects: [storageKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'body', phase: 'composition' },
  Config: workspaceConfig,
  async body(ctx, raw) {
    const { node } = workspaceConfig.parse(raw)
    const logger = ctx.logger('workspace')
    const provider = ctx.plugin(createWorkspaceLocalPlugin(), {
      node,
      sql: {
        bind: createDomainBinding({
          storage: ctx.get(storageKey) as SqlStorage,
          combination: workspaceCombination,
          report: reason => logger.warn('no workspace storage: %s', reason),
        }),
      },
      authority: createWorkspaceAuthority({
        verifier: () => ctx.get(principalVerifierKey) as PrincipalVerifier | undefined,
        standing: () => ctx.get(tenantStandingKey) as TenantStandingSource | undefined,
      }),
    })
    await provider.await()
    ctx.inject([workspaceTypesKey], child => {
      child.workspaceTypes.contribute(new DirectoryType())
    })
    return {
      async stop() {
        await provider.dispose()
        return { kind: 'settled' }
      },
    }
  },
})
