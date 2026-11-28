import { DatabaseSync } from 'node:sqlite'
import type { GoalStore, StoreAnswer, StoreRead } from '@omne-harness/goal'
import type { JsonValue } from '@omne-harness/sql-contract'
import type { SqlValue } from '@omne-harness/sql-contract/worker'
import choiceMigration from '../../src/storage/choice-migration.ts'
import examinerMigration from '../../src/storage/examiner-migration.ts'
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

/**
 * The participant, the read handler and the migration of this member on node:sqlite in the
 * test process: one database per tenant, one transaction per commit. It is what the storage
 * worker runs, without the worker, so that coverage and mutation can see it.
 */
export function createInProcessStore(): GoalStore {
  const databases = new Map<string, DatabaseSync>()
  const open = (tenant: string) => {
    let db = databases.get(tenant)
    if (db === undefined) {
      db = new DatabaseSync(':memory:')
      migration.up(portOf(db))
      examinerMigration.up(portOf(db))
      choiceMigration.up(portOf(db))
      databases.set(tenant, db)
    }
    return db
  }

  async function commit<T>(
    tenant: string,
    script: string,
    command: unknown,
  ): Promise<StoreAnswer<T>> {
    const db = open(tenant)
    db.exec('BEGIN')
    try {
      const reply = participant.execute({ script, command: json(command) }, portOf(db))
      if (reply.kind !== 'participated') throw new Error(reply.kind)
      db.exec('COMMIT')
      return { kind: 'committed', value: json(reply.response) as T }
    } catch {
      db.exec('ROLLBACK')
      return { kind: 'rolled-back' }
    }
  }

  async function read<T>(tenant: string, name: string, ...args: unknown[]): Promise<StoreRead<T>> {
    try {
      const outcome = reader.read(json({ read: name, args }), portOf(open(tenant)))
      return outcome.kind === 'read'
        ? { kind: 'read', value: json(outcome.output) as T }
        : { kind: 'unavailable' }
    } catch {
      return { kind: 'unavailable' }
    }
  }

  return {
    commit: (tenant, command) => commit(tenant, 'commit', command),
    latest: (tenant, session) => read(tenant, 'latest', session),
    owing: tenant => read(tenant, 'owing'),
    examinedBy: (tenant, examiner) => read(tenant, 'examinedBy', examiner),
    chosen: (tenant, session) => read(tenant, 'chosen', session),
    choose: (tenant, session, judge) => commit(tenant, 'choose', { session, judge }),
  }
}
