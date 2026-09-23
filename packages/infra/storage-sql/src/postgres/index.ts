// pg 方言：本程只接线不跑（无可连的 pg）。写事务 READ COMMITTED + 逐语句 SAVEPOINT（P-2）；读事务 REPEATABLE READ READ ONLY；
// lockRow ⇒ SELECT … FOR UPDATE；lockSentinel ⇒ pg_advisory_xact_lock(hashtext(name))。错误码：23505/23503/08xxx/57Pxx/53xxx/40001/40P01/55P03。
import {
  Kysely,
  PostgresDialect,
  sql,
  type CompiledQuery,
  type DatabaseConnection,
  type Driver,
  type QueryResult,
  type Transaction,
  type TransactionSettings,
} from 'kysely'
import pg from 'pg'
import {
  ReferenceViolation,
  StorageDefect,
  StorageUnavailable,
  UniqueViolation,
  type UntypedDb,
} from '@omne-harness-lite/storage'
import type { DialectHandles } from '../provider.ts'

export interface PostgresOptions {
  readonly connectionString: string
}

interface PgErrorShape {
  readonly code?: unknown
  readonly constraint?: unknown
  readonly message?: unknown
}

function statementKind(sqlText: string): 'delete' | 'other' {
  return sqlText.trimStart().slice(0, 6).toLowerCase() === 'delete' ? 'delete' : 'other'
}

export function translatePgError(error: unknown, sqlText: string): Error {
  if (typeof error !== 'object' || error === null)
    return new StorageDefect('non-error thrown by pg driver', { cause: error })
  const e = error as PgErrorShape
  const code = typeof e.code === 'string' ? e.code : ''
  if (code === '23505')
    return new UniqueViolation(typeof e.constraint === 'string' ? e.constraint : 'unknown', {
      cause: error,
    })
  if (code === '23503')
    return new ReferenceViolation(
      statementKind(sqlText) === 'delete' ? 'delete-restricted' : 'missing-target',
      { cause: error },
    )
  if (code === '25006')
    return new StorageDefect('write statement in a read-only transaction', { cause: error })
  if (
    code.startsWith('08') ||
    code.startsWith('57P') ||
    code.startsWith('53') ||
    code === '40001' ||
    code === '40P01' ||
    code === '55P03' ||
    code === 'ECONNREFUSED' ||
    code === 'ECONNRESET' ||
    code === 'ETIMEDOUT'
  ) {
    return new StorageUnavailable(`postgres unavailable: ${String(e.message)}`, { cause: error })
  }
  return new StorageDefect(`postgres statement failed: ${String(e.message)}`, { cause: error })
}

/** 写事务里每条语句包 SAVEPOINT，语句失败只回滚到 SAVEPOINT（P-2）。 */
class SavepointConnection implements DatabaseConnection {
  #depth = 0
  /** 只有 beginTransaction…commit/rollback 之间才包 SAVEPOINT；事务外的语句（启动 ping、Migrator 建表）原样执行。 */
  inTransaction = false
  constructor(
    private readonly inner: DatabaseConnection,
    private readonly write: boolean,
  ) {}
  async executeQuery<R>(compiled: CompiledQuery): Promise<QueryResult<R>> {
    if (!this.write || !this.inTransaction) {
      try {
        return await this.inner.executeQuery<R>(compiled)
      } catch (error) {
        throw translatePgError(error, compiled.sql)
      }
    }
    const name = `omne_sp_${this.#depth++}`
    await this.inner.executeQuery({
      sql: `SAVEPOINT ${name}`,
      parameters: [],
      query: compiled.query,
      queryId: compiled.queryId,
    })
    try {
      const result = await this.inner.executeQuery<R>(compiled)
      await this.inner.executeQuery({
        sql: `RELEASE SAVEPOINT ${name}`,
        parameters: [],
        query: compiled.query,
        queryId: compiled.queryId,
      })
      return result
    } catch (error) {
      await this.inner.executeQuery({
        sql: `ROLLBACK TO SAVEPOINT ${name}`,
        parameters: [],
        query: compiled.query,
        queryId: compiled.queryId,
      })
      throw translatePgError(error, compiled.sql)
    }
  }
  streamQuery<R>(
    compiled: CompiledQuery,
    chunkSize: number,
  ): AsyncIterableIterator<QueryResult<R>> {
    return this.inner.streamQuery<R>(compiled, chunkSize)
  }
}

class SavepointDriver implements Driver {
  readonly #wrapped = new Map<DatabaseConnection, DatabaseConnection>()
  constructor(
    private readonly inner: Driver,
    private readonly write: boolean,
  ) {}
  init() {
    return this.inner.init()
  }
  async acquireConnection(): Promise<DatabaseConnection> {
    const raw = await this.inner.acquireConnection()
    const wrapped = new SavepointConnection(raw, this.write)
    this.#wrapped.set(wrapped, raw)
    return wrapped
  }
  async beginTransaction(connection: DatabaseConnection, settings: TransactionSettings) {
    await this.inner.beginTransaction(this.#raw(connection), settings)
    if (connection instanceof SavepointConnection) connection.inTransaction = true
  }
  async commitTransaction(connection: DatabaseConnection) {
    if (connection instanceof SavepointConnection) connection.inTransaction = false
    await this.inner.commitTransaction(this.#raw(connection))
  }
  async rollbackTransaction(connection: DatabaseConnection) {
    if (connection instanceof SavepointConnection) connection.inTransaction = false
    await this.inner.rollbackTransaction(this.#raw(connection))
  }
  async releaseConnection(connection: DatabaseConnection) {
    const raw = this.#raw(connection)
    this.#wrapped.delete(connection)
    await this.inner.releaseConnection(raw)
  }
  destroy() {
    return this.inner.destroy()
  }
  #raw(connection: DatabaseConnection): DatabaseConnection {
    return this.#wrapped.get(connection) ?? connection
  }
}

export function openPostgres(options: PostgresOptions): DialectHandles {
  const pool = new pg.Pool({ connectionString: options.connectionString })
  const make = (write: boolean): UntypedDb => {
    const dialect = new PostgresDialect({ pool })
    return new Kysely({
      dialect: {
        createDriver: () => new SavepointDriver(dialect.createDriver(), write),
        createQueryCompiler: () => dialect.createQueryCompiler(),
        createAdapter: () => dialect.createAdapter(),
        createIntrospector: db => dialect.createIntrospector(db),
      },
    })
  }
  return {
    readDb: make(false),
    writeDb: make(true),
    async lockRow(trx: Transaction<UntypedDb>, table, key) {
      const conditions = Object.entries(key).map(
        ([column, value]) => sql`${sql.ref(column)} = ${value}`,
      )
      await sql`SELECT 1 FROM ${sql.table(table)} WHERE ${sql.join(conditions, sql` AND `)} FOR UPDATE`.execute(
        trx,
      )
    },
    async lockSentinel(trx: Transaction<UntypedDb>, name) {
      await sql`SELECT pg_advisory_xact_lock(hashtext(${name}))`.execute(trx)
    },
    readIsolation: 'repeatable read',
    writeIsolation: 'read committed',
    async listTables(db) {
      const { rows } = await sql<{
        name: string
      }>`SELECT table_name AS name FROM information_schema.tables WHERE table_schema = current_schema() AND table_type = 'BASE TABLE'`.execute(
        db,
      )
      return rows.map(row => row.name)
    },
  }
}
