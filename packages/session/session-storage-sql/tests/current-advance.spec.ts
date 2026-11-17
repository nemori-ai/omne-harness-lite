import { expect, it } from 'vitest'
import { packText } from '@omne-harness/sql-contract/worker'
import { evidence } from '@omne-harness/session-contract/testing'
import readAdvance from '../src/worker/read-current-advance.ts'
import { decodeSessionCurrentAdvance } from '../src/current-advance.ts'
import { migratedPort } from './fixtures/sqlite-storage.ts'

function seeded(count = 0) {
  const fixture = migratedPort()
  const { port, db } = fixture
  const grant = evidence('current-grant')
  port.execute('INSERT INTO sl_journal VALUES (?, ?, ?, ?, ?)', ['t', 's', 1n, 1n, 'epoch:0'])
  port.execute('INSERT INTO sl_state VALUES (?, ?, ?, ?)', [
    't',
    's',
    JSON.stringify({ run: { $row: true } }),
    1n,
  ])
  port.execute('INSERT INTO sl_state_item VALUES (?, ?, ?, ?, ?)', [
    't',
    's',
    '=run',
    0n,
    packText(
      JSON.stringify({
        kind: 'active',
        advance: { attempt: 'current' },
        execution: { execution: 'e' },
      }),
    ),
  ])
  port.execute('INSERT INTO sl_attempt_grant VALUES (?, ?, ?, ?, ?)', [
    't',
    's',
    'current',
    1n,
    JSON.stringify(grant),
  ])
  if (count > 0)
    db.exec(`WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i < ${count})
    INSERT INTO sl_attempt_grant SELECT 't', 's', 'old-' || i, i+1, '{}' FROM n`)
  return {
    ...fixture,
    grant,
    read: (tenant = 't') =>
      readAdvance.read(
        { tenant, session: 's' },
        {
          execute: port.execute,
        },
      ),
  }
}

it.each([0, 2000, 20000])('reads three rows for the current grant with %i old attempts', count => {
  const { port, db, grant } = seeded(count)
  try {
    const observed: { sql: string; rows: number }[] = []
    const answer = readAdvance.read(
      { tenant: 't', session: 's' },
      {
        execute(sql, values) {
          const result = port.execute(sql, values)
          observed.push({ sql, rows: result.rows.length })
          return result
        },
      },
    )
    expect(answer).toEqual({
      kind: 'read',
      output: {
        kind: 'advance',
        value: {
          execution: 'e',
          attempt: 'current',
          grant,
        },
      },
    })
    expect(observed.map(item => item.rows)).toEqual([1, 1, 1])
    const plan = db.prepare(`EXPLAIN QUERY PLAN ${observed[2]!.sql}`).all('t', 's', 'current')
    expect(JSON.stringify(plan)).toContain('SEARCH sl_attempt_grant USING INDEX')
  } finally {
    db.close()
  }
})

it('distinguishes missing ownership, lagging state and missing grant', () => {
  const { port, db, read } = seeded()
  try {
    expect(read('another')).toEqual({ kind: 'read', output: { kind: 'absent' } })
    port.execute('UPDATE sl_state SET covered = 0', [])
    expect(read()).toEqual({ kind: 'read', output: { kind: 'behind' } })
    port.execute('UPDATE sl_state SET covered = 1', [])
    port.execute('DELETE FROM sl_attempt_grant', [])
    expect(() => read()).toThrow('missing original grant')
  } finally {
    db.close()
  }
})

it.each([{ kind: 'none' }, { kind: 'terminal', terminal: {} }, { kind: 'active', advance: null }])(
  'reports no advance for %j',
  run => {
    const { port, db, read } = seeded()
    try {
      port.execute('UPDATE sl_state SET snapshot = ?', [JSON.stringify({ run })])
      expect(read()).toEqual({ kind: 'read', output: { kind: 'none' } })
    } finally {
      db.close()
    }
  },
)

it('does not decode an absent or malformed grant as no advance', () => {
  for (const grant of [null, {}, { ...evidence('grant'), digest: '' }])
    expect(() =>
      decodeSessionCurrentAdvance({
        kind: 'advance',
        value: {
          execution: 'e',
          attempt: 'a',
          grant,
        },
      }),
    ).toThrow('grant')
})
