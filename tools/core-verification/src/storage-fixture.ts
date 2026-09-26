import { join } from 'node:path'
import {
  NodeSqliteDialect,
  NodeSqliteDriver,
  SqlStorage,
  openStorage,
} from '@omne-harness-lite/storage-sql'
import type { StorageInstance } from '@omne-harness-lite/storage'
import type { ConformanceTables } from '@omne-harness-lite/storage/conformance'
import { CompiledQuery, Kysely, type DatabaseConnection, type Dialect } from 'kysely'

export type ForeignKeyMode = 'enabled' | 'disabled'

/**
 * Test-only mutation at the public driver boundary. SQLite ignores foreign_keys
 * changes inside a transaction, so change and observe it before BEGIN IMMEDIATE.
 * All statement execution, error mapping and transaction behavior stay real.
 */
class ForeignKeysDisabledDriver extends NodeSqliteDriver {
  constructor(
    file: string,
    private readonly observed: () => void,
  ) {
    super({ file, role: 'write' })
  }

  override async acquireConnection(): Promise<DatabaseConnection> {
    const connection = await super.acquireConnection()
    try {
      await connection.executeQuery(CompiledQuery.raw('PRAGMA foreign_keys = OFF'))
      const result = await connection.executeQuery<{ foreign_keys: number }>(
        CompiledQuery.raw('PRAGMA foreign_keys'),
      )
      if (result.rows[0]?.foreign_keys !== 0)
        throw new Error('fault injection did not disable foreign_keys on the write connection')
      this.observed()
      return connection
    } catch (error) {
      await super.releaseConnection(connection)
      throw error
    }
  }
}

export function createSqliteConformanceFixture(directory: string, mode: ForeignKeyMode) {
  const file = join(directory, 'database.sqlite')
  const instances = new Set<StorageInstance>()
  let foreignKeysDisabledObservations = 0

  async function open(): Promise<StorageInstance> {
    let instance: StorageInstance
    if (mode === 'enabled') {
      instance = await openStorage({ dialect: 'sqlite', file, upgrade: false })
    } else {
      const base = new NodeSqliteDialect({ file, role: 'write' })
      const dialect: Dialect = {
        createDriver: () =>
          new ForeignKeysDisabledDriver(file, () => {
            foreignKeysDisabledObservations += 1
          }),
        createQueryCompiler: () => base.createQueryCompiler(),
        createAdapter: () => base.createAdapter(),
        createIntrospector: db => base.createIntrospector(db),
      }
      instance = new SqlStorage({
        writeDb: new Kysely<ConformanceTables>({ dialect }),
        readDb: new Kysely<ConformanceTables>({
          dialect: new NodeSqliteDialect({ file, role: 'read' }),
        }),
        // SQLite's real BEGIN IMMEDIATE already provides these locks (P-4/P-5).
        lockRow: async () => {},
        lockSentinel: async () => {},
        readIsolation: undefined,
        writeIsolation: undefined,
        listTables: async db => (await db.introspection.getTables()).map(table => table.name),
      })
    }
    instances.add(instance)
    return instance
  }

  return {
    file,
    open,
    async close(): Promise<void> {
      await Promise.all([...instances].map(instance => instance.close()))
    },
    observations: () => ({ foreignKeysDisabledObservations }),
  }
}
