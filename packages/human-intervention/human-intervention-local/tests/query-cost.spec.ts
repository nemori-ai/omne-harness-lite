// @module-tag slow
import { expect, it } from 'vitest'
import { z } from 'zod'
import type { ReadPort } from '@omne-harness/sql-contract/worker'
import pool from '../src/pool-read.ts'
import delivery from '../src/delivery-read.ts'
import { insertRequest } from '../src/request-store.ts'
import { readAudience } from '../src/read-audience.ts'
import { RequestRecordSchema } from '../src/request-schema.ts'
import { IndependentControlSchema, InboxEntrySchema } from '../src/independent-schema.ts'
import { PoolScanResultSchema } from '../src/pool-schema.ts'
import { DeliveryScanResultSchema } from '../src/delivery-schema.ts'
import { equal } from '../src/encoding.ts'
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
    const expectedPool = old
      .prepare('SELECT record FROM hi_requests ORDER BY sequence')
      .all()
      .flatMap(row => {
        const request = RequestRecordSchema.parse(parseJson(row.record))
        return request.cards
          .filter(card => card.kind === 'pending')
          .map(card => ({ card, origin: request.origin, displayContext: request.displayContext }))
      })
    const receipts = old
      .prepare('SELECT record FROM hi_wait_controls')
      .all()
      .flatMap(row => IndependentControlSchema.parse(parseJson(row.record)).receipts)
    const expectedDeliveries = old
      .prepare('SELECT record FROM hi_wait_inbox ORDER BY sequence')
      .all()
      .map(row => InboxEntrySchema.parse(parseJson(row.record)))
      .filter(entry => !receipts.some(receipt => equal(receipt.decision, entry.decision.ref)))
    expect(expectedPool.length).toBeGreaterThan(0)
    expect(expectedDeliveries.length).toBeGreaterThan(0)
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
        if (page.kind !== 'read') throw new Error('Expected pool read')
        expect(PoolScanResultSchema.parse(page.output)).toMatchObject({
          kind: 'page',
          items: expectedPool,
          next: null,
          completeness: 'complete',
        })
        expect(statements).toBeLessThanOrEqual(43)
        expect(returnedRows).toBeLessThanOrEqual(64)
        expect(plans.some(plan => /\bSCAN\b/.test(plan))).toBe(false)
        statements = 0
        returnedRows = 0
        plans = []
        const pending = delivery.read(
          {
            tenantRef: original.ref.tenantRef,
            actorRef: 'owner',
            destination: 'inbox',
            after: '0',
            limit: 20,
          },
          port,
        )
        if (pending.kind !== 'read') throw new Error('Expected delivery read')
        expect(DeliveryScanResultSchema.parse(pending.output)).toEqual({
          kind: 'page',
          items: expectedDeliveries,
          next: null,
        })
        expect(statements).toBeLessThanOrEqual(21)
        expect(returnedRows).toBeLessThanOrEqual(41)
        expect(plans.some(plan => /\bSCAN\b/.test(plan))).toBe(false)
      }
    } finally {
      db.close()
    }
  },
)
