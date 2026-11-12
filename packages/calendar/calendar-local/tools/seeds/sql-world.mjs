import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, realpath } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { combinationManifest, manifestDigest } from '@omne-harness/sql-contract'
import { createSqliteStorage } from '@omne-harness/sqlite-provider'
import {
  calendarSqlMaterials,
  calendarSupplySqlMaterials,
  calendarPersistenceAuthorityFact,
  calendarSupplyStorageAuthorityFact,
  createCalendarSqlPersistence,
  createCalendarSqlSupplyStorage,
} from '@omne-harness/calendar-local'
import { calendarCallContextSchema } from '@omne-harness/calendar-contract'

export const releaseScope = 'calendar-seed-release-2026-11-03'
export function seedContext(scope = releaseScope) {
  return calendarCallContextSchema.parse({
    principalRef: 'seed-fixture-maintainer',
    owner: { kind: 'system', systemScopeRef: scope },
    actor: { kind: 'system', actorRef: 'seed-fixture' },
    authContextRef: 'seed-fixture-authority',
    requestId: 'seed-release',
    originatingSessionRef: null,
  })
}
export async function openSeedWorld({ registry = new Map(), scope = releaseScope } = {}) {
  const parent = new URL('../../../../../tmp/calendar-a1-seeds/databases/', import.meta.url)
  await mkdir(parent, { recursive: true })
  const root = await realpath(await mkdtemp(join(fileURLToPath(parent), 'case-')))
  const a = calendarSqlMaterials(),
    b = calendarSupplySqlMaterials()
  const moduleUrl = new URL('./fixture-authority.mjs', import.meta.url)
  const authorityId = 'fixture.seed-authority'
  const participants = [authorityId, 'calendar.persistence', 'calendar.supply']
  const materials = {
    catalogProtocol: 'sql-catalog/1',
    participants: [
      {
        participant: authorityId,
        protocol: 'fixture.seed-authority/1',
        moduleUrl: moduleUrl.href,
        codeDigest: createHash('sha256')
          .update(await readFile(moduleUrl))
          .digest('hex'),
        ownedTables: [],
        readTables: [],
        requiresFacts: [],
        providesFacts: [calendarPersistenceAuthorityFact, calendarSupplyStorageAuthorityFact],
        allowedFunctions: [],
        grouping: 'singleton',
      },
      ...a.participants,
      ...b.participants,
    ],
    migrations: [...a.migrations, ...b.migrations],
    readHandlers: [...a.readHandlers, ...b.readHandlers],
    declaredCombinations: {
      tenant: null,
      system: { combinationVersion: 'seed-fixture/1', participants },
    },
  }
  const manifest = combinationManifest({ catalog: materials, participants })
  if (manifest.kind !== 'manifest') throw new Error(JSON.stringify(manifest))
  const combination = {
    scope: { kind: 'system' },
    transactionDomain: 'system.calendar',
    combinationVersion: 'seed-fixture/1',
    manifestDigest: manifestDigest(manifest.manifest),
    participants,
  }
  const leases = new Set()
  const created = await createSqliteStorage({
    config: configuration(root),
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
  try {
    const registered = await created.storage.registerCombination(combination)
    if (registered.kind !== 'registered') throw new Error(JSON.stringify(registered))
    const authority = kind => ({
      participant: authorityId,
      command: binding => ({ participant: authorityId, facts: { kind, binding } }),
    })
    return {
      root,
      scope,
      context: seedContext(scope),
      ...createCalendarSqlPersistence({
        storage: created.storage,
        combination,
        authority: authority('publication'),
      }),
      ...createCalendarSqlSupplyStorage({
        storage: created.storage,
        combination,
        authority: authority('supply'),
        systemScopeRef: scope,
        seedPackRegistry: registry,
      }),
      async close() {
        const result = await created.control.close({ initiator: 'disposal' })
        if (result.kind !== 'closed' || leases.size) throw new Error(JSON.stringify(result))
      },
    }
  } catch (error) {
    await created.control.close({ initiator: 'disposal' })
    throw error
  }
}
function configuration(storageRoot) {
  return {
    storageRoot,
    admissionQueueLimit: 100,
    globalAdmissionLimit: 100,
    lockWaitMs: 1000,
    maxCommandsPerCommit: 5,
    maxCommandBytes: 128 << 20,
    maxRequestBytes: 160 << 20,
    globalInFlightWriteBytes: 320 << 20,
    maxJsonDepth: 50,
    maxJsonMembers: 1000000,
    maxResponseBytes: 128 << 20,
    maxOperationResponseBytes: 160 << 20,
    globalWriteResponseBytes: 320 << 20,
    maxDiagnosticBytes: 1024,
    maxWorkers: 4,
    reservedWriterSlots: 1,
    maxReadWorkersPerDomain: 1,
    readQueuePerDomain: 50,
    readQueueGlobal: 50,
    readQueueTimeoutMs: 10000,
    maxReadInputBytes: 1 << 20,
    maxReadResultBytes: 128 << 20,
    globalReadResultBytes: 320 << 20,
    readObservationMs: 10000,
    readerIdleMs: 60000,
    queryQueuePerDomain: 50,
    queryQueueGlobal: 50,
    controlQueuePerDomain: 50,
    controlQueueGlobal: 50,
    writesPerControlTurn: 1,
    groupMaxOperations: 1,
    groupCollectMs: 0,
    groupMaxInputBytes: 320 << 20,
    groupMaxResponseReservationBytes: 320 << 20,
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
