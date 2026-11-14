import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Context, Plugin } from '@deepseek-ai/cordis'
import { identitySqlMaterials } from '@omne-harness/identity-sql'
import type { SqlMaterialCatalog, SqlStorage } from '@omne-harness/sql-contract'
import { StorageService, storageKey } from '@omne-harness/sql-contract/cordis'
import { createSqliteStorage, type SqliteStorageConfig } from '@omne-harness/sqlite-provider'
import { defineRow } from '../../../src/row.ts'

function sqliteConfig(storageRoot: string): SqliteStorageConfig {
  return {
    storageRoot,
    admissionQueueLimit: 64,
    globalAdmissionLimit: 256,
    admissionWaitMs: 1000,
    lockWaitMs: 5000,
    maxCommandsPerCommit: 16,
    maxCommandBytes: 1048576,
    maxRequestBytes: 4194304,
    globalInFlightWriteBytes: 67108864,
    maxJsonDepth: 64,
    maxJsonMembers: 65536,
    maxResponseBytes: 65536,
    maxOperationResponseBytes: 1048576,
    globalWriteResponseBytes: 33554432,
    maxDiagnosticBytes: 4096,
    maxWorkers: 16,
    reservedWriterSlots: 4,
    maxReadWorkersPerDomain: 2,
    readQueuePerDomain: 32,
    readQueueGlobal: 256,
    readQueueTimeoutMs: 5000,
    maxReadInputBytes: 262144,
    maxReadResultBytes: 4194304,
    globalReadResultBytes: 33554432,
    readObservationMs: 5000,
    readerIdleMs: 30000,
    queryQueuePerDomain: 16,
    queryQueueGlobal: 64,
    controlQueuePerDomain: 8,
    controlQueueGlobal: 32,
    writesPerControlTurn: 4,
    groupMaxOperations: 8,
    groupCollectMs: 1,
    groupMaxInputBytes: 4194304,
    groupMaxResponseReservationBytes: 8388608,
    groupMaxExecutionSliceMs: 5,
    walAutocheckpointPages: 1000,
    journalSizeLimitBytes: 67108864,
    checkpointIntervalMs: 1000,
    checkpointWalBytes: 16777216,
    walReadPauseBytes: 67108864,
    walWriteStopBytes: 134217728,
    closeDeadlineMs: 10000,
  }
}

function identityCatalog(): SqlMaterialCatalog {
  const materials = identitySqlMaterials()
  return {
    catalogProtocol: 'sql-catalog/1',
    participants: materials.participants,
    migrations: materials.migrations,
    readHandlers: materials.readHandlers,
    declaredCombinations: { tenant: null, system: null },
  }
}

class ForwardingStorage extends StorageService {
  readonly database: SqlStorage['database']
  readonly registerCombination: SqlStorage['registerCombination']
  readonly commit: SqlStorage['commit']
  readonly query: SqlStorage['query']
  readonly read: SqlStorage['read']

  constructor(ctx: Context, storage: SqlStorage) {
    super(ctx)
    this.database = storage.database
    this.registerCombination = input => storage.registerCombination(input)
    this.commit = (input, options) => storage.commit(input, options)
    this.query = identity => storage.query(identity)
    this.read = (input, options) => storage.read(input, options)
  }
}

const memberPlugin: Plugin.Object = {
  name: 'fixture-sqlite-storage',
  inject: [],
  async apply(ctx: Context) {
    const base = realpathSync(mkdtempSync(join(tmpdir(), 'identity-row-')))
    const created = await createSqliteStorage({
      config: sqliteConfig(join(base, 'storage')),
      materials: identityCatalog(),
      closeLeases: { admit: () => ({}), release: () => undefined },
    })
    if (created.kind !== 'created') {
      rmSync(base, { recursive: true, force: true })
      throw new Error(`fixture sqlite rejected: ${created.problems.join('; ')}`)
    }
    new ForwardingStorage(ctx, created.storage)
    ctx.effect(() => async () => {
      await created.control.close({ initiator: 'disposal' })
      rmSync(base, { recursive: true, force: true })
    })
  },
}

export const fixtureSqliteStorage = defineRow({
  row: 'storage',
  implementation: 'real',
  manifest: { provides: [storageKey], injects: [], sameProviderGroup: null },
  lifecycle: { kind: 'none' },
  plugin: memberPlugin,
})

export type ReleaseIdentityConfig = Readonly<{
  maxLifetime: string
  idlePeriod: string
  accessRefreshGranularity: string
  invitationDefaultDuration: string
  invitationMaxDuration: string
}>

export function releaseIdentityConfig(): ReleaseIdentityConfig {
  const path = join(import.meta.dirname, '../../../config/serve.distribution.json')
  const release = JSON.parse(readFileSync(path, 'utf8')) as {
    rows: { id: string; config?: ReleaseIdentityConfig }[]
  }
  const row = release.rows.find(entry => entry.id === 'identity')
  if (row?.config === undefined) throw new Error('the release has no identity row configuration')
  return row.config
}
