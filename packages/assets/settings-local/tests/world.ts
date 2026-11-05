import { createHash, randomUUID } from 'node:crypto'
import { mkdtempSync, mkdirSync, readFileSync, realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import canonicalize from 'canonicalize'
import { SettingDefinitionsSchema, type SettingsChange } from '@omne-harness/settings'
import {
  combinationManifest,
  manifestDigest,
  type SqlMaterialCatalog,
  type SqlStorage,
} from '@omne-harness/sql-contract'
import { createSqliteStorage } from '@omne-harness/sqlite-provider'
import {
  createSettingsSqlBackend,
  settingsSqlMaterials,
  settingsSqlGuardFact,
  settingsSqlResultFact,
  type SettingsSqlAccess,
} from '../src/index.ts'
import { config } from './config.ts'

export const context = { principalRef: 'alice', allowed: true }
export const definition = SettingDefinitionsSchema.parse({
  providerId: 'example',
  definitionId: 'preferences',
  version: '1',
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
        description: 'Display help during use',
        impact: 'Used on the next read',
        clear: 'Use the outer value',
        adoption: 'next-read',
      },
      valueSchema: { type: 'boolean' },
      default: { kind: 'value', value: false },
      merge: 'override',
      sensitivity: 'ordinary',
    },
  ],
})
export const definitionRef = {
  providerId: 'example',
  definitionId: 'preferences',
  version: '1',
  digest: createHash('sha256').update(canonicalize(definition)!).digest('hex'),
}
export const secretDefinition = SettingDefinitionsSchema.parse({
  ...definition,
  items: definition.items.map(item => ({
    ...item,
    sensitivity: 'secret',
    default: { kind: 'absent' },
    valueSchema: { type: 'string' },
  })),
})
export const secretDefinitionRef = {
  ...definitionRef,
  digest: createHash('sha256').update(canonicalize(secretDefinition)!).digest('hex'),
}
export function command(overrides: Partial<SettingsChange> = {}): SettingsChange {
  return {
    protocol: 'settings/1',
    requestId: 'request-1',
    operationId: 'operation-1',
    target: { policyId: 'independent', targetRef: 'preferences', scopeRef: 'tenant-a' },
    definitionRef,
    expectedRevision: 0,
    sourceId: 'tenant',
    itemId: 'enabled',
    action: { kind: 'set', value: true },
    ...overrides,
  }
}
const GUARD = 'fixture.settings.guard'
function material(name: string) {
  const url = new URL(`./${name}.mjs`, import.meta.url)
  return {
    moduleUrl: url.href,
    codeDigest: createHash('sha256').update(readFileSync(url)).digest('hex'),
  }
}
export async function openWorld(
  options: {
    root?: string
    mode?: string
    wrap?: (storage: SqlStorage) => SqlStorage
    access?: SettingsSqlAccess<typeof context>
  } = {},
) {
  const parent = fileURLToPath(
    new URL('../../../../tmp/closures/settings-storage/databases/', import.meta.url),
  )
  mkdirSync(parent, { recursive: true })
  const root = options.root ?? realpathSync(mkdtempSync(join(parent, 'case-')))
  const own = settingsSqlMaterials()
  const migration = material('guard-migration')
  const materials: SqlMaterialCatalog = {
    catalogProtocol: 'sql-catalog/1',
    participants: [
      ...own.participants,
      {
        participant: GUARD,
        protocol: 'fixture-settings/1',
        ...material('guard'),
        ownedTables: ['fixture_settings_authority'],
        readTables: [],
        requiresFacts: [],
        providesFacts: [settingsSqlGuardFact],
        allowedFunctions: [],
        grouping: 'singleton',
      },
      {
        participant: 'fixture.settings.after',
        protocol: 'fixture-settings-after/1',
        ...material('after'),
        ownedTables: [],
        readTables: [],
        requiresFacts: [settingsSqlResultFact],
        providesFacts: [],
        allowedFunctions: [],
        grouping: 'singleton',
      },
    ],
    migrations: [
      ...own.migrations,
      {
        owner: GUARD,
        id: 'fixture-settings-1',
        moduleUrl: migration.moduleUrl,
        checksum: migration.codeDigest,
        requires: [],
      },
    ],
    readHandlers: own.readHandlers,
    declaredCombinations: { tenant: null, system: null },
  }
  const scope = { kind: 'tenant', tenant: 'tenant-a' } as const
  const domain = { scope, transactionDomain: 'settings.test' }
  const participants = materials.participants.map(entry => entry.participant)
  const manifest = combinationManifest({ catalog: materials, participants })
  if (manifest.kind !== 'manifest') throw new Error(JSON.stringify(manifest))
  const combination = {
    ...domain,
    combinationVersion: 'fixture-settings/1',
    manifestDigest: manifestDigest(manifest.manifest),
    participants,
  }
  const leases = new Set<object>()
  const storage = await createSqliteStorage({
    config: config(root),
    materials,
    closeLeases: {
      admit() {
        const lease = {}
        leases.add(lease)
        return lease
      },
      release(lease) {
        leases.delete(lease)
      },
    },
  })
  if (storage.kind !== 'created') throw new Error(JSON.stringify(storage))
  const raw = storage.storage
  const registered = await storage.storage.registerCombination(combination)
  if (registered.kind !== 'registered') throw new Error(JSON.stringify(registered))
  const backend = createSettingsSqlBackend<typeof context>({
    storage: options.wrap?.(storage.storage) ?? storage.storage,
    domain,
    combinationVersion: combination.combinationVersion,
    manifestDigest: combination.manifestDigest,
    access: options.access ?? {
      async authorize(caller, request) {
        return caller.allowed
          ? {
              kind: 'authorized',
              scope: domain.scope,
              target: request.target,
              principalRef: caller.principalRef,
            }
          : { kind: 'rejected', reason: 'forbidden' }
      },
    },
    guards: {
      participant: GUARD,
      command: binding => ({ participant: GUARD, facts: { binding } }),
    },
  })
  async function configure(mode = 'normal') {
    const result = await raw.commit({
      identity: {
        ...domain,
        operation: 'fixture.configure',
        protocolVersion: '2',
        operationKey: randomUUID(),
      },
      combinationVersion: combination.combinationVersion,
      manifestDigest: combination.manifestDigest,
      commands: [
        {
          participant: GUARD,
          facts: {
            configure: true,
            scope,
            target: command().target,
            principalRef: context.principalRef,
            mode,
            definition: JSON.parse(
              JSON.stringify(mode === 'secret' ? secretDefinition : definition),
            ),
            definitionRef: mode === 'secret' ? secretDefinitionRef : definitionRef,
            sourceIds: ['organization', 'tenant'],
            grants: ['organization', 'tenant'].map(sourceId => ({
              sourceId,
              actions: ['set', 'clear', 'lock', 'unlock'],
            })),
          },
        },
      ],
    })
    if (result.kind !== 'committed') throw new Error(JSON.stringify(result))
  }
  if (!options.root || options.mode) await configure(options.mode)
  let closed: Promise<void> | undefined
  return {
    root,
    backend,
    storage: storage.storage,
    combination,
    configure,
    counts() {
      const database = new DatabaseSync(
        join(root, 'domains', `${Buffer.from(domain.transactionDomain).toString('hex')}.sqlite`),
        { readOnly: true },
      )
      try {
        return ['st_states', 'st_operations', 'st_changes'].map(
          table => database.prepare(`SELECT count(*) AS count FROM ${table}`).get()?.['count'],
        )
      } finally {
        database.close()
      }
    },
    close() {
      return (closed ??= (async () => {
        await backend.close()
        const result = await storage.control.close({ initiator: 'disposal' })
        if (result.kind !== 'closed' || leases.size) throw new Error(JSON.stringify(result))
      })())
    },
  }
}
export type World = Awaited<ReturnType<typeof openWorld>>
