import { randomUUID } from 'node:crypto'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createCategoryRegistry } from '@omne-harness/assets'
import {
  assetsPublicationCommand,
  assetsSqlMaterials,
  AssetsPublicationProjectionSchema,
  createAssetsLocal,
} from '@omne-harness/assets-local'
import {
  combinationManifest,
  manifestDigest,
  type FactCommandV2,
  type SqlMaterialCatalog,
  type SqlStorage,
} from '@omne-harness/sql-contract'
import {
  settingsSqlMaterials,
  settingsStandaloneMaterials,
  type SettingsTargetProjection,
} from '@omne-harness/settings-local'
import { GovernanceAdoptionCurrentSchema } from '@omne-harness/governance-local'
import { SETTINGS_RECOVERY_PARTICIPANTS } from '@omne-harness/settings-local/preparation'
import {
  createGovernanceAdoptionProjection,
  governanceCurrentParticipant,
  ADOPTION_CURRENT_PARTICIPANT,
} from '../../../dist/rows/governance/adoption-current.js'
import {
  permissionSqlParticipants,
  toolPermissionReleaseParticipant,
} from '../../../dist/rows/governance/permission-materials.js'
import { SUPPORT_PARTICIPANT } from '../../../dist/rows/governance/permission-protocol.js'
import { createSqliteStorage } from '@omne-harness/sqlite-provider'
import {
  createToolAssetCategory,
  toolAssetPublication,
} from '../../../src/rows/governance/tool-assets.ts'
import { loadProductionRelease, type ToolRelease } from '../../../src/entry/tool-release.ts'
import { providerConfig } from '../storage/fixtures/tree.ts'

