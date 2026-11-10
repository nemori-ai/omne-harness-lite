// The author's body writer at the ledger's public seam (`ledger.bodyWrites`): what `inspect`
// reports in each body state; how the writer binds its input; how each store answer to a put or a
// seal reaches the author; the sequence, block and size rules of `append`; the record rules of a
// JSON Lines writer.
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { fail, succeed } from '@omne-harness/operation-result'
import type { ToolBodyWriteInput } from '@omne-harness/tool-contract/provider'
import { settlementFixture } from './settlement-values.ts'
import { jsonLinesFixture } from './structured-body-values.ts'
import { auditQueues } from './start-values.ts'
import {
  configuration,
  evidence,
  functionDefinition,
  ok,
  operationId,
  text,
  type Principal,
} from './runtime-values.ts'

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }))
afterEach(async () => {
  vi.useRealTimers()
  await auditQueues()
})

type Fixture = Awaited<ReturnType<typeof settlementFixture>>

/** The author's binding of one writer key, as the executor passes it with every call. */
async function binding(
  f: Fixture,
  key: string,
): Promise<ToolBodyWriteInput<Principal> & { key: string }> {
  const start = (await f.load()).start
  if (start === null) throw new Error('fixture has no original start')
  return { ...f.access, start, source: evidence(`author-${key}`), key, operation: operationId('x') }
}

const textRepresentation = () => {
  const definition = functionDefinition()
  if (definition.kind !== 'function') throw new Error('fixture must define a function')
  const body = definition.returns.body
  if (body.kind !== 'text') throw new Error('fixture must return a text body')
  return { kind: 'text' as const, codec: body.codec }
}

async function openWriter(f: Fixture, key: string) {
  const bound = await binding(f, key)
  let step = 0
  const op = () => operationId(`${key}-${(step += 1)}`)
  return {
    bound,
    begin: () =>
      f.ledger.bodyWrites.begin({
        ...bound,
        operation: op(),
        representation: textRepresentation(),
      }),
    append: (sequence: string, value: string, end = true, block = key) =>
      f.ledger.bodyWrites.append({
        ...bound,
        operation: op(),
        sequence,
        frame: { kind: 'text', block, text: value, end },
      }),
    seal: (afterSequence: string) =>
      f.ledger.bodyWrites.seal({ ...bound, operation: op(), afterSequence }),
    inspect: () => f.ledger.bodyWrites.inspect(bound),
  }
}

it('inspect reports a writer through open, sealed and orphaned', async () => {
  const f = await settlementFixture()
  const w = await openWriter(f, 'inspected')
  expect(await w.inspect()).toEqual({
    failure: { kind: 'invalid', reason: 'writer does not exist' },
  })
  ok(await w.begin())
  ok(await w.append('1', 'hello', false))
  expect(ok(await w.inspect())).toEqual({
    kind: 'open',
    nextSequence: '2',
    confirmedThrough: '1',
  })
  ok(await w.append('2', ' world'))
  const sealed = ok(await w.seal('2'))
  expect(ok(await w.inspect())).toEqual({ kind: 'sealed', body: sealed })
  expect(sealed.bodyBytes).toBe('11')
  ok(await f.preserve())
  expect(ok(await w.inspect())).toEqual({
    kind: 'failed',
    failure: { kind: 'closed', reason: 'body is orphaned' },
  })
})

it('binds only a nonempty key, the original start and a declaration with a body', async () => {
  const f = await settlementFixture()
  const w = await openWriter(f, '')
  expect(await w.begin()).toEqual({
    failure: { kind: 'invalid', reason: 'nonempty writer key required' },
  })
  const other = await openWriter(f, 'other-start')
  expect(
    await f.ledger.bodyWrites.begin({
      ...other.bound,
      start: { ...other.bound.start, operation: operationId('another-start') },
      representation: textRepresentation(),
    }),
  ).toEqual({ failure: { kind: 'invalid', reason: 'original start required' } })
  expect(
    await f.ledger.bodyWrites.begin({
      ...other.bound,
      call: '' as never,
      representation: textRepresentation(),
    }),
  ).toMatchObject({ failure: { kind: 'closed', reason: expect.stringMatching(/^call: /u) } })
})

