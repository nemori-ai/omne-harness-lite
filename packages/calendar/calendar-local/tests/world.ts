import { createHash, randomUUID } from 'node:crypto'
import { mkdtempSync, mkdirSync, readFileSync, realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { calendarSnapshotSchema } from '@omne-harness/calendar-contract'
import type { CalendarDispositionCommand } from '@omne-harness/calendar'
import {
  calendarSqlMaterials,
  calendarPersistenceAuthorityFact,
  calendarPersistenceResultFact,
  createCalendarSqlPersistence,
} from '@omne-harness/calendar-local'
import {
  combinationManifest,
  manifestDigest,
  type SqlMaterialCatalog,
  type SqlStorage,
  type FactCommandV2,
  type JsonValue,
} from '@omne-harness/sql-contract'
import { createSqliteStorage, type SqliteStorageConfig } from '@omne-harness/sqlite-provider'

export function temporaryRoot() {
  const parent = fileURLToPath(
    new URL('../../../../tmp/calendar-a1-persistence/databases/', import.meta.url),
  )
  mkdirSync(parent, { recursive: true })
  return realpathSync(mkdtempSync(join(parent, 'case-')))
}
function material(name: string) {
  const url = new URL(`./fixtures/${name}.mjs`, import.meta.url)
  return {
    moduleUrl: url.href,
    codeDigest: createHash('sha256').update(readFileSync(url)).digest('hex'),
  }
}
export function catalog(): SqlMaterialCatalog {
  const own = calendarSqlMaterials()
  const migration = material('authority-migration')
  return {
    catalogProtocol: 'sql-catalog/1',
    participants: [
      ...own.participants,
      {
        participant: 'fixture.calendar-authority',
        protocol: 'fixture-calendar-authority/1',
        ...material('authority'),
        ownedTables: ['fixture_calendar_grants'],
        readTables: [],
        requiresFacts: [],
        providesFacts: [calendarPersistenceAuthorityFact],
        allowedFunctions: [],
        grouping: 'singleton',
      },
      {
        participant: 'fixture.after-calendar-write',
        protocol: 'fixture-after-calendar-write/1',
        ...material('after-write'),
        ownedTables: [],
        readTables: [],
        requiresFacts: [calendarPersistenceResultFact],
        providesFacts: [],
        allowedFunctions: [],
        grouping: 'singleton',
      },
    ],
    migrations: [
      ...own.migrations,
      {
        owner: 'fixture.calendar-authority',
        id: 'fixture-calendar-authority-1',
        moduleUrl: migration.moduleUrl,
        checksum: migration.codeDigest,
        requires: [],
      },
    ],
    readHandlers: own.readHandlers,
    declaredCombinations: {
      tenant: null,
      system: {
        combinationVersion: 'calendar-test/1',
        participants: [
          'fixture.calendar-authority',
          'calendar.persistence',
          'fixture.after-calendar-write',
        ],
      },
    },
  }
}
export function config(storageRoot: string): SqliteStorageConfig {
  return {
    storageRoot,
    admissionQueueLimit: 100,
    globalAdmissionLimit: 100,
    lockWaitMs: 1000,
    maxCommandsPerCommit: 5,
    maxCommandBytes: 16 << 20,
    maxRequestBytes: 20 << 20,
    globalInFlightWriteBytes: 64 << 20,
    maxJsonDepth: 50,
    maxJsonMembers: 100000,
    maxResponseBytes: 16 << 20,
    maxOperationResponseBytes: 20 << 20,
    globalWriteResponseBytes: 64 << 20,
    maxDiagnosticBytes: 1024,
    maxWorkers: 4,
    reservedWriterSlots: 1,
    maxReadWorkersPerDomain: 1,
    readQueuePerDomain: 50,
    readQueueGlobal: 50,
    readQueueTimeoutMs: 10000,
    maxReadInputBytes: 1 << 20,
    maxReadResultBytes: 8 << 20,
    globalReadResultBytes: 32 << 20,
    readObservationMs: 10000,
    readerIdleMs: 60000,
    queryQueuePerDomain: 50,
    queryQueueGlobal: 50,
    controlQueuePerDomain: 50,
    controlQueueGlobal: 50,
    writesPerControlTurn: 1,
    groupMaxOperations: 1,
    groupCollectMs: 0,
    groupMaxInputBytes: 32 << 20,
    groupMaxResponseReservationBytes: 32 << 20,
    groupMaxExecutionSliceMs: 100,
    walAutocheckpointPages: 1000,
    journalSizeLimitBytes: 8 << 20,
    checkpointIntervalMs: 60000,
    checkpointWalBytes: 8 << 20,
    walReadPauseBytes: 64 << 20,
    walWriteStopBytes: 128 << 20,
    closeDeadlineMs: 10000,
  }
}
export async function openWorld(
  root = temporaryRoot(),
  wrap: (storage: SqlStorage) => SqlStorage = storage => storage,
) {
  const materials = catalog()
  const participants = materials.participants.map(item => item.participant)
  const manifest = combinationManifest({ catalog: materials, participants })
  if (manifest.kind !== 'manifest') throw new Error(JSON.stringify(manifest))
  const combination = {
    scope: { kind: 'system' },
    transactionDomain: 'system.calendar',
    combinationVersion: 'calendar-test/1',
    participants,
    manifestDigest: manifestDigest(manifest.manifest),
  } as const
  const leases = new Set<object>()
  const created = await createSqliteStorage({
    config: config(root),
    materials,
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
  const authority = {
    participant: 'fixture.calendar-authority',
    command(binding: JsonValue): FactCommandV2 {
      return { participant: 'fixture.calendar-authority', facts: { binding } }
    },
  }
  const pair = createCalendarSqlPersistence({ storage, combination, authority })
  return {
    root,
    storage,
    combination,
    authority,
    ...pair,
    async configure(publish: boolean, ack: boolean, mode = 'normal') {
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
        commands: [
          {
            participant: 'fixture.calendar-authority',
            facts: { action: 'configure', publish: publish ? 1 : 0, ack: ack ? 1 : 0, mode },
          },
        ],
      })
      if (result.kind !== 'committed') throw new Error(JSON.stringify(result))
    },
    async close() {
      const result = await created.control.close({ initiator: 'disposal' })
      if (result.kind !== 'closed') throw new Error(JSON.stringify(result))
      if (leases.size !== 0) throw new Error('SQL fixture leaked leases')
    },
  }
}
export function command(
  version = 'v1',
  expectedGeneration = 0,
  key = version,
): CalendarDispositionCommand {
  const snapshot = calendarSnapshotSchema.parse({
    calendarId: 'test-calendar',
    versionId: version,
    coverageStart: '2026-01-01',
    coverageEnd: '2026-12-31',
    timezone: 'Asia/Tokyo',
    weeklyDefault: [
      'workingDay',
      'workingDay',
      'workingDay',
      'workingDay',
      'workingDay',
      'nonWorkingDay',
      'nonWorkingDay',
    ],
    overrides:
      version === 'v1'
        ? []
        : [
            {
              date: '2026-01-02',
              classification: 'holiday',
              provenanceRefs: ['source-new'],
              notes: [],
            },
          ],
    knowledgeAsOf: '2026-01-01T00:00:00.000Z',
    synthesizedAt: '2026-01-02T00:00:00.000Z',
    contentHash: createHash('sha256').update(version).digest('hex'),
    provenanceRefs: ['source-original'],
    publicationGeneration: 0,
  })
  const { publicationGeneration: _generation, ...unpublished } = snapshot
  return {
    address: {
      protocol: 'omne.calendar-schedule/1',
      systemScopeRef: 'public-calendar-supply',
      operation: 'refresh',
      calendarId: snapshot.calendarId,
      operationKey: key,
    },
    expectedFingerprint: createHash('sha256').update(key).digest('hex'),
    expectedGeneration,
    authorityGuardRefs: ['fixture-grant'],
    policyHash: 'a'.repeat(64),
    candidate: {
      snapshot: unpublished,
      semanticBoundary: 'Fixture calendar only',
      sources: [
        {
          sourceId: 'fixture',
          role: 'truth',
          lineageRef: 'fixture-origin',
          authorityRef: 'fixture-source',
          acquiredAt: snapshot.synthesizedAt,
          knowledgeAsOf: snapshot.knowledgeAsOf,
          rawHash: 'b'.repeat(64),
          rawReference: 'fixture:raw',
        },
      ],
      differences: ['fixture difference'],
      reasons: ['fixture reason'],
    },
    disposition: { kind: 'publish', snapshot: unpublished },
  }
}
