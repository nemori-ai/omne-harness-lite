import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import {
  calendarSupplySqlMaterials,
  calendarSupplyStorageAuthorityFact,
  createCalendarSqlPersistence,
  createCalendarSqlSupplyStorage,
} from '@omne-harness/calendar-local'
import {
  combinationManifest,
  manifestDigest,
  type FactCommandV2,
  type JsonValue,
  type SqlMaterialCatalog,
  type SqlStorage,
} from '@omne-harness/sql-contract'
import { createSqliteStorage } from '@omne-harness/sqlite-provider'
import { catalog, config, temporaryRoot } from './world.ts'

export const scope = 'public-calendar-supply'

function material(name: string) {
  const url = new URL(`./supply-storage/${name}.mjs`, import.meta.url)
  return {
    moduleUrl: url.href,
    codeDigest: createHash('sha256').update(readFileSync(url)).digest('hex'),
  }
}

function jointCatalog(): SqlMaterialCatalog {
  const publication = catalog()
  const supply = calendarSupplySqlMaterials({ maxReadBytes: config('').maxReadResultBytes })
  const migration = material('authority-migration')
  return {
    ...publication,
    participants: [
      ...publication.participants,
      ...supply.participants,
      {
        participant: 'fixture.supply-authority',
        protocol: 'fixture-supply/1',
        ...material('authority'),
        ownedTables: ['fixture_supply_authority'],
        readTables: [],
        requiresFacts: [],
        providesFacts: [calendarSupplyStorageAuthorityFact],
        allowedFunctions: [],
        grouping: 'singleton',
      },
    ],
    migrations: [
      ...publication.migrations,
      ...supply.migrations,
      {
        owner: 'fixture.supply-authority',
        id: 'fixture-supply-1',
        moduleUrl: migration.moduleUrl,
        checksum: migration.codeDigest,
        requires: [],
      },
    ],
    readHandlers: [...publication.readHandlers, ...supply.readHandlers],
  }
}

const participants = [
  'fixture.calendar-authority',
  'calendar.persistence',
  'fixture.supply-authority',
  'calendar.supply',
]

function guard(participant: string) {
  return {
    participant,
    command: (binding: JsonValue): FactCommandV2 => ({ participant, facts: { binding } }),
  }
}

export async function openJointWorld(
  root = temporaryRoot(),
  wrap: (storage: SqlStorage) => SqlStorage = storage => storage,
) {
  const materials = jointCatalog()
  const manifest = combinationManifest({ catalog: materials, participants })
  if (manifest.kind !== 'manifest') throw new Error(JSON.stringify(manifest))
  const combination = {
    scope: { kind: 'system' },
    transactionDomain: 'system.calendar',
    combinationVersion: 'calendar-joint-test/1',
    participants,
    manifestDigest: manifestDigest(manifest.manifest),
  } as const
  const leases = new Set<object>()
  const created = await createSqliteStorage({
    config: config(root),
    materials: {
      ...materials,
      declaredCombinations: {
        tenant: null,
        system: { combinationVersion: combination.combinationVersion, participants },
      },
    },
    closeLeases: {
      admit() {
        const handle = {}
        leases.add(handle)
        return handle
      },
      release(handle) {
        leases.delete(handle)
      },
    },
  })
  if (created.kind !== 'created') throw new Error(JSON.stringify(created))
  const registered = await created.storage.registerCombination(combination)
  if (registered.kind !== 'registered') throw new Error(JSON.stringify(registered))
  const storage = wrap(created.storage)
  const supply = createCalendarSqlSupplyStorage({
    storage,
    combination,
    authority: guard('fixture.supply-authority'),
    systemScopeRef: scope,
    seedPackRegistry: new Map(),
  })
  return {
    root,
    ...createCalendarSqlPersistence({
      storage,
      combination,
      authority: guard('fixture.calendar-authority'),
    }),
    journal: supply.journal,
    materials: supply.materials,
    async close() {
      const result = await created.control.close({ initiator: 'disposal' })
      if (result.kind !== 'closed' || leases.size !== 0) throw new Error(JSON.stringify(result))
    },
  }
}