it('refuses a writer under a declaration without a body', async () => {
  const definition = functionDefinition()
  if (definition.kind !== 'function') throw new Error('fixture must define a function')
  const f = await settlementFixture({
    definition: { ...definition, returns: { ...definition.returns, body: { kind: 'none' } } },
  })
  const w = await openWriter(f, 'bodiless')
  expect(await w.begin()).toEqual({
    failure: { kind: 'unsupported', reason: 'body writer requires a body declaration' },
  })
})

it('passes a write denial through as denied', async () => {
  const f = await settlementFixture({
    wrapAccess: base => ({
      qualify: async input =>
        input.action === 'write' ? { kind: 'denied', reason: 'no-write' } : base.qualify(input),
    }),
  })
  const w = await openWriter(f, 'denied')
  expect(await w.begin()).toMatchObject({ failure: { kind: 'denied', action: 'write' } })
})

it.each([
  {
    answer: { kind: 'conflict' as const },
    failure: { kind: 'conflict', reason: 'operation conflicts with a recorded input' },
  },
  {
    answer: { kind: 'permit-invalid' as const },
    failure: { kind: 'closed', reason: 'start: permit-invalid' },
  },
  {
    answer: { kind: 'unavailable' as const, diagnostic: 'disk' },
    failure: { kind: 'unavailable', operation: 'put-answer-2', reason: 'body-store: disk' },
  },
])(
  'maps the store answer $answer.kind to a put into the author failure',
  async ({ answer, failure }) => {
    const f = await settlementFixture()
    const w = await openWriter(f, 'put-answer')
    ok(await w.begin())
    vi.spyOn(f.bodies.store, 'put').mockResolvedValueOnce(answer)
    expect(await w.append('1', 'bytes')).toEqual({ failure })
    expect(ok(await w.inspect())).toMatchObject({ kind: 'open', confirmedThrough: '0' })
  },
)

it('renews the permit once when the store reports it expired on a put, then keeps the chunk', async () => {
  const f = await settlementFixture()
  const w = await openWriter(f, 'put-renew')
  ok(await w.begin())
  const put = f.bodies.store.put.bind(f.bodies.store)
  const permits: string[] = []
  vi.spyOn(f.bodies.store, 'put')
    .mockResolvedValueOnce({ kind: 'permit-expired' })
    .mockImplementation((permit, seq, bytes) => {
      permits.push(permit.claims.deadline)
      return put(permit, seq, bytes)
    })
  expect(ok(await w.append('1', 'bytes'))).toMatchObject({ nextSequence: '2' })
  expect(permits).toHaveLength(1)
  expect(ok(await w.seal('1')).bodyBytes).toBe('5')
})

it.each([
  {
    answer: { kind: 'not-ready' as const, diagnostic: 'chunk 0 missing' },
    failure: {
      kind: 'unavailable',
      operation: 'seal-answer-3',
      reason: 'body-store: chunk 0 missing',
    },
  },
  {
    answer: { kind: 'conflict' as const },
    failure: { kind: 'conflict', reason: 'operation conflicts with a recorded input' },
  },
  {
    answer: { kind: 'permit-invalid' as const },
    failure: { kind: 'closed', reason: 'start: permit-invalid' },
  },
  {
    answer: { kind: 'unavailable' as const, diagnostic: 'disk' },
    failure: { kind: 'unavailable', operation: 'seal-answer-3', reason: 'body-store: disk' },
  },
])(
  'maps the store answer $answer.kind to a seal into the author failure and keeps the body open',
  async ({ answer, failure }) => {
    const f = await settlementFixture()
    const w = await openWriter(f, 'seal-answer')
    ok(await w.begin())
    ok(await w.append('1', 'bytes'))
    vi.spyOn(f.bodies.store, 'seal').mockResolvedValueOnce(answer)
    expect(await w.seal('1')).toEqual({ failure })
    expect(ok(await w.inspect())).toMatchObject({ kind: 'open', confirmedThrough: '1' })
    expect(ok(await w.seal('1')).bodyBytes).toBe('5')
  },
)

