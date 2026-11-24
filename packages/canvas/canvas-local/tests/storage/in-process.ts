import { DatabaseSync } from 'node:sqlite'
import type { Arrangement, CanvasStore, StoreRead } from '@omne-harness/canvas'
import type { JsonValue } from '@omne-harness/sql-contract'
import type { SqlValue } from '@omne-harness/sql-contract/worker'
import migration from '../../src/storage/migration.ts'
import reader from '../../src/storage/read.ts'

const json = (value: unknown): JsonValue => JSON.parse(JSON.stringify(value)) as JsonValue

export function portOf(db: DatabaseSync) {
  return {
    execute(sql: string, params: readonly SqlValue[]) {
      const statement = db.prepare(sql)
      statement.setReadBigInts(true)
      statement.setReturnArrays(true)
      const rows = statement.all(...(params as never[])) as unknown as (readonly never[])[]
      return { columns: [], rows, changes: 0n, lastInsertRowid: null }
    },
    requireFact(): never {
      throw new Error('this participant requires no facts')
    },
    provideFact(): never {
      throw new Error('this participant provides no facts')
    },
  }
}

export function migrated(): DatabaseSync {
  const db = new DatabaseSync(':memory:')
  migration.up(portOf(db))
  return db
}

/**
 * The read handler and the migration of this member on node:sqlite in the test process: one
 * database per tenant. It is what the storage worker runs, without the worker, so that coverage
 * and mutation can see it.
 */
export function createInProcessStore(databases = new Map<string, DatabaseSync>()): CanvasStore {
  const open = (tenant: string) => {
    const db = databases.get(tenant) ?? migrated()
    databases.set(tenant, db)
    return db
  }
  return {
    async look(tenant, canvas): Promise<StoreRead<Arrangement>> {
      try {
        const outcome = reader.read(json({ read: 'look', tenant, canvas }), portOf(open(tenant)))
        return outcome.kind === 'read'
          ? { kind: 'read', value: outcome.output as unknown as Arrangement }
          : { kind: 'unavailable' }
      } catch {
        return { kind: 'unavailable' }
      }
    },
  }
}
