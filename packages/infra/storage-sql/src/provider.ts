// Storage 协议的实现：读、写各一个 Kysely 实例（同一底层库），锁语义按方言，撤除时关准入→等在途→关句柄。
import { AsyncLocalStorage } from 'node:async_hooks'
import type { AtomicStorage, StorageUnit } from '@omne-harness-lite/storage'
import { SqlStorageUnit } from './unit.ts'
import type { SnapshotEngine } from './maintenance/engine.ts'
import {
  SnapshotFailure,
  type SnapshotMaintenance,
  type SnapshotRunOptions,
  type SnapshotSession,
} from '@omne-harness-lite/storage'
import type { StorageSqlLogger } from './upgrade/owner.ts'
import { sql, type Kysely, type Transaction } from 'kysely'
import {
  StorageDefect,
  StorageUnavailable,
  type ReadTx,
  type StorageInstance,
  type UntypedDb,
  type WriteTx,
} from '@omne-harness-lite/storage'

const retainedHandles = new Set<DialectHandles>()
/** Faulted owners retain native dependencies until process exit. */
export function retainStorageHandles(handles: DialectHandles): void {
  retainedHandles.add(handles)
}

export interface DialectHandles {
  /** Native observation, including handles whose driver initialization failed. */
  readonly resourcesClosed?: () => boolean
  readonly readDb: UntypedDb
  readonly writeDb: UntypedDb
  /** 在写事务里对命中的行取排他锁；sqlite 下不发语句。 */
  lockRow(
    trx: Transaction<UntypedDb>,
    table: string,
    key: Readonly<Record<string, unknown>>,
  ): Promise<void>
  lockSentinel(trx: Transaction<UntypedDb>, name: string): Promise<void>
  /** 读事务的隔离设置（pg：REPEATABLE READ READ ONLY；sqlite：由只读句柄承担）。 */
  readonly readIsolation: 'repeatable read' | undefined
  readonly writeIsolation: 'read committed' | undefined
  /** 当前库里已存在的用户表名（含迁移登记表）；在调用方给的事务里读，不写。 */
  listTables(db: UntypedDb): Promise<string[]>
}

/** 属主实例的撤除收尾，由升级守卫提供；不开守卫的实例没有这一层。 */
export interface StorageTeardown {
  /** 撤除第一步：守卫置为已撤（此后 confirm 抛 NotAttached）；返回需要等它返回的在途确认。 */
  begin(): Promise<unknown> | undefined
  /** 句柄关闭之后：磁盘上仍有快照 ⇒ 恢复（句柄没关干净则不恢复）；最后放排他。 */
  finish(handlesClosed: boolean): Promise<void>
}

/** Created only in the owner startup path with that instance's source and attachment. */
export interface OwnedSnapshots {
  readonly engine: SnapshotEngine
  readonly confirmed: () => boolean
  readonly onClosed: (status: 'clean' | 'error') => void
}

export class SqlStorage implements StorageInstance, AtomicStorage {
  readonly maintenance: SnapshotMaintenance | undefined
  /** 在途事务的异步上下文：在 fn 里再调 read/write 是嵌套调用 ⇒ StorageDefect（写队列下会自锁）。 */
  readonly #inTx = new AsyncLocalStorage<'read' | 'write'>()
  #closed = false
  #closing: Promise<void> | undefined
  #inflight = 0
  #drained: (() => void) | undefined

  constructor(
    private readonly handles: DialectHandles,
    private readonly teardown?: StorageTeardown,
    private readonly logger?: StorageSqlLogger,
    private readonly snapshots?: OwnedSnapshots,
  ) {
    this.maintenance =
      snapshots === undefined
        ? undefined
        : {
            run: <T>(fn: (session: SnapshotSession) => Promise<T>, options?: SnapshotRunOptions) =>
              this.#maintain(fn, options),
          }
  }

