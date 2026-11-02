// 本行用例的 `storage` 夹具行：一个经真实 sqlite-provider 转发的 `StorageService` 子类，装在临时存储根上，
// 材料目录只有 identity-sql 自己的材料。APP-0 的 `fixtureStorage` 只提供裸的 `storage` 名字，没有 `SqlStorage`
// 的方法，identity-sql 插件体在它上面 `registerCombination` 会抛错，所以本行要一个能受理登记的提供者。
// 撤除时关闭提供者并删掉临时根。真实的 `storage` 行（APP-1）另有入口对象承载的关闭，这里不模拟它。
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Context, Plugin } from '@deepseek-ai/cordis'
import { identitySqlMaterials } from '@omne-harness/identity-sql'
import type { SqlMaterialCatalog, SqlStorage } from '@omne-harness/sql-contract'
import { StorageService, storageKey } from '@omne-harness/sql-contract/cordis'
import { createSqliteStorage, type SqliteStorageConfig } from '@omne-harness/sqlite-provider'
import { defineRow } from '../../../src/row.ts'

/** sqlite-provider SPEC §12.1 的候选初值，关闭期限缩短。与 identity-sql 自己的夹具相同。 */
function sqliteConfig(storageRoot: string): SqliteStorageConfig {
  return {
    storageRoot,
    admissionQueueLimit: 64,
    globalAdmissionLimit: 256,
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

/** 只有 identity-sql 材料的目录，与应用聚合的方式相同。 */
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
  readonly registerCombination: SqlStorage['registerCombination']
  readonly commit: SqlStorage['commit']
  readonly query: SqlStorage['query']
  readonly read: SqlStorage['read']

  constructor(ctx: Context, storage: SqlStorage) {
    super(ctx)
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
