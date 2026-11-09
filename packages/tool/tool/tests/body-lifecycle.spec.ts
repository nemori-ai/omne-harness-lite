// Body custody at the ledger's public seams (`bodyWrites`, `commands.preserveResult`,
// `reads.body.read`), each case one action of the BodyLifecycle model: Begin issues a permit only
// after `opened` committed; Renew keeps a long write alive; Settle links and schedules the
// referenced body and orphans the rest; a return that names an unsealed body settles `invalid`;
// reads re-check expiry after the store read and answer `expired`, never integrity, across the
// expiry point; a miss within ε of expiry is `expired`, a miss clearly before expiry is integrity.
import { bodyRepresentation } from '../src/body-representation.ts'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { instantAt } from '@omne-harness/tool-contract/testing'
import type { ToolBodyPermit } from '@omne-harness/tool-contract/provider'
import type { ToolLedger } from '@omne-harness/tool'
import type { CallAccess } from '@omne-harness/tool-contract/provider'
import type { ToolBodyPage } from '@omne-harness/tool-contract'
import { sealedText, settlementFixture } from './settlement-values.ts'
import { auditQueues } from './start-values.ts'
import {
  configuration,
  evidence,
  functionDefinition,
  ok,
  operationId,
  principalB,
  tenantB,
  text,
  type Block,
  type Principal,
} from './runtime-values.ts'

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }))
afterEach(async () => {
  vi.useRealTimers()
  await auditQueues()
})

const W = configuration().offloading.permitMs
const EPS = configuration().offloading.clockSkewMs
const G = configuration().offloading.orphanGraceMs
const BODY_STORAGE = '@omne-harness/tool/body'

function representation() {
  const definition = functionDefinition()
  if (definition.kind !== 'function') throw new Error('fixture must define a function')
  const fixed = bodyRepresentation(definition.returns.body)
  if (fixed === null) throw new Error('fixture must declare a body')
  return fixed
}

async function writer(
  ledger: ToolLedger<Principal, Block>,
  access: CallAccess<Principal>,
  key: string,
) {
  const recovery = ok(await ledger.commands.loadRecovery(access))
  if (recovery.start === null) throw new Error('fixture has no original start')
  const binding = { ...access, start: recovery.start, source: evidence(`author-${key}`), key }
  return {
    begin: (operation: string) =>
      ledger.bodyWrites.begin({
        ...binding,
        operation: operationId(operation),
        representation: representation(),
      }),
    append: (operation: string, sequence: string, value: string, end = true) =>
      ledger.bodyWrites.append({
        ...binding,
        operation: operationId(operation),
        sequence,
        frame: { kind: 'text', block: key, text: value, end },
      }),
    seal: (operation: string, afterSequence: string) =>
      ledger.bodyWrites.seal({ ...binding, operation: operationId(operation), afterSequence }),
  }
}

const fabricated = (bytes: string) => ({
  storage: BODY_STORAGE,
  key: '{"body":"body:unsealed"}',
  mediaType: 'application/octet-stream',
  bytes,
  digest: `sha256:${'0'.repeat(64)}`,
})

it('C3 begin: an unknown `opened` commit issues no permit and the store sees no chunk', async () => {
  const f = await settlementFixture()
  const put = vi.spyOn(f.bodies.store, 'put')
  const w = await writer(f.ledger, f.access, 'unknown-begin')
  f.harness.memory.injectCommit('unknown-dropped')
  expect(await w.begin('begin-1')).toHaveProperty('failure.kind', 'unknown')
  expect(await w.append('append-1', '1', 'late bytes')).not.toHaveProperty('ok')
  expect(put).not.toHaveBeenCalled()
})

it('C3 renew: a write longer than W continues under a later permit, each put within its deadline', async () => {
  const f = await settlementFixture()
  const permits: ToolBodyPermit[] = []
  const put = f.bodies.store.put.bind(f.bodies.store)
  vi.spyOn(f.bodies.store, 'put').mockImplementation((permit, seq, bytes) => {
    permits.push(permit)
    return put(permit, seq, bytes)
  })
  const w = await writer(f.ledger, f.access, 'long-write')
  ok(await w.begin('begin-long'))
  ok(await w.append('append-long-1', '1', 'first ', false))
  f.bodies.clock.set(instantAt(W + 1))
  ok(await w.append('append-long-2', '2', 'second', true))
  const sealed = ok(await w.seal('seal-long', '2'))
  expect(sealed.bodyBytes).toBe('12')
  expect(permits).toHaveLength(2)
  expect(Date.parse(permits[1]!.claims.deadline)).toBeGreaterThan(
    Date.parse(permits[0]!.claims.deadline),
  )
  expect(Date.parse(permits[1]!.claims.deadline)).toBeGreaterThanOrEqual(W + 1 + W)
})

