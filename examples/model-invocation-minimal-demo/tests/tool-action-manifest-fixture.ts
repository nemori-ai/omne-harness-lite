import { join } from 'node:path'
import { evaluate, type NonConnectorEvaluationInput } from '@omne-harness-lite/asset-evaluation'
import {
  assemblyManifestMigrations,
  createAssemblyManifestStore,
} from '@omne-harness-lite/assembly-manifest-store'
import { toOpaqueJson } from '@omne-harness-lite/content-blocks'
import {
  evaluationInputMigrations,
  type InputSourceDependencies,
} from '@omne-harness-lite/evaluation-input-store'
import { publishLocalInputs } from '@omne-harness-lite/evaluation-input-store/publication'
import { createRegistryHistoryReader } from '@omne-harness-lite/evaluation-input-store/registry-history'
import type { RunnerPiece } from '@omne-harness-lite/loop-extension-runner'
import { composeMigrations } from '@omne-harness-lite/storage'
import { openStorage } from '@omne-harness-lite/storage-sql'
import { at, scope } from './tool-driver-history-fixture.ts'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'

/** Real SQL publication, manifest and immutable-version reader; tenancy/standing are controlled inputs. */
export async function actionManifest(
  dir: string,
  pieces: readonly RunnerPiece[],
  ownedScopes: readonly SessionScope[] = [scope],
) {
  const storage = await openStorage({
    dialect: 'sqlite',
    file: join(dir, 'manifest.sqlite'),
    upgrade: false,
    migrations: composeMigrations([...assemblyManifestMigrations, ...evaluationInputMigrations]),
  })
  const manifest = createAssemblyManifestStore(storage)
  const sessionTenancy = {
    async holdingTenant(session: unknown) {
      const owned = ownedScopes.find(item => item.session === session)
      return owned ? { tenant: owned.tenant } : { failure: 'sessionNotFound' as const }
    },
  }
  const root = { category: 'agent_definition', name: 'example:action-root' } as const
  const definitions: NonConnectorEvaluationInput['definitions'] = pieces.map((piece, index) => ({
    id: `ast_extension_${index}`,
    capability: { category: 'loop_extension', name: piece.definition.name },
    origin: 'official',
    versions: [
      {
        number: 1,
        content: { category: 'loop_extension', extension: piece.definition },
        publishedAt: at,
      },
    ],
  }))
  const order = pieces.map(piece => ({
      category: 'loop_extension' as const,
      name: piece.definition.name,
    })),
    references = order.map(capability => ({ capability }))
  const all: NonConnectorEvaluationInput['definitions'] = [
    {
      id: 'ast_root',
      capability: root,
      origin: 'official',
      versions: [
        {
          number: 1,
          content: {
            category: 'agent_definition',
            body: toOpaqueJson({ references, attributes: [] }),
          },
          publishedAt: at,
        },
      ],
    },
    ...definitions,
  ]
  const holdings: NonConnectorEvaluationInput['holdings'] = all.map(definition => ({
    holder: { layer: 'factory' },
    capability: definition.capability,
    asset: definition.id,
    basis: { kind: 'official' },
    versionSelection: { kind: 'current' },
    immutable: false,
    assignments: [],
    since: at,
  }))
  const evaluated = evaluate({
    tenant: scope.tenant,
    standing: { standing: 'effective', role: 'member' },
    root: {
      definition: root,
      references,
      attributes: [],
      source: { asset: 'ast_root', version: 1 },
    },
    definitions: all,
    holdings,
  })
  if (!('ok' in evaluated)) throw new Error('action manifest evaluation failed')
  const unused = async (): Promise<never> => {
    throw new Error('membership operation outside this fixture')
  }
  const deps: InputSourceDependencies = {
    storage,
    storeKey: 'action-fixture',
    deployedOfficial: order.map(capability => ({ capability, meta: false })),
    sessionTenancy,
    // Only standing is consumed by the actual immutable-version reader in this fixture.
    memberships: {
      participate: () => ({
        standing: async () => ({ standing: 'effective', role: 'member' }),
        mine: unused,
        changeRole: unused,
        remove: unused,
        currentTenant: unused,
        switchCurrentTenant: unused,
        list: unused,
      }),
    },
    diagnostics() {},
    onDiagnosticFailure() {},
    monotonicNow: process.hrtime.bigint,
  }
  const published = await publishLocalInputs(deps, {
    expectedRevision: null,
    definitions,
    scopes: [
      {
        holder: { layer: 'factory' },
        holdings: holdings.filter(item => item.capability.category === 'loop_extension'),
      },
    ],
  })
  if (!('revision' in published)) throw new Error(`publication ${published.failure}`)
  const evaluation = evaluated.ok
  const record = await manifest.append(scope.session, 0, {
    evaluation: { kind: 'given', ref: 'action-evaluation' },
    tables: {
      loop_extension: {
        filledAt: 1,
        composition: order.map(capability => {
          const asset = evaluation.assets.find(item => item.capability.name === capability.name)
          if (!asset) throw new Error('missing evaluated extension')
          return {
            capability: asset.capability,
            asset: asset.asset,
            version: asset.version,
            from: asset.from,
          }
        }),
      },
    },
    content: { evaluation, compositionOrder: order, filledBy: { kind: 'assembly' } },
  })
  if ('failure' in record) throw new Error(`manifest ${record.failure}`)
  const history = createRegistryHistoryReader({ ...deps, manifestHistory: manifest })
  return {
    manifest,
    history,
    sessionTenancy,
    async close() {
      await history.close()
      await manifest.close()
      await storage.close()
    },
  }
}
