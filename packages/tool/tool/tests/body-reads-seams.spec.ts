// Read-back of an offloaded body at the ledger's public seam (`reads.body.read`): the input the
// reader accepts, the cursors it refuses, what a store that contradicts the ledger entry gets, and
// the page that is too small for one character or one record.
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { TOOL_REFERENCE_MAX_LENGTH } from '@omne-harness/tool-contract/provider'
import { settlementFixture } from './settlement-values.ts'
import { jsonLinesFixture } from './structured-body-values.ts'
import { auditQueues } from './start-values.ts'
import { configuration, ok, text } from './runtime-values.ts'

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }))
afterEach(async () => {
  vi.useRealTimers()
  await auditQueues()
})

async function offloaded(value = '中🙂'.repeat(300), maxBytes = 64) {
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

it.each([
  { name: 'a body id that is not one', patch: { bodyId: '' }, field: 'bodyId' },
  { name: 'an empty cursor', patch: { after: '' }, field: 'after' },
  {
    name: 'a cursor over the reference length',
    patch: { after: 'x'.repeat(TOOL_REFERENCE_MAX_LENGTH + 1) },
    field: 'after',
  },
  { name: 'a zero byte budget', patch: { maxBytes: 0 }, field: 'maxBytes' },
  { name: 'a fractional byte budget', patch: { maxBytes: 1.5 }, field: 'maxBytes' },
])('refuses $name before any check of the body', async ({ patch, field }) => {
  const { f, input } = await offloaded()
  const load = vi.spyOn(f.bodies.store, 'read')
  expect(await f.ledger.reads.body.read({ ...input, ...patch } as never)).toMatchObject({
    failure: { kind: 'invalid', field },
  })
  expect(load).not.toHaveBeenCalled()
})

it('refuses text that is not a body cursor, and a cursor of another version or position', async () => {
  const { f, input, body } = await offloaded()
  for (const after of ['not json', '{"version":2}', '[]'])
    expect(await f.ledger.reads.body.read({ ...input, after })).toEqual({
      failure: { kind: 'invalid-cursor', reason: 'not-a-body-cursor' },
    })
  const first = ok(await f.ledger.reads.body.read(input))
  if (first.next === null) throw new Error('fixture body must span pages')
  const cursor = JSON.parse(first.next) as Record<string, unknown>
  for (const forged of [
    { ...cursor, version: 1 },
    { ...cursor, position: Number(body.bodyBytes) },
    { ...cursor, seq: '0' },
    { ...cursor, scope: 'another' },
  ])
    expect(await f.ledger.reads.body.read({ ...input, after: JSON.stringify(forged) })).toEqual({
      failure: { kind: 'invalid-cursor', reason: 'another-body-or-invalid-position' },
    })
})

it('answers not-found for a body the result version does not hold', async () => {
  const { f, input } = await offloaded()
  const unknown = `body:${'0'.repeat(64)}` as typeof input.bodyId
  expect(await f.ledger.reads.body.read({ ...input, bodyId: unknown })).toEqual({
    failure: { kind: 'not-found', target: 'body', reason: 'missing' },
  })
})

it('reports a store that skips a chunk or contradicts the sealed manifest as unavailable, not as bytes', async () => {
  const { f, input } = await offloaded()
  const read = f.bodies.store.read.bind(f.bodies.store)
  vi.spyOn(f.bodies.store, 'read').mockImplementationOnce(async (ref, range) => {
    const answer = await read(ref, range)
    return answer.kind === 'found' ? { ...answer, chunks: answer.chunks.slice(1) } : answer
  })
  expect(await f.ledger.reads.body.read(input)).toEqual({
    failure: {
      kind: 'unavailable',
      dependency: 'body-reader',
      diagnostic: 'sealed body is missing a chunk',
    },
  })
  vi.spyOn(f.bodies.store, 'read').mockImplementationOnce(async (ref, range) => {
    const answer = await read(ref, range)
    return answer.kind === 'found'
      ? { ...answer, manifest: { ...answer.manifest, digest: 'sha256:other' } }
      : answer
  })
  expect(await f.ledger.reads.body.read(input)).toEqual({
    failure: {
      kind: 'unavailable',
      dependency: 'body-reader',
      diagnostic: 'integrity: the stored manifest differs from the ledger entry',
    },
  })
  expect(ok(await f.ledger.reads.body.read(input)).kind).toBe('text')
})

it('refuses a byte budget below the first character instead of cutting it', async () => {
  const { f, input } = await offloaded('🙂'.repeat(600), 3)
  expect(await f.ledger.reads.body.read(input)).toEqual({
    failure: { kind: 'invalid', field: 'maxBytes', reason: 'first-character-does-not-fit' },
  })
  const page = ok(await f.ledger.reads.body.read({ ...input, maxBytes: 4 }))
  if (page.kind !== 'text') throw new Error('text page expected')
  expect(page.text).toBe('🙂')
  expect(page.position).toBe('0')
})

it('refuses a byte budget below the first record and names the record position', async () => {
  const lines = ['{"a":1}', '{"b":22}']
  const f = await settlementFixture(jsonLinesFixture(lines))
  ok(await f.preserve())
  const result = await f.resultPage()
  if (result.value.original.kind !== 'offloaded') throw new Error('body required')
  const input = {
    ...f.access,
    result: result.result,
    bodyId: result.value.original.bodyId,
    after: null as string | null,
    maxBytes: 8,
  }
  const first = ok(await f.ledger.reads.body.read(input))
  if (first.kind !== 'json-lines' || first.next === null) throw new Error('record page required')
  expect(first.records).toHaveLength(1)
  expect(await f.ledger.reads.body.read({ ...input, after: first.next })).toEqual({
    failure: { kind: 'invalid', field: 'maxBytes', reason: 'first-record-does-not-fit:8' },
  })
})

it('rebuilds a body stored in many small chunks byte for byte, across chunk and store-read boundaries', async () => {
  const value = '中🙂a'.repeat(300)
  const f = await settlementFixture({
    offloading: { ...configuration().offloading, maxInlineUtf8Bytes: 2048, maxPageBytes: 7 },
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
    maxBytes: 1000,
  }
  const reads = vi.spyOn(f.bodies.store, 'read')
  let actual = ''
  let after: string | null = null
  for (let pages = 0; pages < 5000; pages++) {
    const reply = await f.ledger.reads.body.read({ ...input, after })
    const next = ok(reply)
    if (next.kind !== 'text') throw new Error('text page expected')
    expect(Buffer.byteLength(next.text)).toBeLessThanOrEqual(7)
    actual += next.text
    if (next.next === null) break
    after = next.next
  }
  expect(actual).toBe(value)
  expect(reads).toHaveBeenCalled()
})

it('reports a store that answers unavailable, or returns chunks out of sequence', async () => {
  const { f, input } = await offloaded()
  vi.spyOn(f.bodies.store, 'read').mockResolvedValueOnce({
    kind: 'unavailable',
    diagnostic: 'disk',
  })
  expect(await f.ledger.reads.body.read(input)).toEqual({
    failure: { kind: 'unavailable', dependency: 'body-reader', diagnostic: 'disk' },
  })
  const read = f.bodies.store.read.bind(f.bodies.store)
  vi.spyOn(f.bodies.store, 'read').mockImplementationOnce(async (ref, range) => {
    const answer = await read(ref, range)
    return answer.kind === 'found'
      ? { ...answer, chunks: answer.chunks.map(chunk => ({ ...chunk, seq: chunk.seq + 1 })) }
      : answer
  })
  expect(await f.ledger.reads.body.read(input)).toEqual({
    failure: {
      kind: 'unavailable',
      dependency: 'body-reader',
      diagnostic: 'sealed body is missing a chunk',
    },
  })
  vi.spyOn(f.bodies.store, 'read').mockImplementationOnce(async (ref, range) => {
    const answer = await read(ref, range)
    return answer.kind === 'found'
      ? { ...answer, manifest: { ...answer.manifest, bytes: answer.manifest.bytes + 1 } }
      : answer
  })
  expect(await f.ledger.reads.body.read(input)).toMatchObject({
    failure: { kind: 'unavailable', diagnostic: expect.stringContaining('integrity') },
  })
})

it('re-checks the reader before and after the store read', async () => {
  let reads = 0
  let denyFrom = Number.POSITIVE_INFINITY
  const { f, input } = await (async () => {
    const built = await offloaded()
    return built
  })()
  f.rebuild({ ...configuration().offloading, maxInlineUtf8Bytes: 2048 }, undefined, undefined)
  const wrapped = await settlementFixture({
    offloading: { ...configuration().offloading, maxInlineUtf8Bytes: 2048 },
    wrapAccess: base => ({
      qualify: async request => {
        if (request.action === 'read-content' && ++reads >= denyFrom)
          return { kind: 'denied', reason: 'revoked' }
        return base.qualify(request)
      },
    }),
    value: {
      content: [text('body', '中🙂'.repeat(300))],
      data: { kind: 'none' },
      original: { kind: 'none' },
      attachments: [],
    },
  })
  ok(await wrapped.preserve())
  const page = await wrapped.resultPage()
  if (page.value.original.kind !== 'offloaded') throw new Error('expected an offloaded body')
  const read = {
    ...wrapped.access,
    result: page.result,
    bodyId: page.value.original.bodyId,
    after: null,
    maxBytes: 64,
  }
  ok(await wrapped.ledger.reads.body.read(read))
  for (const at of [1, 2]) {
    reads = 0
    denyFrom = at
    expect(await wrapped.ledger.reads.body.read(read)).toMatchObject({
      failure: { kind: 'denied', action: 'read-content' },
    })
  }
  void input
})
