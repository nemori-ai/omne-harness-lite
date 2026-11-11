// The sweep over real SQLite (C5): after the ledger reclaims an offloaded body, the body tables and
// the due index of the tenant hold no row for it, the entry stays as a keyed cold record, and a
// read answers `expired`.
import { decodeToolInstant } from '@omne-harness/tool-contract/provider'
import { afterEach, expect, it } from 'vitest'
import { domainNameOf, openApp, TENANT_A, type App } from './fixtures/app.ts'
import { ok, settledOffloaded } from './fixtures/settled-offloaded.ts'

const opened: App[] = []
afterEach(() => {
  for (const app of opened.splice(0)) app.close()
})

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
    removed: 0,
  })
  expect(count(app, 'tl_body_chunk')).toBeGreaterThan(0)
  live.setNow(body.retention.expiresAt)
  const at = ok(decodeToolInstant(body.retention.expiresAt))
  expect(ok(await live.ledger.sweep(TENANT_A, at, 10))).toEqual({ reclaimed: 1, removed: 0 })
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
  expect(ok(await live.ledger.sweep(TENANT_A, at, 10))).toEqual({ reclaimed: 0, removed: 0 })
})
