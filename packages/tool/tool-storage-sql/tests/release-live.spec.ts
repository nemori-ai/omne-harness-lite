// Delivery release over real SQLite (C6, Handoff model `Release`): once the one delivery that needs
// the model channels is released, the result record keeps the summary in place of the content and
// the attachments, the body entry and its expiry stay, the body still reads, and the sweep reclaims
// it at its expiry as before.
import { decodeToolInstant } from '@omne-harness/tool-contract/provider'
import { decodeToolOperationId } from '@omne-harness/tool-contract'
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

it('a released delivery leaves the summary in the record, keeps the body readable until its expiry, and the sweep reclaims it', async () => {
  const app = await openApp()
  opened.push(app)
  const live = await settledOffloaded(app)
  if (live.value.original.kind !== 'offloaded') throw new Error('body was not offloaded')
  const body = live.value.original
  // The first screen of a mechanically offloaded result is its summary: the release keeps it.
  expect(live.value.content).toEqual(body.summary)
  const state = ok(await live.ledger.commands.loadRecovery(live.access)).state
  if (state.phase !== 'settled' || state.delivery === null) throw new Error('no delivery')
  const consumer = state.delivery.consumer
  const releaseInput = {
    ...live.access,
    operation: ok(decodeToolOperationId('release-1')),
    result: live.result,
    delivery: state.delivery.delivery,
    consumer,
    evidence: {
      kind: 'retained' as const,
      custody: { owner: consumer.owner, record: 'kept', revision: '1', digest: 'sha256:kept' },
    },
  }
  const released = ok(await live.ledger.commands.releaseDelivery(releaseInput))
  expect(released.kind).toBe('released')

  const resultRecord = async () => {
    const loaded = await app.store.read({ kind: 'call', tenant: TENANT_A, call: live.access.call })
    if (loaded.kind !== 'complete') throw new Error(JSON.stringify(loaded))
    const record = loaded.records.find(record => record.kind === 'result')
    if (record?.kind !== 'result') throw new Error('no result record')
    return record.result
  }
  const after = await resultRecord()
  expect(after.delivery.kind).toBe('released')
  expect(after.value).toEqual({
    content: body.summary,
    data: live.value.data,
    original: body,
    attachments: [],
  })
  expect(
    await live.ledger.reads.result({ ...live.access, result: live.result, after: null }),
  ).toEqual({ failure: { kind: 'not-found', target: 'result', reason: 'released' } })
  // The body entry, its bytes and its due entry are untouched by the release.
  expect(count(app, 'tl_body_manifest')).toBe(1)
  expect(count(app, 'tl_due')).toBe(1)
  const readInput = {
    ...live.access,
    result: live.result,
    bodyId: body.bodyId,
    after: null,
    maxBytes: 64,
  }
  expect(ok(await live.ledger.reads.body.read(readInput))).toMatchObject({
    kind: 'text',
    text: 'x'.repeat(64),
  })
  // The same release again, under the same or another operation, writes nothing more.
  expect(ok(await live.ledger.commands.releaseDelivery(releaseInput))).toEqual(released)
  expect(
    ok(
      await live.ledger.commands.releaseDelivery({
        ...releaseInput,
        operation: ok(decodeToolOperationId('release-2')),
      }),
    ),
  ).toEqual(released)
  expect(await resultRecord()).toEqual(after)
  live.setNow(body.retention.expiresAt)
  const at = ok(decodeToolInstant(body.retention.expiresAt))
  expect(ok(await live.ledger.sweep(TENANT_A, at, 10))).toEqual({ reclaimed: 1 })
  expect(count(app, 'tl_body_chunk')).toBe(0)
  expect(await live.ledger.reads.body.read(readInput)).toEqual({
    failure: { kind: 'not-found', target: 'body', reason: 'expired' },
  })
  expect((await resultRecord()).value).toEqual(after.value)
})
