// The sweep over real SQLite (C5): after the ledger reclaims an offloaded body, the body tables and
// the due index of the tenant hold no row for it, the entry stays as a keyed cold record, and a
// read answers `expired`.
import { randomBytes } from 'node:crypto'
import { judgeContentBlock } from '@omne-harness/content-block'
import { decodeToolOperationId } from '@omne-harness/tool-contract'
import {
  decodeToolInstanceId,
  decodeToolInstant,
  type FactBatch,
} from '@omne-harness/tool-contract/provider'
import { afterEach, expect, it } from 'vitest'
import { createSqlToolBodyStore } from '../src/index.ts'
import { domainNameOf, openApp, TENANT_A, type App } from './fixtures/app.ts'
import { ledgerWorld } from './fixtures/ledger.ts'

function ok<T>(value: { ok: T } | { failure: unknown }): T {
  if ('failure' in value) throw new Error(JSON.stringify(value.failure))
  return value.ok
}

const opened: App[] = []
afterEach(() => {
  for (const app of opened.splice(0)) app.close()
})

const evidence = { owner: 'sweep-live', record: 'source', revision: '1', digest: 'sha256:source' }

/** A settled call whose final planned a 70 KiB text body, over the SQL ledger and body store. */
export async function settledOffloaded(app: App, text = 'x'.repeat(70 * 1024)) {
  const world = await ledgerWorld(TENANT_A)
  let now = '2026-11-10T00:00:00.000Z'
  const permitKey = { secret: randomBytes(32) }
  const clock = { now: () => ok(decodeToolInstant(now)) }
  const ledger = world.ledgerOver(app.store, {
    bodies: {
      store: createSqlToolBodyStore({ ...app.options, permitKey, clock }),
      permitKey,
      clock,
    },
  })
  const access = world.access
  const context = async (name: string) => ({
    ...access,
    operation: ok(decodeToolOperationId(name)),
    instance: ok(decodeToolInstanceId('sweep-live')),
    generation: '1',
    expected: ok(await ledger.commands.loadRecovery(access)).state.revision,
  })
  ok(await ledger.admissions.admit(world.input))
  const preparation = ok(
    await ledger.commands.planPreparation({
      ...(await context('prepare')),
      request: world.input.request,
      purpose: 'initial',
      environmentAdoption: {
        owner: 'fixture',
        name: 'environment',
        revision: '1',
        digest: 'sha256:env',
      },
    }),
  )
  ok(
    await ledger.commands.prepared({
      ...(await context('prepared')),
      preparation,
      resources: evidence,
    }),
  )
  ok(await ledger.commands.enqueue(await context('enqueue')))
  const start = ok(await ledger.commands.prepareStart(await context('start'))).start
  ok(
    await ledger.commands.recordStart({
      ...(await context('started')),
      invocation: start,
      outcome: { kind: 'started', acceptance: evidence },
    }),
  )
  const judged = judgeContentBlock({
    kind: 'text',
    id: 'answer',
    visibility: { toHuman: true, toModel: true },
    text,
  })
  if (!('ok' in judged)) throw new Error(JSON.stringify(judged.rejected))
  const planned = ok(
    await ledger.finalPlanner.planFinal({
      ...access,
      start,
      source: evidence,
      operation: ok(decodeToolOperationId('final')),
      final: {
        kind: 'final',
        result: {
          content: [judged.ok],
          data: { kind: 'none' },
          original: { kind: 'none' },
          attachments: [],
        },
        terminal: { kind: 'completed' },
        effect: { kind: 'occurred', evidence },
      },
    }),
  )
  const batch: FactBatch = {
    start,
    source: evidence,
    batch: 'final',
    after: null,
    cursor: 'final/end',
    events: [{ event: 'final', fact: planned }],
  }
  ok(await ledger.commands.receiveFacts({ ...access, start, batch }))
  const task = ok(await ledger.commands.loadRecovery(access)).tasks.find(
    task => task.kind === 'settle',
  )
  if (task?.kind !== 'settle') throw new Error('missing settlement task')
  ok(await ledger.commands.preserveResult({ ...(await context('settle')), basis: task.basis }))
  const state = ok(await ledger.commands.loadRecovery(access)).state
  if (state.phase !== 'settled') throw new Error('result did not settle')
  const value = ok(await ledger.delivery.read({ ...access, result: state.result }))
  return {
    ledger,
    access,
    planned,
    result: state.result,
    value,
    setNow: (value: string) => {
      now = value
    },
  }
}

function count(app: App, table: string): number {
  const rows = app.sqlite.inspect(domainNameOf(TENANT_A), `SELECT COUNT(*) AS n FROM ${table}`)
  return Number(rows[0]?.['n'])
}

it('a reclaimed body leaves no row in the body tables or the due index; its entry stays reclaimed and a read answers expired', async () => {
  const app = await openApp()
  opened.push(app)
  const live = await settledOffloaded(app)
  if (live.value.original.kind !== 'offloaded') throw new Error('body was not offloaded')
  const body = live.value.original
  const readInput = {
    ...live.access,
    result: live.result,
    bodyId: body.bodyId,
    after: null,
    maxBytes: 64,
  }
  expect(count(app, 'tl_body_chunk')).toBeGreaterThan(0)
  expect(count(app, 'tl_body_manifest')).toBe(1)
  expect(count(app, 'tl_due')).toBe(1)
  const beforeExpiry = new Date(Date.parse(body.retention.expiresAt) - 1).toISOString()
  expect(ok(await live.ledger.sweep(TENANT_A, ok(decodeToolInstant(beforeExpiry)), 10))).toEqual({
    reclaimed: 0,
  })
  expect(count(app, 'tl_body_chunk')).toBeGreaterThan(0)
  live.setNow(body.retention.expiresAt)
  const at = ok(decodeToolInstant(body.retention.expiresAt))
  expect(ok(await live.ledger.sweep(TENANT_A, at, 10))).toEqual({ reclaimed: 1 })
  expect(count(app, 'tl_body_chunk')).toBe(0)
  expect(count(app, 'tl_body_manifest')).toBe(0)
  expect(count(app, 'tl_due')).toBe(0)
  const loaded = await app.store.read({ kind: 'call', tenant: TENANT_A, call: live.access.call })
  if (loaded.kind !== 'complete') throw new Error(JSON.stringify(loaded))
  const entry = loaded.records.find(
    record => record.kind === 'body-entry' && record.body.bodyId === body.bodyId,
  )
  expect(entry).toMatchObject({ body: { state: { kind: 'reclaimed' } } })
  expect(await live.ledger.reads.body.read(readInput)).toEqual({
    failure: { kind: 'not-found', target: 'body', reason: 'expired' },
  })
  expect(ok(await live.ledger.sweep(TENANT_A, at, 10))).toEqual({ reclaimed: 0 })
})