export async function toolAssetsWorld(
  existingRoot?: string,
  options: {
    extraMaterials?: Pick<SqlMaterialCatalog, 'participants' | 'migrations' | 'readHandlers'>
    initialize?: (storage: SqlStorage) => Promise<string>
    release?: Extract<ToolRelease, { kind: 'trusted' }>
    releaseParticipant?: SqlMaterialCatalog['participants'][number]
  } = {},
) {
  const release = options.release ?? (await loadProductionRelease())
  if (release.kind !== 'trusted') throw new Error(JSON.stringify(release))
  const entry = release.manifest.entries.find(candidate => candidate.asset.name === 'Shell')
  if (entry === undefined) throw new Error('Shell publication absent')
  const publication = toolAssetPublication(entry)
  const root = existingRoot ?? realpathSync(mkdtempSync(join(tmpdir(), 'tool-assets-')))
  const assets = assetsSqlMaterials()
  const settings = settingsSqlMaterials()
  const standalone = settingsStandaloneMaterials()
  const baseMaterials = {
    catalogProtocol: 'sql-catalog/1' as const,
    participants: [
      ...assets.participants,
      ...settings.participants,
      ...standalone.participants,
      ...permissionSqlParticipants().filter(
        value => value.participant === SUPPORT_PARTICIPANT.participant,
      ),
      options.releaseParticipant ?? toolPermissionReleaseParticipant(release),
      governanceCurrentParticipant(),
    ],
    migrations: [...assets.migrations, ...standalone.migrations, ...settings.migrations],
    readHandlers: [...assets.readHandlers, ...standalone.readHandlers, ...settings.readHandlers],
    declaredCombinations: { tenant: null, system: null },
  }
  const materials = {
    ...baseMaterials,
    participants: [...baseMaterials.participants, ...(options.extraMaterials?.participants ?? [])],
    migrations: [...baseMaterials.migrations, ...(options.extraMaterials?.migrations ?? [])],
    readHandlers: [...baseMaterials.readHandlers, ...(options.extraMaterials?.readHandlers ?? [])],
  }
  const domain = {
    scope: {
      kind: 'tenant' as const,
      tenant: JSON.stringify({
        organization: 'org_00000000000000000000000001',
        account: 'acc_00000000000000000000000002',
      }),
    },
    transactionDomain: 'governance',
  }
  const participants = [
    ...baseMaterials.participants
      .filter(value => !settings.participants.includes(value))
      .map(value => value.participant),
    ...SETTINGS_RECOVERY_PARTICIPANTS,
  ]
  const checked = combinationManifest({ catalog: materials, participants })
  if (checked.kind !== 'manifest') throw new Error(JSON.stringify(checked))
  const combination = {
    ...domain,
    participants,
    combinationVersion: 'test-tool-assets/1',
    manifestDigest: manifestDigest(checked.manifest),
  }
  const made = await createSqliteStorage({
    config: providerConfig(root, {
      maxWorkers: options.initialize === undefined ? 2 : 4,
      reservedWriterSlots: 1,
      maxReadWorkersPerDomain: 1,
      groupMaxOperations: 1,
      // Session creation with initial input carries nested typed guards, as in the Journal SQL fixture.
      maxJsonDepth: 80,
    }),
    materials,
    closeLeases: { admit: () => ({}), release() {} },
  })
  if (made.kind !== 'created') throw new Error(JSON.stringify(made))
  if (options.initialize) domain.scope.tenant = await options.initialize(made.storage)
  const registered = await made.storage.registerCombination(combination)
  if (registered.kind !== 'registered') throw new Error(JSON.stringify(registered))
  const categories = createCategoryRegistry()
  categories.register(createToolAssetCategory(release))
  const owner = createAssetsLocal({ ...combination, domain, storage: made.storage, categories })
  const target: SettingsTargetProjection['target'] = {
    policyId: 'asset',
    scopeRef: domain.scope.tenant,
    targetRef: 'shell',
  }
  let closed = false
  return {
    root,
    storage: made.storage,
    materials,
    combination,
    domain,
    release,
    entry,
    publication,
    owner,
    target,
    async setup() {
      const published = await owner.publish({
        operationId: 'publish-shell',
        assetRef: publication.assetRef,
        pinned: publication.pinned,
        expectedRevision: 0,
      })
      if (published.kind !== 'committed') throw new Error(JSON.stringify(published))
      const held = await owner.hold({
        operationId: 'hold-shell',
        assetRef: publication.assetRef,
        holdingRef: target.targetRef,
        scopeRef: target.scopeRef,
        selection: { kind: 'pinned', version: publication.pinned.version },
        sources: [
          {
            sourceId: 'tenant',
            ownerRef: 'test-settings-owner',
            scope: { kind: 'tenant', subjectRef: domain.scope.tenant },
          },
        ],
        grants: [{ sourceId: 'tenant', actions: ['set', 'clear'] }],
      })
      if (held.kind !== 'committed') throw new Error(JSON.stringify(held))
    },
    async capture(targets = [target]) {
      const captureId = randomUUID()
      const reply = await made.storage.commit({
        identity: {
          ...domain,
          operation: 'test.tool-publication',
          protocolVersion: '2',
          operationKey: captureId,
        },
        combinationVersion: combination.combinationVersion,
        manifestDigest: combination.manifestDigest,
        commands: [
          assetsPublicationCommand({
            domain,
            principalRef: 'alice',
            captureId,
            request: { deploymentRef: 'test', mode: 'runtime', targets, selectionRef: null },
          }),
        ],
      })
      return reply.kind === 'committed'
        ? AssetsPublicationProjectionSchema.parse(reply.responses[0]?.reply.response)
        : reply
    },
    async captureCurrent(
      transform?: (commands: readonly FactCommandV2[]) => readonly FactCommandV2[],
    ) {
      const scope = {
        tenantRef: domain.scope.tenant,
        deploymentId: 'test',
        logicalServiceId: 'tools',
        visibility: { kind: 'tenant' as const, tenantRef: domain.scope.tenant },
      }
      const operationId = randomUUID()
      const project = createGovernanceAdoptionProjection(domain.transactionDomain)
      const commands = project({
        binding: {
          ref: { scope, owner: 'adopt', operationId, principalRef: 'alice' },
          requestDigest: 'a'.repeat(64),
        },
        epoch: 'test-epoch',
        command: {
          scope,
          operationId,
          expectedAdoptionRevision: 0,
          expectedDeclarationRevision: 1,
          collection: { scope, declarationRevision: 1, digest: 'b'.repeat(64) },
          complete: [
            {
              contribution: {
                scope,
                contributorId: 'tools',
                generation: '1',
                registrationId: 'shell',
              },
              selectedTargets: [target],
            },
          ],
        },
      })
      const reply = await made.storage.commit({
        identity: {
          ...domain,
          operation: 'test.current',
          protocolVersion: '2',
          operationKey: operationId,
        },
        combinationVersion: combination.combinationVersion,
        manifestDigest: combination.manifestDigest,
        commands: transform?.(commands) ?? commands,
      })
      return reply.kind === 'committed'
        ? GovernanceAdoptionCurrentSchema.parse(
            reply.responses.find(
              value => value.participant === ADOPTION_CURRENT_PARTICIPANT.participant,
            )?.reply.response,
          )
        : reply
    },
    async close(remove = true) {
      if (!closed) {
        await owner.close()
        const result = await made.control.close({ initiator: 'disposal' })
        if (result.kind !== 'closed') throw new Error(JSON.stringify(result))
        closed = true
      }
      if (remove) rmSync(root, { recursive: true, force: true })
    },
  }
}
