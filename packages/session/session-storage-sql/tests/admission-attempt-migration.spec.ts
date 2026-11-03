// The migration `execution-record/003-admission-attempt`: it creates the table of the original
// attempt beside the reverse input directory, runs again on a database that has it without changing
// it, and leaves a row written before it without an attempt.
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import type { SqlCell, SqlValue } from '@omne-harness/sql-contract/worker'
import { sessionStorageMaterials } from '../src/materials.ts'
import { FIXTURE_READ_OUTPUT_LIMIT_BYTES } from './fixtures/read-limit.ts'
import admissionAttempt from '../src/worker/admission-attempt-migration.ts'
import recordMigration from '../src/worker/execution-record-migration.ts'

function open() {
  const db = new DatabaseSync(':memory:')
  const port = {
    execute(sql: string, params: readonly SqlValue[]) {
      const statement = db.prepare(sql)
      statement.setReadBigInts(true)
      if (!/^\s*(SELECT|WITH)/iu.test(sql)) {
        const result = statement.run(...(params as never[]))
        return {
          columns: [],
          rows: [],
          changes: BigInt(result.changes),
          lastInsertRowid: BigInt(result.lastInsertRowid),
        }
      }
      const rows = statement.all(...(params as never[])) as Record<string, SqlCell>[]
      const columns = rows[0] === undefined ? [] : Object.keys(rows[0])
      return {
        columns,
        rows: rows.map(row => columns.map(name => row[name] ?? null)),
        changes: 0n,
        lastInsertRowid: null,
      }
    },
    requireFact: () => null,
    provideFact: () => undefined,
  }
  return { db, raw: port }
}

const LEGACY = `INSERT INTO er_admission_idx (tenant, session, input, ordinal, execution, operation, accepted, grant_ref, attachment) VALUES ('t', 's', 'i', 0, 'e', 'o', '{}', '{}', 'a')`
const DEFINITION = `SELECT sql FROM sqlite_schema WHERE name = 'er_admission_attempt_idx'`

describe('execution-record/003-admission-attempt', () => {
  it('requires the records migration, owns its table and is registered with its module', () => {
    const { migrations, participants } = sessionStorageMaterials({
      readOutputLimitBytes: FIXTURE_READ_OUTPUT_LIMIT_BYTES,
    })
    const found = migrations.find(
      item => item.owner === 'execution-record' && item.id === '003-admission-attempt',
    )
    expect(found?.requires).toEqual([{ owner: 'execution-record', id: '001-execution-record' }])
    expect(found?.moduleUrl).toMatch(/admission-attempt-migration\.(ts|js)$/u)
    const owner = participants.find(item => item.participant === 'execution-record')
    expect(owner?.ownedTables).toContain('er_admission_attempt_idx')
    const reader = participants.find(item => item.participant === 'session')
    expect(reader?.readTables).toContain('er_admission_attempt_idx')
  })

  it('adds the table to a database that has legacy rows, and a second run changes nothing', () => {
    const { db, raw } = open()
    recordMigration.up(raw)
    db.exec(LEGACY)
    expect(admissionAttempt.verify(raw)).toMatchObject({ kind: 'failed' })
    admissionAttempt.up(raw)
    const definition = db.prepare(DEFINITION).get()
    db.exec(
      `INSERT INTO er_admission_attempt_idx (tenant, session, input, ordinal, attempt) VALUES ('t', 's', 'i', 1, 'attempt-2')`,
    )
    admissionAttempt.up(raw)
    expect(db.prepare(DEFINITION).get()).toEqual(definition)
    expect(admissionAttempt.verify(raw)).toEqual({ kind: 'verified' })
    // The row written before the migration keeps its data and has no attempt row; the one that
    // was added before the second run is still there.
    expect(db.prepare('SELECT attachment FROM er_admission_idx').all()).toEqual([
      { attachment: 'a' },
    ])
    expect(db.prepare('SELECT ordinal, attempt FROM er_admission_attempt_idx').all()).toEqual([
      { ordinal: 1, attempt: 'attempt-2' },
    ])
  })
})
