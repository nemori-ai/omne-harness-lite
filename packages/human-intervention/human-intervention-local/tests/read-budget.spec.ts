import { expect, it } from 'vitest'
import pool from '../src/pool-read.ts'
import { READ_BYTES, pageBudget } from '../src/read-budget.ts'

it('counts JSON escaping without truncating original item text', () => {
  const budget = pageBudget()
  const original = '\u0001'.repeat(8192)
  let accepted = 0
  while (budget.accept({ text: original })) accepted++
  expect(accepted).toBeLessThan(READ_BYTES / original.length)
  expect(original).toHaveLength(8192)
})
it('returns limited when a canonical unbounded revision cannot fit the read envelope', () => {
  const revision = '9'.repeat(READ_BYTES)
  let reads = 0
  const result = pool.read(
    {
      tenantRef: 'tenant',
      actorRef: 'actor',
      position: { after: '0', offset: 0 },
      filter: { states: ['pending'] },
      limit: 20,
    },
    {
      execute() {
        reads++
        return { columns: ['revision'], rows: [[revision]], changes: 0n, lastInsertRowid: null }
      },
    },
  )
  expect(result).toMatchObject({ kind: 'read', output: { kind: 'limited', limit: READ_BYTES } })
  expect(reads).toBe(1)
})
