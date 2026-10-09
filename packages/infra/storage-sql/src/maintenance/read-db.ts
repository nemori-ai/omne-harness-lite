import type { AsyncSqliteDatabase } from '../sqlite/async-database.ts'
import {
  Kysely,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
  type DatabaseConnection,
  type Driver,
} from 'kysely'
import { StorageDefect, type UntypedDb } from '@omne-harness-lite/storage'
import { NodeSqliteConnection } from '../sqlite/driver.ts'
import { UniqueConstraintResolver } from '../sqlite/constraints.ts'

/** Borrows an already-owned read-only handle, never opens a path or closes its owner. */
class SnapshotReadDriver implements Driver {
  readonly #connection: DatabaseConnection
  #queue: Promise<void> = Promise.resolve()
  #release: (() => void) | undefined
  #closed = false
  constructor(handle: AsyncSqliteDatabase) {
    this.#connection = new NodeSqliteConnection(handle, 'read', new UniqueConstraintResolver())
  }
  async init(): Promise<void> {}
  async acquireConnection(): Promise<DatabaseConnection> {
    if (this.#closed) throw new StorageDefect('snapshot view has ended')
    const previous = this.#queue
    let release!: () => void
    this.#queue = new Promise<void>(resolve => {
      release = resolve
    })
    await previous
    if (this.#closed) {
      release()
      throw new StorageDefect('snapshot view has ended')
    }
    this.#release = release
    return this.#connection
  }
  async releaseConnection(): Promise<void> {
    const release = this.#release
    this.#release = undefined
    release?.()
  }
  async beginTransaction(): Promise<void> {
    throw new StorageDefect('snapshot already owns its read transaction')
  }
  async commitTransaction(): Promise<void> {
    throw new StorageDefect('snapshot owns transaction completion')
  }
  async rollbackTransaction(): Promise<void> {
    throw new StorageDefect('snapshot owns transaction completion')
  }
  async destroy(): Promise<void> {
    this.#closed = true
    await this.#queue
  }
}

export function snapshotReadDb(handle: AsyncSqliteDatabase): UntypedDb {
  const driver = new SnapshotReadDriver(handle)
  return new Kysely({
    dialect: {
      createDriver: () => driver,
      createAdapter: () => new SqliteAdapter(),
      createQueryCompiler: () => new SqliteQueryCompiler(),
      createIntrospector: db => new SqliteIntrospector(db),
    },
  })
}
