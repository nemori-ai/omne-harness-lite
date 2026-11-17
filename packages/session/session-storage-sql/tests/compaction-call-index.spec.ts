import { expect, it } from 'vitest'
import { openCompactionCalls } from '../src/worker/compaction-calls.ts'
import { migratedPort } from './fixtures/sqlite-storage.ts'

it.each([0, 2000, 20000])(
  'reads only current protection with %i completed call identities',
  count => {
    const { port, db } = migratedPort()
    try {
      if (count > 0)
        db.exec(`WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i < ${count})
      INSERT INTO sl_compaction_call SELECT 't', 's', 'old-' || i, 'entry-' || i, NULL, 1, 1, 0, 0 FROM n`)
      port.execute('INSERT INTO sl_compaction_call VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [
        't',
        's',
        'current',
        'origin',
        'association',
        1n,
        2n,
        1n,
        1n,
      ])
      const observed: { sql: string; rows: number }[] = []
      const read = {
        execute: (sql: string, params: Parameters<typeof port.execute>[1]) => {
          const result = port.execute(sql, params)
          observed.push({ sql, rows: result.rows.length })
          return result
        },
      }
      expect(openCompactionCalls(read, { tenant: 't', session: 's' })).toEqual([
        'origin',
        'association',
      ])
      expect(observed.map(item => item.rows)).toEqual([1])
      const statement = observed[0]?.sql
      if (statement === undefined) throw new Error('missing query')
      const plan = db.prepare(`EXPLAIN QUERY PLAN ${statement}`).all('t', 's')
      expect(JSON.stringify(plan)).toContain('USING INDEX sl_compaction_open_call_idx')
    } finally {
      db.close()
    }
  },
)
