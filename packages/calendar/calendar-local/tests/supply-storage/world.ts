import { createHash, randomUUID } from 'node:crypto'
import { mkdtempSync, mkdirSync, readFileSync, realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import {
  combinationManifest,
  manifestDigest,
  type SqlMaterialCatalog,
  type SqlStorage,
  type FactCommandV2,
  type JsonValue,
} from '@omne-harness/sql-contract'
import { createSqliteStorage } from '@omne-harness/sqlite-provider'
import {
  calendarSupplySqlMaterials,
  calendarSupplyStorageAuthorityFact,
  calendarSupplyStorageResultFact,
  createCalendarSqlSupplyStorage,
} from '@omne-harness/calendar-local'
import { instantSchema } from '@omne-harness/calendar-contract'
import { config, command } from '../world.ts'
export { command }
export const scope = 'public-calendar-supply'
export const instant = instantSchema.parse('2026-01-02T00:00:00.000Z')
export function run(version = 'v1', key = version) {
  return { command: command(version, 0, key), preparedAt: instant }
}
export function temporaryRoot() {
  const parent = fileURLToPath(
    new URL('../../../../../tmp/calendar-a1-supply-local/databases/', import.meta.url),
  )
  mkdirSync(parent, { recursive: true })
  return realpathSync(mkdtempSync(join(parent, 'case-')))
}
function material(name: string) {
  const url = new URL(`./${name}.mjs`, import.meta.url)
  return {
    moduleUrl: url.href,
    codeDigest: createHash('sha256').update(readFileSync(url)).digest('hex'),
  }
}
export async function openWorld(
  root = temporaryRoot(),
  wrap: (s: SqlStorage) => SqlStorage = s => s,
) {
  const own = calendarSupplySqlMaterials()
  const migration = material('authority-migration')
  const participants = [
    'fixture.supply-authority',
    'calendar.supply',
    'fixture.after-supply',
  ] as const
  const materials: SqlMaterialCatalog = {
    catalogProtocol: 'sql-catalog/1',
    participants: [
      ...own.participants,
      {
        participant: participants[0],
        protocol: 'fixture-supply/1',
        ...material('authority'),
        ownedTables: ['fixture_supply_authority'],
        readTables: [],
        requiresFacts: [],
        providesFacts: [calendarSupplyStorageAuthorityFact],
        allowedFunctions: [],
        grouping: 'singleton',
      },
      {
        participant: participants[2],
        protocol: 'fixture-after-supply/1',
        ...material('after-write'),
        ownedTables: [],
        readTables: [],
        requiresFacts: [calendarSupplyStorageResultFact],
        providesFacts: [],
        allowedFunctions: [],
        grouping: 'singleton',
      },
    ],
    migrations: [
      ...own.migrations,
      {
        owner: participants[0],
        id: 'fixture-supply-1',
        moduleUrl: migration.moduleUrl,
        checksum: migration.codeDigest,
        requires: [],
      },
    ],
    readHandlers: own.readHandlers,
    declaredCombinations: {
      tenant: null,
      system: { combinationVersion: 'supply-test/1', participants },
    },
  }
  const manifest = combinationManifest({ catalog: materials, participants })
  if (manifest.kind !== 'manifest') throw new Error(JSON.stringify(manifest))
  const combination = {
    scope: { kind: 'system' },
    transactionDomain: 'system.calendar',
    combinationVersion: 'supply-test/1',
    manifestDigest: manifestDigest(manifest.manifest),
    participants,
  } as const
  const leases = new Set<object>()
  const created = await createSqliteStorage({
    config: {
      ...config(root),
      maxCommandBytes: 128 << 20,
      maxRequestBytes: 160 << 20,
      globalInFlightWriteBytes: 320 << 20,
      maxResponseBytes: 128 << 20,
      maxOperationResponseBytes: 160 << 20,
      globalWriteResponseBytes: 320 << 20,
      groupMaxInputBytes: 160 << 20,
      groupMaxResponseReservationBytes: 160 << 20,
      maxReadResultBytes: 128 << 20,
      globalReadResultBytes: 256 << 20,
    },
    materials,
    closeLeases: {
      admit() {
        const h = {}
        leases.add(h)
        return h
      },
      release(h) {
        leases.delete(h)
      },
    },
  })
  if (created.kind !== 'created') throw new Error(JSON.stringify(created))
  const registered = await created.storage.registerCombination(combination)
  if (registered.kind !== 'registered') throw new Error(JSON.stringify(registered))
  const authority = {
    participant: 'fixture.supply-authority',
    command(binding: JsonValue): FactCommandV2 {
      return { participant: 'fixture.supply-authority', facts: { binding } }
    },
  }
  const storage = wrap(created.storage)
  const options = {
    storage,
    combination,
    authority,
    systemScopeRef: scope,
    seedPackRegistry: new Map(),
  }
  return {
    root,
    storage,
    options,
    ...createCalendarSqlSupplyStorage(options),
    async configure(mode: string) {
      const result = await created.storage.commit({
        identity: {
          scope: { kind: 'system' },
          transactionDomain: 'system.calendar',
          operation: 'fixture.configure',
          protocolVersion: '2',
          operationKey: randomUUID(),
        },
        combinationVersion: combination.combinationVersion,
        manifestDigest: combination.manifestDigest,
        commands: [{ participant: authority.participant, facts: { mode } }],
      })
      if (result.kind !== 'committed') throw new Error(JSON.stringify(result))
    },
    async close() {
      const result = await created.control.close({ initiator: 'disposal' })
      if (result.kind !== 'closed' || leases.size !== 0) throw new Error(JSON.stringify(result))
    },
  }
}
