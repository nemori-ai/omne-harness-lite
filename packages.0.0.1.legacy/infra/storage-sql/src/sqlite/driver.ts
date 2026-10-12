// node:sqlite工作线程适配：一写队列、最多四读连接；BEGIN IMMEDIATE忙时异步重试（P-12）。
// 复用 kysely 的 SqliteAdapter / SqliteQueryCompiler / SqliteIntrospector。
import { performance } from 'node:perf_hooks'
import { AsyncSqliteDatabase } from './async-database.ts'
import {
  CompiledQuery,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
  type DatabaseConnection,
  type Dialect,
  type Driver,
  type Kysely,
  type QueryResult,
  type TransactionSettings,
} from 'kysely'
import { StorageUnavailable } from '@omne-harness-lite/storage'
import { isSqliteBusy, translateSqliteError, type StatementKind } from './errors.ts'
import { UniqueConstraintResolver } from './constraints.ts'
import { assertProductionStoragePath } from './protection.ts'

export interface NodeSqliteDialectOptions {
  readonly file: string
  /** 缺省 NORMAL；治理中心装配按 D-039 显式选 FULL。 */
  readonly synchronous?: 'normal' | 'full'
  /** 本 Kysely 实例只做读或只做写：提供者为两种事务各开一个实例，事务种类因此在构造期就定了。 */
  readonly role: 'write' | 'read'
  /** Open an existing file without write access. Valid only with role=read. */
  readonly readOnly?: boolean
  /** 写锁争用的总等待上限；超过 ⇒ StorageUnavailable。 */
  readonly writeLockTimeoutMs?: number
}

const WRITE_LOCK_TIMEOUT_MS = 5000
/** 读句柄上限（候选常量）：峰值并发读之外的调用排队等释放，不无限开句柄。 */
const MAX_READERS = 4
const RETRY_BACKOFF_MS = [1, 2, 4, 8, 16, 32, 50] as const

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

function statementKind(sql: string): StatementKind {
  const head = sql.trimStart().slice(0, 6).toLowerCase()
  if (head.startsWith('select') || head.startsWith('with') || head.startsWith('pragma'))
    return 'select'
  if (head.startsWith('insert')) return 'insert'
  if (head.startsWith('update')) return 'update'
  if (head.startsWith('delete')) return 'delete'
  return 'other'
}

function returnsRows(sql: string): boolean {
  const head = sql.trimStart().toLowerCase()
  return (
    head.startsWith('select') ||
    head.startsWith('with') ||
    head.startsWith('pragma') ||
    / returning /i.test(sql)
  )
}

/** Internal reusable executor; not exported through the package's public entry. */
export class NodeSqliteConnection implements DatabaseConnection {
  constructor(
    readonly db: AsyncSqliteDatabase,
    readonly role: 'write' | 'read',
    private readonly resolver: UniqueConstraintResolver,
  ) {}

  async executeQuery<R>(compiled: CompiledQuery): Promise<QueryResult<R>> {
    const kind = statementKind(compiled.sql)
    try {
      const parameters = compiled.parameters as readonly (
        null | number | bigint | string | Uint8Array
      )[]
      if (returnsRows(compiled.sql)) {
        const rows = (await this.db.all(compiled.sql, parameters)) as R[]
        return { rows }
      }
      const result = await this.db.run(compiled.sql, parameters)
      return {
        rows: [],
        numAffectedRows: BigInt(result.changes),
        insertId: BigInt(result.lastInsertRowid),
      }
    } catch (error) {
      const constraint =
        error instanceof Error && 'errcode' in error && [2067, 1555].includes(Number(error.errcode))
          ? await this.resolver.resolve(this.db, error.message)
          : undefined
      throw translateSqliteError(error, kind, () => constraint, this.role)
    }
  }

  // eslint-disable-next-line require-yield
  async *streamQuery<R>(): AsyncIterableIterator<QueryResult<R>> {
    throw new Error(
      'streamQuery is not supported by the node:sqlite driver (the storage protocol has no streaming read face)',
    )
  }
}

// Covers failed initialization before a connection can enter the pool.
const retainedNativeHandles = new Set<AsyncSqliteDatabase>()

export class NodeSqliteDriver implements Driver {
  readonly #native = new Set<AsyncSqliteDatabase>()
  get resourcesClosed(): boolean {
    return [...this.#native].every(db => !db.isOpen)
  }
  #writer: NodeSqliteConnection | undefined
  #readers: NodeSqliteConnection[] = []
  #openReaders = 0
  #readerWaiters: { resolve(c: DatabaseConnection): void; reject(error: unknown): void }[] = []
  #writeQueue: Promise<void> = Promise.resolve()
  #closed = false
  readonly #resolver = new UniqueConstraintResolver()

  constructor(private readonly options: NodeSqliteDialectOptions) {
    if (options.readOnly && options.role !== 'read')
      throw new TypeError('native read-only SQLite requires role=read')
  }

  async init(): Promise<void> {
    if (this.options.role === 'write') {
      this.#writer = new NodeSqliteConnection(await this.#open('write'), 'write', this.#resolver)
    } else {
      // 读句柄按需开；这里开一个以便打开失败在启动期暴露
      this.#readers.push(new NodeSqliteConnection(await this.#open('read'), 'read', this.#resolver))
      this.#openReaders = 1
    }
  }

  async #open(role: 'write' | 'read'): Promise<AsyncSqliteDatabase> {
    assertProductionStoragePath(this.options.file)
    const db = new AsyncSqliteDatabase(this.options.file, {
      enableForeignKeyConstraints: true,
      timeout: role === 'write' ? 0 : 5000,
      readOnly: this.options.readOnly ?? false,
    })
    this.#native.add(db)
    try {
      await db.ready
      if (!this.options.readOnly) await db.exec('PRAGMA journal_mode = WAL')
      await db.exec(
        this.options.synchronous === 'full'
          ? 'PRAGMA synchronous = FULL'
          : 'PRAGMA synchronous = NORMAL',
      )
      await db.exec('PRAGMA foreign_keys = ON')
      if (role === 'read') await db.exec('PRAGMA query_only = ON')
      return db
    } catch (error) {
      // The pool does not own this handle until initialization succeeds.
      try {
        await db.close()
      } catch (closing) {
        if (db.isOpen) retainedNativeHandles.add(db)
        throw new AggregateError([error, closing], 'sqlite initialization and cleanup failed')
      }
      throw error
    }
  }