  async #maintain<T>(
    fn: (session: SnapshotSession) => Promise<T>,
    options?: SnapshotRunOptions,
  ): Promise<T> {
    if (this.snapshots === undefined || !this.snapshots.confirmed())
      throw new SnapshotFailure('unavailable')
    try {
      this.#admit()
    } catch (error) {
      if (error instanceof StorageUnavailable)
        throw new SnapshotFailure('unavailable', { cause: error })
      throw error
    }
    try {
      return await this.snapshots.engine.run(fn, options)
    } finally {
      this.#leave()
    }
  }

  async atomic<T>(fn: (unit: StorageUnit) => Promise<T>): Promise<T> {
    let unit: SqlStorageUnit | undefined
    let result: T
    try {
      result = await this.write(tx => {
        unit = new SqlStorageUnit(this, tx)
        return unit.execute(fn)
      })
    } catch (error) {
      // An escaped callback failure is rolled back by write. A commit failure remains unknown.
      unit?.complete(unit.completionAfterError(error))
      throw error
    }
    unit!.complete('committed')
    // write 已提交并退出其上下文；通知不得在事务回调内部派发。
    unit!.publish(() => {
      if (this.logger !== undefined) this.logger.error('after-commit notification failed')
      else console.error('storage-sql: after-commit notification failed')
    })
    return result
  }

  async read<T>(fn: (tx: ReadTx) => Promise<T>): Promise<T> {
    this.#admit()
    try {
      let builder = this.handles.readDb.transaction().setAccessMode('read only')
      if (this.handles.readIsolation !== undefined)
        builder = builder.setIsolationLevel(this.handles.readIsolation)
      return await this.#inTx.run('read', () =>
        builder.execute(async trx => fn({ db: trx as unknown as UntypedDb })),
      )
    } finally {
      this.#leave()
    }
  }

  async write<T>(fn: (tx: WriteTx) => Promise<T>): Promise<T> {
    this.#admit()
    try {
      let builder = this.handles.writeDb.transaction().setAccessMode('read write')
      if (this.handles.writeIsolation !== undefined)
        builder = builder.setIsolationLevel(this.handles.writeIsolation)
      return await this.#inTx.run('write', () =>
        builder.execute(async trx => {
          const tx: WriteTx = {
            db: trx as unknown as UntypedDb,
            lockRow: (table, key) => this.handles.lockRow(trx, table, key),
            lockSentinel: name => this.handles.lockSentinel(trx, name),
          }
          return fn(tx)
        }),
      )
    } finally {
      this.#leave()
    }
  }

  /**
   * 关准入 → 等在途事务各自收场（与在途的升级确认）→ 关句柄 → 属主实例：恢复未确认的快照、放排他。
   * 之后 read/write ⇒ StorageUnavailable。重复调用得到同一次收尾。
   */
  close(): Promise<void> {
    this.#closing ??= this.#close()
    return this.#closing
  }

  async #close(): Promise<void> {
    try {
      await this.#closeResources()
      this.snapshots?.onClosed('clean')
    } catch (error) {
      this.snapshots?.onClosed('error')
      throw error
    }
  }

  async #closeResources(): Promise<void> {
    const confirming = this.teardown?.begin()
    this.#closed = true
    const maintenance = this.snapshots?.engine.close().then(
      () => ({ ok: true as const }),
      error => ({ ok: false as const, error: error as unknown }),
    )
    if (this.#inflight > 0) {
      await new Promise<void>(resolve => {
        this.#drained = resolve
      })
    }
    // 确认的失败归调用 confirm() 的那一方；这里只等它不再碰快照
    await confirming?.catch(() => undefined)
    const maintenanceResult = await maintenance
    if (this.snapshots !== undefined && !this.snapshots.engine.ownershipReleased) {
      retainStorageHandles(this.handles)
      throw new StorageDefect('maintenance resources remain owned; source ownership is retained', {
        cause: maintenanceResult?.ok === false ? maintenanceResult.error : undefined,
      })
    }
    let handlesClosed = false
    try {
      try {
        await this.handles.writeDb.destroy()
      } finally {
        await this.handles.readDb.destroy()
      }
      if (this.handles.resourcesClosed?.() === false)
        throw new StorageDefect('native storage handles remain open')
      handlesClosed = true
    } finally {
      if (this.snapshots !== undefined && !handlesClosed) {
        retainStorageHandles(this.handles)
        throw new StorageDefect('storage handles did not close; source ownership is retained')
      }
      await this.teardown?.finish(handlesClosed)
    }
    if (maintenanceResult?.ok === false) throw maintenanceResult.error
  }

  #admit(): void {
    const enclosing = this.#inTx.getStore()
    if (enclosing !== undefined)
      throw new StorageDefect(`nested storage call inside a ${enclosing} transaction`)
    if (this.#closed) throw new StorageUnavailable('storage is closed')
    this.#inflight += 1
  }

  #leave(): void {
    this.#inflight -= 1
    if (this.#inflight === 0 && this.#drained !== undefined) {
      const resolve = this.#drained
      this.#drained = undefined
      resolve()
    }
  }
}

/** 启动 ping：连不上即抛出（启动失败，不半开）。 */
export async function ping(db: Kysely<unknown>): Promise<void> {
  await sql`SELECT 1`.execute(db)
}
