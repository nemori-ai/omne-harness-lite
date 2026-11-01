// The read port of the SQL gateway: the row ceiling stops the statement while it iterates, so the
// provider never reads everything first and counts after (SQL contract SPEC 9.4, scenario C15).
import { constants as C, DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { SqlGateway } from '../src/worker/ports.ts'

let db: DatabaseSync | null = null
afterEach(() => {
  db?.close()
  db = null
})

function seeded(rows: number): { db: DatabaseSync; probe: { calls: number } } {
  const opened = new DatabaseSync(':memory:')
  db = opened
  const probe = { calls: 0 }
  opened.function('probe', () => {
    probe.calls += 1
    return 1
  })
  opened.exec('create table t(id integer primary key)')
  opened.exec(
    `insert into t(id) with recursive n(i) as (select 1 union all select i + 1 from n where i < ${String(rows)}) select i from n`,
  )
  return { db: opened, probe }
}

const allowSelect = (action: number, arg1: string | null, arg2: string | null): boolean =>
  action === C.SQLITE_SELECT ||
  (action === C.SQLITE_READ && arg1 === 't') ||
  (action === C.SQLITE_FUNCTION && arg2 === 'probe')

describe('SqlGateway row ceiling', () => {
  it('ends the statement at the row after the ceiling, without evaluating the remaining rows', () => {
    const { db: opened, probe } = seeded(2000)
    const gateway = new SqlGateway(opened, allowSelect, { maxRows: 3 })
    expect(() => gateway.execute('select probe(), id from t limit 2000', [])).toThrow()
    expect(gateway.rowLimitHit).toBe(true)
    expect(probe.calls).toBeLessThan(20)
  })

  it('counts the rows of all statements together', () => {
    const { db: opened } = seeded(10)
    const gateway = new SqlGateway(opened, allowSelect, { maxRows: 5 })
    expect(gateway.execute('select id from t limit 3', []).rows).toHaveLength(3)
    expect(() => gateway.execute('select id from t limit 3', [])).toThrow()
    expect(gateway.rowLimitHit).toBe(true)
  })

  it('returns every row up to the ceiling', () => {
    const { db: opened } = seeded(10)
    const gateway = new SqlGateway(opened, allowSelect, { maxRows: 4 })
    expect(gateway.execute('select id from t limit 4', []).rows).toHaveLength(4)
    expect(gateway.rowLimitHit).toBe(false)
  })
})
