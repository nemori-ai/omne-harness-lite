// Storage 协议的实现：读、写各一个 Kysely 实例（同一底层库），锁语义按方言，撤除时关准入→等在途→关句柄。
import { AsyncLocalStorage } from 'node:async_hooks'
import { sql, type Kysely, type Transaction } from 'kysely'
import {
  StorageDefect,
  StorageUnavailable,
  type ReadTx,
  type StorageInstance,
  type UntypedDb,
  type WriteTx,
} from '@omne-harness-lite/storage'

export interface DialectHandles {
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

export class SqlStorage implements StorageInstance {
  /** 在途事务的异步上下文：在 fn 里再调 read/write 是嵌套调用 ⇒ StorageDefect（写队列下会自锁）。 */
  readonly #inTx = new AsyncLocalStorage<'read' | 'write'>()
  #closed = false
  #closing: Promise<void> | undefined
  #inflight = 0
  #drained: (() => void) | undefined

  constructor(
    private readonly handles: DialectHandles,
    private readonly teardown?: StorageTeardown,
  ) {}

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
    const confirming = this.teardown?.begin()
    this.#closed = true
    if (this.#inflight > 0) {
      await new Promise<void>(resolve => {
        this.#drained = resolve
      })
    }
    // 确认的失败归调用 confirm() 的那一方；这里只等它不再碰快照
    await confirming?.catch(() => undefined)
    let handlesClosed = false
    try {
      try {
        await this.handles.writeDb.destroy()
      } finally {
        await this.handles.readDb.destroy()
      }
      handlesClosed = true
    } finally {
      await this.teardown?.finish(handlesClosed)
    }
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