it('renews the permit once when the store reports it expired on the seal', async () => {
  const f = await settlementFixture()
  const w = await openWriter(f, 'seal-renew')
  ok(await w.begin())
  ok(await w.append('1', 'bytes'))
  const seal = f.bodies.store.seal.bind(f.bodies.store)
  const spy = vi
    .spyOn(f.bodies.store, 'seal')
    .mockResolvedValueOnce({ kind: 'permit-expired' })
    .mockImplementation(seal)
  expect(ok(await w.seal('1')).bodyBytes).toBe('5')
  expect(spy).toHaveBeenCalledTimes(2)
})

it('append admits only the next positive canonical sequence', async () => {
  const f = await settlementFixture()
  const w = await openWriter(f, 'sequence')
  ok(await w.begin())
  for (const sequence of ['0', '01', 'x'])
    expect(await w.append(sequence, 'bytes')).toEqual({
      failure: { kind: 'invalid', reason: 'positive canonical sequence required' },
    })
  expect(await w.append('2', 'bytes')).toEqual({
    failure: { kind: 'conflict', reason: 'sequence must be the next admitted sequence' },
  })
  expect(ok(await w.append('1', 'bytes'))).toMatchObject({ nextSequence: '2' })
})

it('append refuses a frame of another representation and a frame into a closed block', async () => {
  const f = await settlementFixture()
  const w = await openWriter(f, 'frames')
  ok(await w.begin())
  expect(
    await f.ledger.bodyWrites.append({
      ...w.bound,
      operation: operationId('frames-json'),
      sequence: '1',
      frame: { kind: 'json-record', value: { kind: 'null' } },
    }),
  ).toEqual({
    failure: { kind: 'invalid', reason: 'frame must match the fixed body representation' },
  })
  ok(await w.append('1', 'closed', true, 'block-a'))
  expect(await w.append('2', 'more', true, 'block-a')).toEqual({
    failure: { kind: 'closed', reason: 'text block is already closed' },
  })
  ok(await w.append('2', 'open', false, 'block-b'))
  expect(await w.seal('2')).toEqual({
    failure: { kind: 'invalid', reason: 'text blocks must be closed before seal' },
  })
})

it('append refuses bytes over the body hard limit before the store sees them', async () => {
  const f = await settlementFixture({
    offloading: { ...configuration().offloading, maxBodyBytes: 8 },
  })
  const w = await openWriter(f, 'hard-limit')
  ok(await w.begin())
  const put = vi.spyOn(f.bodies.store, 'put')
  ok(await w.append('1', 'abcd', false))
  expect(await w.append('2', 'efghi')).toEqual({
    failure: { kind: 'too-large', reason: 'body size exceeded' },
  })
  expect(put).toHaveBeenCalledTimes(1)
})

it('seal admits only the canonical count of every admitted sequence', async () => {
  const f = await settlementFixture()
  const w = await openWriter(f, 'seal-count')
  ok(await w.begin())
  ok(await w.append('1', 'bytes'))
  expect(await w.seal('x')).toEqual({
    failure: { kind: 'invalid', reason: 'canonical last sequence required' },
  })
  expect(await w.seal('0')).toEqual({
    failure: { kind: 'conflict', reason: 'seal must include all admitted sequences' },
  })
  const sealed = ok(await w.seal('1'))
  expect(ok(await w.seal('1'))).toEqual(sealed)
})

