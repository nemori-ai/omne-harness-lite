import { DatabaseSync } from 'node:sqlite'
import type { CanvasStore, StoreAnswer, StoreRead } from '@omne-harness/canvas'
import type { JsonValue } from '@omne-harness/sql-contract'
import type { SqlValue } from '@omne-harness/sql-contract/worker'
import migration from '../../src/storage/migration.ts'
import participant from '../../src/storage/participant.ts'
import reader from '../../src/storage/read.ts'

const json = (value: unknown): JsonValue => JSON.parse(JSON.stringify(value)) as JsonValue

export function portOf(db: DatabaseSync) {
  return {
    execute(sql: string, params: readonly SqlValue[]) {
      const statement = db.prepare(sql)
      statement.setReadBigInts(true)
      statement.setReturnArrays(true)
      if (statement.columns().length === 0) {
        const run = statement.run(...(params as never[]))
        return { columns: [], rows: [], changes: BigInt(run.changes), lastInsertRowid: null }
      }
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

type Faults = { reads: boolean; commits: 'unknown' | null }

/**
 * The read handler, the participant and the migration of this member on node:sqlite in the test
 * process: one database per tenant, one transaction per commit. It is what the storage worker runs,
 * without the worker, so that coverage and mutation can see it.
 */
export function createInProcessStore(
  databases = new Map<string, DatabaseSync>(),
  faults: Faults = { reads: false, commits: null },
): CanvasStore {
  const open = (tenant: string) => {
    const db = databases.get(tenant) ?? migrated()
    databases.set(tenant, db)
    return db
  }
  async function read<T>(tenant: string, request: object): Promise<StoreRead<T>> {
    if (faults.reads) return { kind: 'unavailable' }
    try {
      const outcome = reader.read(json({ tenant, ...request }), portOf(open(tenant)))
      return outcome.kind === 'read'
        ? { kind: 'read', value: outcome.output as T }
        : { kind: 'unavailable' }
    } catch {
      return { kind: 'unavailable' }
    }
  }
  async function commit<T>(
    tenant: string,
    script: string,
    command: unknown,
  ): Promise<StoreAnswer<T>> {
    const db = open(tenant)
    db.exec('BEGIN')
    try {
      const reply = participant.execute({ script, tenant, command: json(command) }, portOf(db))
      if (reply.kind !== 'participated') throw new Error(reply.kind)
      db.exec('COMMIT')
      return faults.commits === 'unknown'
        ? { kind: 'unknown' }
        : { kind: 'committed', value: reply.response as T }
    } catch {
      db.exec('ROLLBACK')
      return { kind: 'rolled-back' }
    }
  }
  return {
    look: (tenant, canvas) => read(tenant, { read: 'look', canvas }),
    away: (tenant, canvas, page) => read(tenant, { read: 'away', canvas, ...page }),
    placing: (tenant, canvas, reference) => read(tenant, { read: 'placing', canvas, reference }),
    place: (tenant, command) => commit(tenant, 'place', command),
    arrange: (tenant, command) => commit(tenant, 'arrange', command),
    take: (tenant, command) => commit(tenant, 'take', command),
    pile: (tenant, command) => commit(tenant, 'pile', command),
    scatter: (tenant, command) => commit(tenant, 'scatter', command),
    lock: (tenant, command) => commit(tenant, 'lock', command),
  }
}
