// @module-tag slow
// Builds synthetic unrelated relational history, then runs the actual read modules over SQLite.
import { expect, it } from 'vitest'
import { z } from 'zod'
import type { ReadPort } from '@omne-harness/sql-contract/worker'
import pool from '../src/pool-read.ts'
import delivery from '../src/delivery-read.ts'
import { insertRequest } from '../src/request-store.ts'
import { readAudience } from '../src/read-audience.ts'
import { RequestRecordSchema } from '../src/request-schema.ts'
import { parseJson } from '../src/relational-values.ts'
import { legacyCopy, database } from './legacy-fixture.ts'
import { openWorld } from './world.ts'

it(
  'bounds actual handler SQL and returned rows independently of unrelated request history',
  { timeout: 30000 },
  async () => {
    const { root } = legacyCopy(),
      old = database(root)
    const original = RequestRecordSchema.parse(
      parseJson(
        old
          .prepare("SELECT record FROM hi_requests WHERE record LIKE '%origin-active%' LIMIT 1")
          .get()?.record,
      ),
    )
    old.close()
    const world = await openWorld({ root })
    await world.close()
    const db = database(root)
    const rowsSchema = z.array(
      z.array(z.union([z.string(), z.bigint(), z.number(), z.null(), z.instanceof(Uint8Array)])),
    )
    let statements = 0,
      returnedRows = 0,
      plans: string[] = []
    const port: ReadPort = {
      execute(sql, params) {
        const bindings = params.map(value => (typeof value === 'boolean' ? Number(value) : value))
        const statement = db.prepare(sql)
        statement.setReadBigInts(true)
        statement.setReturnArrays(true)
        const columns = statement.columns().map(column => column.name)
        if (!columns.length) {
          const result = statement.run(...bindings)
          return {
            columns,
            rows: [],
            changes: BigInt(result.changes),
            lastInsertRowid: BigInt(result.lastInsertRowid),
          }
        }
        const rows = rowsSchema.parse(statement.all(...bindings))
        statements++
        returnedRows += rows.length
        plans.push(
          ...db
            .prepare('EXPLAIN QUERY PLAN ' + sql)
            .all(...bindings)
            .map(row => String(row.detail)),
        )
        return { columns, rows, changes: 0n, lastInsertRowid: null }
      },
    }
    try {
      let history = 0
      for (const size of [100, 1000, 10000]) {
        db.exec('BEGIN')
        for (; history < size; history++) {
          const ref = { tenantRef: original.ref.tenantRef, requestId: `noise-${history}` }
          const record = RequestRecordSchema.parse({
            ...original,
            ref,
            cards: original.cards.map(card => ({
              ...card,
              ref: { request: ref, cardId: card.ref.cardId },
            })),
          })
          insertRequest(
            port,
            record,
            readAudience({
              tenantRef: ref.tenantRef,
              waitRef: original.origin.wait,
              preparationRef: 'probe',
              registrationDigest: 'a'.repeat(64),
              readers: ['other-actor'],
            }),
          )
        }
        db.exec('COMMIT')
        statements = 0
        returnedRows = 0
        plans = []
        const page = pool.read(
          {
            tenantRef: original.ref.tenantRef,
            actorRef: 'owner',
            position: { after: '0', offset: 0 },
            filter: { states: ['pending'] },
            limit: 20,
          },
          port,
        )
        expect(page.kind).toBe('read')
        expect(statements).toBeLessThanOrEqual(43)
        expect(returnedRows).toBeLessThanOrEqual(64)
        expect(plans.some(plan => /\bSCAN\b/.test(plan))).toBe(false)
        statements = 0
        returnedRows = 0
        plans = []
        expect(
          delivery.read(
            {
              tenantRef: original.ref.tenantRef,
              actorRef: 'owner',
              destination: 'inbox',
              after: '0',
              limit: 20,
            },
            port,
          ).kind,
        ).toBe('read')
        expect(statements).toBeLessThanOrEqual(21)
        expect(returnedRows).toBeLessThanOrEqual(41)
        expect(plans.some(plan => /\bSCAN\b/.test(plan))).toBe(false)
      }
    } finally {
      db.close()
    }
  },
)
