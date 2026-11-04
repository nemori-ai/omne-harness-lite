// SPEC IS-10: the participant and the governance read compare instants in SQL through an order key.
// The key's text order must be the order of utc-instant `compareInstants`, in JavaScript and in SQL
// alike: otherwise a login could count as valid after its deadline, or an invitation as open after
// its expiry. Encoded instants keep their fraction digits, so `0.5` and `0.500` must give one key.
import { DatabaseSync } from 'node:sqlite'
import { expect, it } from 'vitest'
import { compareInstants, encodeInstant } from '@omne-harness/utc-instant'
import { instantOrderKey } from '../dist/worker/schema.js'
import { orderKeySql } from '../dist/worker/support.js'
import { instant } from './fixtures/provider.ts'

const TEXTS = [
  '2026-10-25T12:00:00Z',
  '2026-10-25T12:00:00.0Z',
  '2026-10-25T12:00:00.000Z',
  '2026-10-25T12:00:00.05Z',
  '2026-10-25T12:00:00.5Z',
  '2026-10-25T12:00:00.500Z',
  '2026-10-25T12:00:00.49999Z',
  '2026-10-25T12:00:00.625Z',
  '2026-10-25T12:00:01Z',
  '2026-10-25T12:00:09.9Z',
  '2026-10-25T12:00:10Z',
  '2016-12-31T23:59:59.999Z',
  '2016-12-31T23:59:60Z',
  '2016-12-31T23:59:60.5Z',
  '2017-01-01T00:00:00Z',
  '0001-01-01T00:00:00Z',
  '9999-12-31T23:59:59.999999999Z',
]

function sign(value: number): number {
  return value < 0 ? -1 : value > 0 ? 1 : 0
}

it('orders keys as compareInstants orders the instants', () => {
  for (const left of TEXTS)
    for (const right of TEXTS) {
      const a = instantOrderKey(left)
      const b = instantOrderKey(right)
      const keyOrder = a < b ? -1 : a > b ? 1 : 0
      expect([left, right, keyOrder]).toEqual([
        left,
        right,
        compareInstants(instant(left), instant(right)),
      ])
    }
})

it('computes the same key in SQL as in JavaScript', () => {
  const db = new DatabaseSync(':memory:')
  try {
    db.exec('CREATE TABLE t (value TEXT NOT NULL) STRICT')
    const insert = db.prepare('INSERT INTO t (value) VALUES (?)')
    for (const text of TEXTS) insert.run(encodeInstant(instant(text)))
    const rows = db.prepare(`SELECT value, ${orderKeySql('value')} AS key FROM t`).all()
    expect(rows).toHaveLength(TEXTS.length)
    for (const row of rows) expect(row['key']).toBe(instantOrderKey(String(row['value'])))
    // SQL compares the keys in the same order.
    const pairs = db
      .prepare(
        `SELECT a.value AS a, b.value AS b,
           (${orderKeySql('a.value')} > ${orderKeySql('b.value')}) - (${orderKeySql('a.value')} < ${orderKeySql('b.value')}) AS cmp
         FROM t a, t b`,
      )
      .all()
    for (const pair of pairs)
      expect(sign(Number(pair['cmp']))).toBe(
        compareInstants(instant(String(pair['a'])), instant(String(pair['b']))),
      )
  } finally {
    db.close()
  }
})
