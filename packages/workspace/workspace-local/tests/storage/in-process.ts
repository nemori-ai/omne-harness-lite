import { DatabaseSync } from 'node:sqlite'
import type { StoreAnswer, StoreRead, WorkspaceStore } from '@omne-harness/workspace'
import type { JsonValue } from '@omne-harness/sql-contract'
import type { SqlValue } from '@omne-harness/sql-contract/worker'
import migration from '../../src/storage/migration.ts'
import sources from '../../src/storage/migration-sources.ts'
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

export type InProcessStore = WorkspaceStore & Readonly<{ db: DatabaseSync }>

/** What the storage worker runs, on node:sqlite in the test process: one transaction per commit. */
export function createInProcessStore(): InProcessStore {
  const db = new DatabaseSync(':memory:')
  migration.up(portOf(db))
  sources.up(portOf(db))

  async function commit<T>(script: string, command: unknown): Promise<StoreAnswer<T>> {
    db.exec('BEGIN')
    try {
      const reply = participant.execute({ script, command: json(command) }, portOf(db))
      if (reply.kind !== 'participated') throw new Error(reply.diagnostic)
      db.exec('COMMIT')
      return { kind: 'committed', value: json(reply.response) as T }
    } catch {
      db.exec('ROLLBACK')
      return { kind: 'rolled-back' }
    }
  }

  async function read<T>(name: string, ...args: string[]): Promise<StoreRead<T>> {
    try {
      const outcome = reader.read(json({ read: name, args }), portOf(db))
      return outcome.kind === 'read'
        ? { kind: 'read', value: json(outcome.output) as T }
        : { kind: 'unavailable' }
    } catch {
      return { kind: 'unavailable' }
    }
  }

  return {
    db,
    register: command => commit('register', command),
    associate: command => commit('associate', command),
    dissociate: command => commit('dissociate', command),
    govern: command => commit('govern', command),
    destroy: command => commit('destroy', command),
    state: (tenant, workspace) => read('state', tenant, workspace),
    memberships: tenant => read('memberships', tenant),
    operation: (tenant, operation) => read('operation', tenant, operation),
    sourceRevision: (tenant, workspace) => read('source-revision', tenant, workspace),
  }
}
