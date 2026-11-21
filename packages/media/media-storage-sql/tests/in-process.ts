import { DatabaseSync } from 'node:sqlite'
import type { MediaIndex } from '@omne-harness/media-contract'
import { createSqlMediaIndex } from '../src/store.ts'
import type { JsonValue, SqlStorage } from '@omne-harness/sql-contract'
import type { SqlValue } from '@omne-harness/sql-contract/worker'
import migration from '../src/migration.ts'
import representations from '../src/migration-representations.ts'
import participant from '../src/participant.ts'
import reader from '../src/read.ts'

const json = (value: unknown): JsonValue => JSON.parse(JSON.stringify(value)) as JsonValue

function portOf(db: DatabaseSync, reading = false) {
  return {
    execute(sql: string, params: readonly SqlValue[]) {
      if (reading && !/\blimit\b/i.test(sql)) throw new Error('statement has no LIMIT')
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

export type InProcessOptions = Readonly<{
  wrap?: (storage: SqlStorage) => SqlStorage
  unbound?: readonly string[]
}>

/** What the worker runs, without the worker: one database per storage domain, one transaction per commit. */
export function createInProcessStorage(): SqlStorage {
  const databases = new Map<string, DatabaseSync>()
  const open = (domain: string) => {
    let db = databases.get(domain)
    if (db === undefined) {
      db = new DatabaseSync(':memory:')
      migration.up(portOf(db))
      representations.up(portOf(db))
      databases.set(domain, db)
    }
    return db
  }
  return {
    async commit(request: Parameters<SqlStorage['commit']>[0]) {
      const db = open(request.identity.transactionDomain)
      db.exec('BEGIN')
      try {
        const reply = participant.execute(json(request.commands[0]?.facts) as never, portOf(db))
        if (reply.kind !== 'participated') throw new Error(reply.kind)
        db.exec('COMMIT')
        return { kind: 'committed', responses: [{ reply: json(reply) }] }
      } catch {
        db.exec('ROLLBACK')
        return { kind: 'rolled_back' }
      }
    },
    async read(request: Parameters<SqlStorage['read']>[0]) {
      const db = open(request.domain.transactionDomain)
      const outcome = reader.read(json(request.input), portOf(db, true))
      return outcome.kind === 'read'
        ? { kind: 'read', requestKey: request.requestKey, output: json(outcome.output) }
        : { kind: 'unavailable' }
    },
  } as unknown as SqlStorage
}

/** The index of this member over the in-process storage, so that coverage and mutation see all of it. */
export function createInProcessIndex(options: InProcessOptions = {}): MediaIndex {
  const storage = createInProcessStorage()
  return createSqlMediaIndex({
    storage: options.wrap?.(storage) ?? storage,
    bind: async tenant =>
      options.unbound?.includes(tenant)
        ? null
        : {
            transactionDomain: `tenant/in-process/${tenant}`,
            combinationVersion: 'in-process/1',
            manifestDigest: 'in-process',
          },
  })
}