async function jsonLinesWriter(
  schemas: { check: (...args: unknown[]) => Promise<unknown> } = {
    check: async () => succeed(undefined),
  },
) {
  const lines = jsonLinesFixture([])
  const f = await settlementFixture({
    definition: lines.definition,
    bodySchemas: schemas as never,
    value: {
      content: [text('answer', 'done')],
      data: { kind: 'none' },
      original: { kind: 'none' },
      attachments: [],
    },
  })
  // The harness ledger holds the schema port the fixture was given.
  const writes = f.harness.ledger.bodyWrites
  const bound = await binding(f, 'rows')
  let step = 0
  const op = () => operationId(`rows-${(step += 1)}`)
  ok(
    await writes.begin({
      ...bound,
      operation: op(),
      representation: {
        kind: 'json-lines',
        codec: lines.definition.returns.body.codec,
        recordSchema: lines.schema,
      },
    }),
  )
  return {
    f,
    record: (sequence: string, value: unknown) =>
      writes.append({
        ...bound,
        operation: op(),
        sequence,
        frame: { kind: 'json-record', value } as never,
      }),
    seal: (afterSequence: string) => writes.seal({ ...bound, operation: op(), afterSequence }),
  }
}

it('a JSON Lines writer stores each record as one LF-terminated line', async () => {
  const w = await jsonLinesWriter()
  expect(
    ok(
      await w.record('1', {
        kind: 'object',
        entries: [{ key: 'a', value: { kind: 'number', lexeme: '1' } }],
      }),
    ),
  ).toMatchObject({ nextSequence: '2' })
  expect(ok(await w.seal('1')).bodyBytes).toBe(String(Buffer.byteLength('{"a":1}\n')))
})

it.each([
  {
    name: 'a value that is not a JSON tree',
    value: { kind: 'object', entries: 'no' },
    kind: 'invalid',
  },
  {
    name: 'a record over the record budget',
    value: { kind: 'string', value: 'x'.repeat(70_000) },
    kind: 'too-large',
  },
])('a JSON Lines writer refuses $name', async ({ value, kind }) => {
  const w = await jsonLinesWriter()
  expect(await w.record('1', value)).toMatchObject({ failure: { kind } })
})

it('a JSON Lines writer passes the schema checker refusal and its crash through', async () => {
  const refusing = await jsonLinesWriter({
    check: async () => fail({ kind: 'invalid', field: 'record', reason: 'not-an-object' }),
  })
  expect(await refusing.record('1', { kind: 'null' })).toEqual({
    failure: { kind: 'invalid', reason: 'record: not-an-object' },
  })
  const crashing = await jsonLinesWriter({
    check: async () => {
      throw new Error('checker down')
    },
  })
  expect(await crashing.record('1', { kind: 'null' })).toEqual({
    failure: { kind: 'unavailable', operation: 'rows-2', reason: 'body schema checker failed' },
  })
})

it('closes the writer when the store finds the permit expired twice in a row', async () => {
  const f = await settlementFixture()
  const w = await openWriter(f, 'twice-expired')
  ok(await w.begin())
  vi.spyOn(f.bodies.store, 'put')
    .mockResolvedValueOnce({ kind: 'permit-expired' })
    .mockResolvedValueOnce({ kind: 'permit-expired' })
  expect(await w.append('1', 'bytes')).toEqual({
    failure: { kind: 'closed', reason: 'start: permit-expired' },
  })
  ok(await w.append('1', 'bytes'))
  vi.spyOn(f.bodies.store, 'seal')
    .mockResolvedValueOnce({ kind: 'permit-expired' })
    .mockResolvedValueOnce({ kind: 'permit-expired' })
  expect(await w.seal('1')).toEqual({
    failure: { kind: 'closed', reason: 'start: permit-expired' },
  })
})

it('answers unknown when the ledger commit of the seal is lost, and seals on the retry', async () => {
  const f = await settlementFixture()
  const w = await openWriter(f, 'lost-seal')
  ok(await w.begin())
  ok(await w.append('1', 'bytes'))
  f.harness.memory.injectCommit('unknown-dropped')
  expect(await w.seal('1')).toMatchObject({ failure: { kind: 'unknown' } })
  expect(ok(await w.inspect())).toMatchObject({ kind: 'open', confirmedThrough: '1' })
  expect(ok(await w.seal('1')).bodyBytes).toBe('5')
})
