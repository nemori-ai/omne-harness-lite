import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { conformanceGoal, storeConformance } from '@omne-harness/goal/testing'
import migration from '../../src/storage/migration.ts'
import participant from '../../src/storage/participant.ts'
import reader from '../../src/storage/read.ts'
import { ROW_LIMIT } from '../../src/storage/schema.ts'
import { createInProcessStore, portOf } from './in-process.ts'

describe('the participant, the read handler and the migration hold what every goal store holds', () => {
  it.each(storeConformance)('$name', async conformance => {
    await expect(conformance.run(async () => createInProcessStore())).resolves.toBeUndefined()
  })
})

describe('what the storage worker is handed', () => {
  const port = () => {
    const db = new DatabaseSync(':memory:')
    migration.up(portOf(db))
    return portOf(db)
  }
  it('the migration verifies the table it made', () => {
    expect(migration.verify(port())).toEqual({ kind: 'verified' })
  })
  it('a script nobody knows fails, and so does a read nobody knows', () => {
    expect(participant.execute({ script: 'drop', command: {} }, port())).toEqual({
      kind: 'failed',
      diagnostic: 'unknown_goal_script',
    })
    expect(reader.read({ read: 'everything', args: [] }, port())).toEqual({
      kind: 'failed',
      diagnostic: 'invalid_goal_read',
    })
  })
  it('the goals that owe a reminder are read whole up to the row limit; one more fails instead of being cut', () => {
    const db = new DatabaseSync(':memory:')
    const sql = portOf(db)
    migration.up(sql)
    const record = JSON.stringify(
      conformanceGoal({ wake: { kind: 'start', request: 'start/1/1' } }),
    )
    const insert = db.prepare(
      'INSERT INTO gl_goals (session, generation, version, live, owing, record) VALUES (?, 1, 1, 1, 1, ?)',
    )
    db.exec('BEGIN')
    for (let row = 0; row < ROW_LIMIT; row += 1) insert.run(`session-${String(row)}`, record)
    db.exec('COMMIT')
    const atLimit = reader.read({ read: 'owing', args: [] }, sql)
    expect(atLimit.kind === 'read' && (atLimit.output as unknown[]).length).toBe(ROW_LIMIT)
    insert.run('one-more', record)
    expect(() => reader.read({ read: 'owing', args: [] }, sql)).toThrow(
      'more rows than one statement may return',
    )
  })

  it('a stored row that does not fit the schema fails the read instead of being handed on', () => {
    const sql = port()
    sql.execute(
      "INSERT INTO gl_goals (session, generation, version, live, owing, record) VALUES ('s', 1, 1, 1, 0, '{}')",
      [],
    )
    expect(() => reader.read({ read: 'latest', args: ['s'] }, sql)).toThrow()
  })
})