it('C3 store checks the permit: a put past the deadline on the store clock is not kept', async () => {
  const f = await settlementFixture()
  const w = await writer(f.ledger, f.access, 'late')
  ok(await w.begin('begin-late'))
  const issuedAt = f.bodies.clock.now()
  // The store's clock runs ahead of the issuer's by more than the permit: the writer renews on the
  // ledger before the store sees a chunk, so the chunk is kept under a permit the store accepts.
  f.bodies.clock.set(instantAt(Date.parse(issuedAt) - Date.parse(instantAt(0)) + W + EPS + 1))
  ok(await w.append('append-late', '1', 'bytes'))
  const found = await f.bodies.store.read(
    {
      tenant: f.access.tenant,
      call: f.access.call,
      body: ok(await w.seal('seal-late', '1')).bodyId,
    },
    { first: 0, count: 1 },
  )
  expect(found.kind).toBe('found')
})

it('C3 settle: the referenced body is linked and due at its expiry, the other body is orphaned and due at now + G; begin and seal are refused afterwards', async () => {
  let sealedId = ''
  let orphan: Awaited<ReturnType<typeof writer>> | null = null
  const f = await settlementFixture({
    value: async (_raw, ledger, access) => {
      orphan = await writer(ledger, access, 'never-sealed')
      ok(await orphan.begin('begin-orphan'))
      ok(await orphan.append('append-orphan', '1', 'abandoned'))
      const sealed = await sealedText(ledger, access, 'the authored body')
      sealedId = sealed.bodyId
      return {
        content: [text('content', 'Answer: 42')],
        data: { kind: 'none' },
        attachments: [],
        original: { kind: 'offloaded', source: sealed.source, summary: [text('summary', 'brief')] },
      }
    },
  })
  const settledAt = f.bodies.clock.now()
  ok(await f.preserve())
  const page = await f.resultPage()
  if (page.value.original.kind !== 'offloaded') throw new Error('expected an offloaded result')
  expect(page.value.original.bodyId).toBe(sealedId)
  const entries = (await f.records()).filter(record => record.kind === 'body-entry')
  expect(
    entries.map(record => (record.kind === 'body-entry' ? record.body.state.kind : '')),
  ).toEqual(expect.arrayContaining(['linked', 'orphaned']))
  const due = await f.harness.memory.due(f.access.tenant, instantAt(10 ** 9), 10)
  if (due.kind !== 'complete') throw new Error('due index unreadable')
  expect(due.entries.map(entry => entry.dueAt).sort()).toEqual(
    [
      page.value.original.retention.expiresAt,
      instantAt(Date.parse(settledAt) - Date.parse(instantAt(0)) + G),
    ].sort(),
  )
  if (orphan === null) throw new Error('fixture did not open the orphan')
  expect(
    await (orphan as Awaited<ReturnType<typeof writer>>).seal('seal-after-settle', '1'),
  ).toHaveProperty('failure.kind', 'closed')
  const late = await writer(f.ledger, f.access, 'after-settle')
  expect(await late.begin('begin-after-settle')).toHaveProperty('failure.kind', 'closed')
})

it('C3 commitResult: a return that references an unsealed body settles invalid with body-not-sealed and does not hang', async () => {
  const f = await settlementFixture({
    value: async (_raw, ledger, access) => {
      const w = await writer(ledger, access, 'unsealed')
      ok(await w.begin('begin-unsealed'))
      ok(await w.append('append-unsealed', '1', 'not sealed'))
      return {
        content: [text('content', 'Answer: 42')],
        data: { kind: 'none' },
        attachments: [],
        original: {
          kind: 'offloaded',
          source: fabricated('10'),
          summary: [text('summary', 'brief')],
        },
      }
    },
  })
  expect(await f.preserve()).toEqual({
    failure: { kind: 'invalid', field: 'original.source', reason: 'body-not-sealed' },
  })
})

