import { DatabaseSync } from 'node:sqlite'
import { expect, it } from 'vitest'
import type { MigrationPort } from '@omne-harness/sql-contract/worker'
import migration from '../src/intent-migration.ts'

function open() {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  const port: MigrationPort = {
    execute(sql, params) {
      const statement = db.prepare(sql)
      statement.setReadBigInts(true)
      const columns = statement.columns().map(column => column.name)
      const values = params.map(value => (typeof value === 'boolean' ? Number(value) : value))
      if (columns.length)
        return {
          columns,
          rows: statement.all(...values).map(row => columns.map(column => row[column] ?? null)),
          changes: 0n,
          lastInsertRowid: null,
        }
      const result = statement.run(...values)
      return {
        columns,
        rows: [],
        changes: BigInt(result.changes),
        lastInsertRowid: BigInt(result.lastInsertRowid),
      }
    },
  }
  migration.up(port)
  expect(migration.verify(port)).toEqual({ kind: 'verified' })
  function root(key: string, operationId = key, principal = 'principal', target = 'target') {
    db.prepare(`INSERT INTO st_governance_intent
      (operation_key, principal_ref, target_key, operation_id, command_digest, command_json, command_kind, intent_kind, state, next_attempt)
      VALUES (?, ?, ?, ?, ?, ?, 'change', 'target-change', 'open', 1)`).run(
      key,
      principal,
      target,
      operationId,
      'd'.repeat(64),
      '{}',
    )
  }
  function attempt(key: string, sequence: number, id: string) {
    db.prepare(`INSERT INTO st_governance_attempt
      (operation_key, attempt, attempt_id, basis_digest, basis_json, sql_identity_json, state)
      VALUES (?, ?, ?, ?, ?, ?, 'prepared')`).run(key, sequence, id, 'b'.repeat(64), '{}', '{}')
  }
  return { db, root, attempt }
}

it('keeps root identity, exact attempt identity and one live attempt as independent constraints', () => {
  const { db, root, attempt } = open()
  try {
    root('a')
    root('b')
    expect(() => root('alias', 'a')).toThrow(/UNIQUE constraint failed/)
    root('different-principal', 'a', 'other')
    root('different-target', 'a', 'principal', 'other')
    attempt('a', 1, 'first')
    expect(() => attempt('a', 2, 'second')).toThrow(/UNIQUE constraint failed/)
    expect(() => attempt('b', 1, 'first')).toThrow(/UNIQUE constraint failed/)
    db.prepare("UPDATE st_governance_attempt SET state = 'submitted' WHERE attempt_id = ?").run(
      'first',
    )
    expect(() => attempt('a', 2, 'second')).toThrow(/UNIQUE constraint failed/)
    db.prepare("UPDATE st_governance_attempt SET state = 'aborted' WHERE attempt_id = ?").run(
      'first',
    )
    attempt('a', 2, 'second')
    expect(db.prepare('SELECT state FROM st_governance_attempt ORDER BY attempt').all()).toEqual([
      { state: 'aborted' },
      { state: 'prepared' },
    ])
    expect(() => attempt('missing', 1, 'orphan')).toThrow(/FOREIGN KEY constraint failed/)
  } finally {
    db.close()
  }
})

it('rejects exhausted allocation and contradictory terminal columns while preserving explicit exhaustion', () => {
  const { db, root, attempt } = open()
  try {
    root('a')
    expect(() => attempt('a', 0, 'zero')).toThrow(/CHECK constraint failed/)
    expect(() => attempt('a', 65, 'overflow')).toThrow(/CHECK constraint failed/)
    attempt('a', 64, 'last')
    db.prepare('UPDATE st_governance_intent SET next_attempt = 65 WHERE operation_key = ?').run('a')
    expect(() => db.prepare('UPDATE st_governance_intent SET next_attempt = 66').run()).toThrow(
      /CHECK constraint failed/,
    )
    expect(() => db.prepare("UPDATE st_governance_intent SET state = 'committed'").run()).toThrow(
      /CHECK constraint failed/,
    )
    expect(() => db.prepare("UPDATE st_governance_intent SET state = 'aborted'").run()).toThrow(
      /CHECK constraint failed/,
    )
    expect(() =>
      db.prepare("UPDATE st_governance_intent SET intent_kind = 'source-update'").run(),
    ).toThrow(/CHECK constraint failed/)
    db.prepare(
      "UPDATE st_governance_intent SET state = 'aborted', abort_reason = 'cancelled'",
    ).run()
    expect(() => db.prepare("UPDATE st_governance_intent SET result_json = '{}'").run()).toThrow(
      /CHECK constraint failed/,
    )
    expect(() =>
      db.prepare("UPDATE st_governance_intent SET abort_reason = 'unknown'").run(),
    ).toThrow(/CHECK constraint failed/)
    root('b')
    db.prepare(
      "UPDATE st_governance_intent SET state = 'committed', result_json = '{}' WHERE operation_key = ?",
    ).run('b')
    expect(() =>
      db
        .prepare("UPDATE st_governance_intent SET abort_reason = 'sealed' WHERE operation_key = ?")
        .run('b'),
    ).toThrow(/CHECK constraint failed/)
  } finally {
    db.close()
  }
})

it('uses indexed point lookups and keyset pending enumeration', () => {
  const { db, root, attempt } = open()
  try {
    for (let index = 0; index < 130; index++) root(`root-${String(index).padStart(3, '0')}`)
    attempt('root-000', 1, 'exact-attempt')
    const pending =
      "SELECT operation_key FROM st_governance_intent WHERE state = 'open' AND operation_key > ? ORDER BY operation_key LIMIT 64"
    const plan = (sql: string, values: string[]) =>
      db
        .prepare('EXPLAIN QUERY PLAN ' + sql)
        .all(...values)
        .map(row => row.detail)
        .join('\n')
    expect(plan(pending, [''])).toMatch(
      /SEARCH st_governance_intent USING (?:COVERING )?INDEX st_governance_pending \(operation_key>\?\)/,
    )
    const rows = db.prepare(pending).all('')
    expect(rows).toHaveLength(64)
    expect(db.prepare(pending).all(String(rows.at(-1)?.operation_key))).toHaveLength(64)
    expect(
      plan('SELECT basis_json FROM st_governance_attempt WHERE attempt_id = ?', ['exact-attempt']),
    ).toMatch(/SEARCH .*attempt_id=\?/)
    expect(
      plan(
        "SELECT attempt_id FROM st_governance_attempt WHERE operation_key = ? AND state IN ('prepared', 'submitted')",
        ['root-000'],
      ),
    ).toContain('st_governance_one_live_attempt')
    expect(
      plan('SELECT command_json FROM st_governance_intent WHERE operation_key = ?', ['root-000']),
    ).toContain('USING PRIMARY KEY')
  } finally {
    db.close()
  }
})
