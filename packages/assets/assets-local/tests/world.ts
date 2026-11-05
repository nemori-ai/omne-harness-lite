import { createHash, randomUUID } from 'node:crypto'
import { mkdtempSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import canonicalize from 'canonicalize'
import { capabilityId, createCategoryRegistry, pinBody, readBodyText } from '@omne-harness/assets'
import { SettingDefinitionsSchema, type SettingsChange } from '@omne-harness/settings'
import {
  createSettingsSqlBackend,
  settingsSqlMaterials,
  type SettingsProjectionBinding,
} from '@omne-harness/settings-local'
import {
  combinationManifest,
  manifestDigest,
  type SqlMaterialCatalog,
  type SqlStorage,
} from '@omne-harness/sql-contract'
import { createSqliteStorage } from '@omne-harness/sqlite-provider'
import {
  assetsSettingsGuards,
  assetsSettingsProjectionCommand,
  assetsSqlMaterials,
  createAssetsLocal,
} from '../src/index.ts'
import { config } from './config.ts'

export function definition(version = '1', enabled = false) {
  return SettingDefinitionsSchema.parse({
    providerId: 'service',
    definitionId: 'preferences',
    version,
    groups: [
      {
        id: 'general',
        parentId: null,
        title: 'General',
        description: 'Common preferences',
        order: 0,
      },
    ],
    items: [
      {
        id: 'enabled',
        groupId: 'general',
        category: 'preference',
        presentation: {
          title: 'Show tips',
          description: 'Show help during use',
          impact: 'Used on next read',
          clear: 'Use the outer value',
          adoption: 'next-read',
        },
        valueSchema: { type: 'boolean' },
        default: { kind: 'value', value: enabled },
        merge: 'override',
        sensitivity: 'ordinary',
      },
    ],
  })
}
export const categories = createCategoryRegistry()
categories.register({
  category: 'service',
  schema: { kind: 'null' },
  judge: () => ({ ok: true }),
  deriveDeclarations: () => ({ entries: [] }),
  references: () => [],
  settings(body, context) {
    const enabled =
      body.kind === 'object' &&
      body.entries.some(
        entry => entry.key === 'enabled' && entry.value.kind === 'boolean' && entry.value.value,
      )
    return definition(context?.definition, enabled)
  },
})
export function pinned(version = '1', enabled = false, name = 'example') {
  const id = capabilityId('service', name)
  const body = readBodyText(JSON.stringify({ enabled }), {
    maxBytes: 1000,
    maxDepth: 8,
    maxItems: 100,
    maxMembers: 100,
    maxStringLength: 100,
    maxNumberLength: 100,
  })
  if (!id.ok || body.kind !== 'ok') throw new Error('invalid fixture')
  return pinBody({ identity: id.id, version, source: 'owner-source', body: body.value })
}
export function definitionRef(version = '1', enabled = false) {
  return {
    providerId: 'service',
    definitionId: 'preferences',
    version,
    digest: createHash('sha256')
      .update(canonicalize(definition(version, enabled)) ?? '')
      .digest('hex'),
  }
}
export const target = { policyId: 'asset', targetRef: 'holding-a', scopeRef: 'tenant-a' }
export function command(overrides: Partial<SettingsChange> = {}): SettingsChange {
  return {
    protocol: 'settings/1',
    requestId: randomUUID(),
    operationId: randomUUID(),
    target,
    definitionRef: definitionRef(),
    expectedRevision: 0,
    sourceId: 'tenant',
    itemId: 'enabled',
    action: { kind: 'set', value: true },
    ...overrides,
  }
}
export const grants = [
  {
    sourceId: 'tenant',
    actions: ['set', 'clear', 'lock', 'unlock'] as ('set' | 'clear' | 'lock' | 'unlock')[],
  },
]
export async function openWorld(
  options: {
    config?: Partial<import('@omne-harness/sqlite-provider').SqliteStorageConfig>
    root?: string
    wrap?: (storage: SqlStorage) => SqlStorage
    ownerWrap?: (storage: SqlStorage) => SqlStorage
  } = {},
) {
  const parent = fileURLToPath(
    new URL('../../../../tmp/closures/assets-local/databases/', import.meta.url),
  )
  mkdirSync(parent, { recursive: true })
  const root = options.root ?? mkdtempSync(join(parent, 'case-'))
  const assets = assetsSqlMaterials(),
    settings = settingsSqlMaterials()
  const materials: SqlMaterialCatalog = {
    catalogProtocol: 'sql-catalog/1',
    participants: [...assets.participants, ...settings.participants],
    migrations: [...assets.migrations, ...settings.migrations],
    readHandlers: [...assets.readHandlers, ...settings.readHandlers],
    declaredCombinations: { tenant: null, system: null },
  }
  const domain = {
    scope: { kind: 'tenant', tenant: 'tenant-a' } as const,
    transactionDomain: 'assets.test',
  }
  const participants = materials.participants.map(p => p.participant)
  const manifest = combinationManifest({ catalog: materials, participants })
  if (manifest.kind !== 'manifest') throw new Error(JSON.stringify(manifest))
  const combination = {
    ...domain,
    combinationVersion: 'assets-test/1',
    manifestDigest: manifestDigest(manifest.manifest),
    participants,
  }
  const result = await createSqliteStorage({
    config: { ...config(root), ...options.config },
    materials,
    closeLeases: { admit: () => ({}), release: () => {} },
  })
  if (result.kind !== 'created') throw new Error(JSON.stringify(result))
  const storage = result.storage
  const registered = await storage.registerCombination(combination)
  if (registered.kind !== 'registered') throw new Error(JSON.stringify(registered))
  const owner = createAssetsLocal({
    ...combination,
    domain,
    storage: options.ownerWrap?.(storage) ?? storage,
    categories,
  })
  const backend = createSettingsSqlBackend({
    storage: options.wrap?.(storage) ?? storage,
    domain,
    ...combination,
    guards: assetsSettingsGuards,
    access: {
      async authorize(_context: null, request) {
        return {
          kind: 'authorized' as const,
          scope: domain.scope,
          target: request.target,
          principalRef: 'alice',
        }
      },
    },
  })
  async function setup() {
    const published = await owner.publish({
      operationId: 'publish-1',
      assetRef: 'asset-a',
      pinned: pinned(),
      expectedRevision: 0,
    })
    const held = await owner.hold({
      operationId: 'hold-1',
      holdingRef: target.targetRef,
      scopeRef: target.scopeRef,
      assetRef: 'asset-a',
      selection: { kind: 'follow' },
      sourceIds: ['tenant'],
      grants,
    })
    if (published.kind !== 'committed' || held.kind !== 'committed')
      throw new Error(JSON.stringify({ published, held }))
  }
  async function capture(overrides: Partial<SettingsProjectionBinding['request']> = {}) {
    const binding: SettingsProjectionBinding = {
      domain,
      principalRef: 'alice',
      captureId: randomUUID(),
      request: {
        deploymentRef: 'deployment',
        mode: 'management',
        targets: [],
        selectionRef: null,
        ...overrides,
      },
    }
    return storage.commit({
      identity: {
        ...domain,
        operation: 'assets.capture',
        protocolVersion: '2',
        operationKey: binding.captureId,
      },
      combinationVersion: combination.combinationVersion,
      manifestDigest: combination.manifestDigest,
      commands: [assetsSettingsProjectionCommand(binding)],
    })
  }
  let closing: Promise<void> | undefined
  return {
    root,
    domain,
    storage,
    owner,
    backend,
    combination,
    setup,
    capture,
    close() {
      return (closing ??= (async () => {
        await Promise.all([owner.close(), backend.close()])
        const closed = await result.control.close({ initiator: 'disposal' })
        if (closed.kind !== 'closed') throw new Error(JSON.stringify(closed))
      })())
    },
  }
}
export type World = Awaited<ReturnType<typeof openWorld>>