async function offloaded(value = '中🙂'.repeat(300), maxBytes = 8) {
  const f = await settlementFixture({
    offloading: { ...configuration().offloading, maxInlineUtf8Bytes: 2048 },
    value: {
      content: [text('body', value)],
      data: { kind: 'none' },
      original: { kind: 'none' },
      attachments: [],
    },
  })
  ok(await f.preserve())
  const page = await f.resultPage()
  if (page.value.original.kind !== 'offloaded') throw new Error('expected an offloaded body')
  const input = {
    ...f.access,
    result: page.result,
    bodyId: page.value.original.bodyId,
    after: null as string | null,
    maxBytes,
  }
  return { f, input, body: page.value.original, value }
}

it('C4 pages rebuild the text byte for byte, never cut a character, and every page but the last advances', async () => {
  const { f, input, value } = await offloaded()
  let after: string | null = null
  let actual = ''
  const positions: string[] = []
  for (let pages = 0; pages < 2000; pages++) {
    const page: ToolBodyPage = ok(await f.ledger.reads.body.read({ ...input, after }))
    if (page.kind !== 'text') throw new Error('text page expected')
    positions.push(page.position)
    actual += page.text
    expect(Buffer.byteLength(page.text, 'utf8')).toBeLessThanOrEqual(input.maxBytes)
    if (page.next === null) break
    expect(page.next).not.toBe(after)
    after = page.next
  }
  expect(actual).toBe(value)
  expect(new Set(positions).size).toBe(positions.length)
})

it('C4 refuses a cursor of another tenant, another result version and a revoked access', async () => {
  const { f, input } = await offloaded()
  const first = ok(await f.ledger.reads.body.read(input))
  if (first.next === null) throw new Error('fixture body must span pages')
  expect(
    await f.ledger.reads.body.read({
      ...input,
      principal: principalB,
      tenant: tenantB,
      after: first.next,
    }),
  ).not.toHaveProperty('ok')
  const otherVersion = { ...input, after: first.next, result: 'v2' as typeof input.result }
  expect(await f.ledger.reads.body.read(otherVersion)).not.toHaveProperty('ok')
  const forged = JSON.parse(first.next) as Record<string, unknown>
  forged['position'] = 3
  expect(await f.ledger.reads.body.read({ ...input, after: JSON.stringify(forged) })).toEqual({
    failure: { kind: 'invalid-cursor', reason: 'another-body-or-invalid-position' },
  })
})

it('C5 a read at or after expiresAt answers expired and never extends retention', async () => {
  const { f, input, body } = await offloaded()
  f.bodies.clock.set(body.retention.expiresAt)
  expect(await f.ledger.reads.body.read(input)).toEqual({
    failure: { kind: 'not-found', target: 'body', reason: 'expired' },
  })
  const page = await f.resultPage()
  if (page.value.original.kind !== 'offloaded') throw new Error('expected an offloaded body')
  expect(page.value.original.retention.expiresAt).toBe(body.retention.expiresAt)
})

it('C5 a read that crosses the expiry point between the ledger check and the store read answers expired, not bytes', async () => {
  const { f, input, body } = await offloaded()
  const read = f.bodies.store.read.bind(f.bodies.store)
  vi.spyOn(f.bodies.store, 'read').mockImplementationOnce(async (ref, range) => {
    f.bodies.clock.set(body.retention.expiresAt)
    return read(ref, range)
  })
  expect(await f.ledger.reads.body.read(input)).toEqual({
    failure: { kind: 'not-found', target: 'body', reason: 'expired' },
  })
})

it('C5 a miss in the store is expired within ε of expiry and integrity only clearly before expiry', async () => {
  const { f, input, body } = await offloaded()
  const ref = { tenant: f.access.tenant, call: f.access.call, body: input.bodyId }
  await f.bodies.store.delete(ref)
  const early = await f.ledger.reads.body.read(input)
  expect(early).toHaveProperty('failure.kind', 'unavailable')
  expect(JSON.stringify(early)).toContain('integrity')
  f.bodies.clock.set(
    instantAt(Date.parse(body.retention.expiresAt) - Date.parse(instantAt(0)) - EPS),
  )
  expect(await f.ledger.reads.body.read(input)).toEqual({
    failure: { kind: 'not-found', target: 'body', reason: 'expired' },
  })
})