  async acquireConnection(): Promise<DatabaseConnection> {
    if (this.#closed) throw new StorageUnavailable('sqlite storage is closed')
    if (this.options.role === 'read') {
      const idle = this.#readers.pop()
      if (idle !== undefined) return idle
      if (this.#openReaders < MAX_READERS) {
        this.#openReaders += 1
        try {
          const db = await this.#open('read')
          if (this.#closed) {
            await db.close()
            throw new StorageUnavailable('sqlite storage is closed')
          }
          return new NodeSqliteConnection(db, 'read', this.#resolver)
        } catch (error) {
          this.#openReaders -= 1
          throw error
        }
      }
      // 到上限：排队等一个读句柄被释放
      return new Promise<DatabaseConnection>((resolve, reject) =>
        this.#readerWaiters.push({ resolve, reject }),
      )
    }
    if (this.#writer === undefined) throw new StorageUnavailable('sqlite storage is closed')
    // 写：进程内队列，同一实例的多个 write 顺序共用一个句柄
    const previous = this.#writeQueue
    let release!: () => void
    this.#writeQueue = new Promise<void>(resolve => {
      release = resolve
    })
    await previous
    if (this.#closed || this.#writer === undefined) {
      release()
      throw new StorageUnavailable('sqlite storage is closed')
    }
    this.#writerRelease = release
    return this.#writer
  }
  #writerRelease: (() => void) | undefined

  async beginTransaction(
    connection: DatabaseConnection,
    settings: TransactionSettings,
  ): Promise<void> {
    const c = connection as NodeSqliteConnection
    if (c.role === 'read') {
      await c.db.exec('BEGIN')
      return
    }
    if (settings.accessMode === 'read only')
      throw new Error('read transaction requested on the write handle (provider bug)')
    const deadline = performance.now() + (this.options.writeLockTimeoutMs ?? WRITE_LOCK_TIMEOUT_MS)
    let attempt = 0
    for (;;) {
      try {
        await c.db.exec('BEGIN IMMEDIATE')
        return
      } catch (error) {
        if (!isSqliteBusy(error) || performance.now() >= deadline) {
          throw translateSqliteError(error, 'other', () => undefined)
        }
        await sleep(RETRY_BACKOFF_MS[Math.min(attempt, RETRY_BACKOFF_MS.length - 1)]!)
        attempt += 1
      }
    }
  }

  async commitTransaction(connection: DatabaseConnection): Promise<void> {
    const c = connection as NodeSqliteConnection
    try {
      await c.db.exec('COMMIT')
    } catch (error) {
      throw translateSqliteError(error, 'other', () => undefined)
    }
  }

  async rollbackTransaction(connection: DatabaseConnection): Promise<void> {
    const c = connection as NodeSqliteConnection
    try {
      await c.db.rollback()
    } catch (error) {
      throw translateSqliteError(error, 'other', () => undefined)
    }
  }

  async releaseConnection(connection: DatabaseConnection): Promise<void> {
    const c = connection as NodeSqliteConnection
    if (c.role === 'write') {
      const release = this.#writerRelease
      this.#writerRelease = undefined
      release?.()
      return
    }
    if (this.#closed) {
      await c.db.close()
      return
    }
    const waiter = this.#readerWaiters.shift()
    if (waiter !== undefined) {
      waiter.resolve(c)
      return
    }
    this.#readers.push(c)
  }

  /** 关准入 → 等在途写排空 → 关全部句柄。 */
  async destroy(): Promise<void> {
    this.#closed = true
    for (const waiter of this.#readerWaiters.splice(0))
      waiter.reject(new StorageUnavailable('sqlite storage is closed'))
    await this.#writeQueue
    const failures: unknown[] = []
    for (const db of this.#native) {
      try {
        if (db.isOpen) await db.close()
      } catch (error) {
        failures.push(error)
      }
      if (db.isOpen) retainedNativeHandles.add(db)
      else {
        retainedNativeHandles.delete(db)
        this.#native.delete(db)
      }
    }
    if (failures.length > 0) throw new AggregateError(failures, 'sqlite handles failed to close')
    this.#writer = undefined
    this.#readers = []
  }
}

// The upstream adapter describes its single-connection driver. This driver owns a pool.
class PooledSqliteAdapter extends SqliteAdapter {
  override get supportsMultipleConnections(): boolean {
    return true
  }
}

export class NodeSqliteDialect implements Dialect {
  readonly driver: NodeSqliteDriver
  constructor(options: NodeSqliteDialectOptions) {
    this.driver = new NodeSqliteDriver(options)
  }
  createDriver(): Driver {
    return this.driver
  }
  createQueryCompiler() {
    return new SqliteQueryCompiler()
  }
  createAdapter() {
    return new PooledSqliteAdapter()
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createIntrospector(db: Kysely<any>) {
    return new SqliteIntrospector(db)
  }
}
