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
}

export class SqlStorage implements StorageInstance {
  /** 在途事务的异步上下文：在 fn 里再调 read/write 是嵌套调用 ⇒ StorageDefect（写队列下会自锁）。 */
  readonly #inTx = new AsyncLocalStorage<'read' | 'write'>()
  #closed = false
  #inflight = 0
  #drained: (() => void) | undefined

  constructor(private readonly handles: DialectHandles) {}

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

  /** 关准入 → 等在途事务各自收场 → 关句柄。之后 read/write ⇒ StorageUnavailable。 */
  async close(): Promise<void> {
    if (this.#closed) return
    this.#closed = true
    if (this.#inflight > 0) {
      await new Promise<void>(resolve => {
        this.#drained = resolve
      })
    }
    await this.handles.writeDb.destroy()
    await this.handles.readDb.destroy()
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
