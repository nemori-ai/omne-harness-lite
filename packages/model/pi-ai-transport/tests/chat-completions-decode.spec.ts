// The stream decoder of the gateway engine, one block per row of the stream interpretation table,
// through a binding and the same body decoding that a send uses.
import { readJsonText, type JsonValue } from '@omne-harness/json-text'
import type { ModelBlock, ModelFault, TransportFact } from '@omne-harness/model-contract'
import { describe, expect, it } from 'vitest'
import {
  bindChatCompletions,
  type ChatCompletionsLimits,
  type ChatCompletionsRecord,
  type ChatUsage,
  type GatewayUsage,
  type ReasoningDetail,
  type UsageDiagnostic,
  type VendorHooks,
} from '../src/chat-completions/index.ts'
import { decodeBody } from '../src/fact-stream.ts'
import { ResponseBodyReadError, ResponseBodyStoppedError } from '../src/http.ts'
import type { PiFamilyBinding } from '../src/index.ts'
import { terminationOf } from '../src/termination.ts'
import { GATEWAY_END_MARKER, replayStream } from '../src/testing/fixtures.ts'
import {
  LIMITS,
  engineProbe,
  supplierOf,
  testHooks,
  testMeter,
  testRecord,
} from './support/chat-record.ts'

type Seal = (
  details: readonly ReasoningDetail[],
) => ReturnType<NonNullable<VendorHooks['reasoning']>['seal']>

type Options = Readonly<{
  record?: ChatCompletionsRecord
  seal?: Seal
  reasoning?: boolean
  limits?: ChatCompletionsLimits
  usage?: VendorHooks['usage']
}>

function bind(options: Options = {}): PiFamilyBinding {
  const record = options.record ?? testRecord()
  const probe = engineProbe()
  const tested = testHooks(probe, options.reasoning ?? true)
  const hooks = options.usage === undefined ? tested : { ...tested, usage: options.usage }
  const seal = options.seal
  return bindChatCompletions({
    record,
    supplier: supplierOf(record),
    hooks:
      seal === undefined || hooks.reasoning === null
        ? hooks
        : { ...hooks, reasoning: { ...hooks.reasoning, seal } },
    meter: testMeter(record, probe),
    limits: options.limits ?? LIMITS,
    release: async () => undefined,
  })
}

type ChoiceShape = Readonly<{ delta?: Record<string, unknown>; finish?: string | null }>

/** One gateway chunk with the served model and provider of the test record. */
function chunk(choice?: ChoiceShape, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'gen-1',
    object: 'chat.completion.chunk',
    model: 'lab/model-a',
    provider: 'Lab',
    choices:
      choice === undefined
        ? []
        : [{ index: 0, delta: choice.delta ?? {}, finish_reason: choice.finish ?? null }],
    ...extra,
  }
}

const DONE = '[DONE]'

function sse(...events: readonly (Record<string, unknown> | string)[]): Uint8Array {
  const text = events
    .map(event => `data: ${typeof event === 'string' ? event : JSON.stringify(event)}\n\n`)
    .join('')
  return new TextEncoder().encode(`: gateway processing\n\n${text}`)
}

/** The facts of a stream, checked to end with exactly one `ended`. */
async function replay(
  binding: PiFamilyBinding,
  ...events: readonly (Record<string, unknown> | string)[]
): Promise<readonly TransportFact[]> {
  const facts = await replayStream(binding, sse(...events))
  expect(facts.filter(fact => fact.kind === 'ended')).toHaveLength(1)
  expect(facts.at(-1)?.kind).toBe('ended')
  return facts
}

function endedOf(facts: readonly TransportFact[]): TransportFact {
  const last = facts.at(-1)
  if (last === undefined) throw new Error('no fact')
  return last
}

function faultOf(facts: readonly TransportFact[]): ModelFault {
  const last = endedOf(facts)
  if (last.kind !== 'ended' || last.termination.kind !== 'failed')
    throw new Error(`not a failure: ${JSON.stringify(last)}`)
  return last.termination.fault
}

function protocolFault(diagnostic: string): TransportFact {
  return {
    kind: 'ended',
    termination: {
      kind: 'failed',
      fault: { cause: 'upstream-protocol', diagnostic, upstreamStatus: null },
    },
  }
}

const SHOWN = { toHuman: true, toModel: true }
const STOP: TransportFact = { kind: 'ended', termination: { kind: 'completed', reason: 'stop' } }
/** The account of a finished response of the test record, with the empty items of the test hook. */
const ACCOUNT: TransportFact = {
  kind: 'account',
  event: 'usage',
  value: {
    usage: [],
    cost: [],
    trimmed: { state: 'unknown', unit: 'token' },
    place: 'openrouter/Lab',
    duration: { state: 'unknown' },
    revision: '1',
  },
}

function sealedOf(facts: readonly TransportFact[]): readonly ModelBlock[] {
  return facts.flatMap(fact => (fact.kind === 'block-seal' ? [fact.block] : []))
}

describe('text channel', () => {
  it('content and refusal fill one text block, and a refusal still completes with stop', async () => {
    const facts = await replay(
      bind(),
      chunk({ delta: { role: 'assistant', content: '' } }),
      chunk({ delta: { content: 'I can' } }),
      chunk({ delta: { refusal: 'not help' } }),
      chunk({ finish: 'stop' }),
      DONE,
    )
    expect(facts).toEqual([
      { kind: 'block-open', index: '0', mode: 'append', content: 'text' },
      { kind: 'block-delta', index: '0', delta: 'I can' },
      { kind: 'block-delta', index: '0', delta: 'not help' },
      {
        kind: 'block-seal',
        index: '0',
        block: { kind: 'text', id: 'b0', visibility: SHOWN, text: 'I cannot help' },
      },
      ACCOUNT,
      STOP,
    ])
  })
})

describe('visible reasoning', () => {
  it('takes delta.reasoning first and does not repeat the same text from reasoning_details', async () => {
    const detail = (text: string) => ({ type: 'reasoning.text', text, format: 'lab-v1', index: 0 })
    const facts = await replay(
      bind(),
      chunk({ delta: { reasoning: 'Think', reasoning_details: [detail('Think')] } }),
      chunk({ delta: { reasoning: 'ing', reasoning_details: [detail('ing')] } }),
      chunk({ delta: { content: 'Done' } }),
      chunk({ finish: 'stop' }),
    )
    expect(facts.filter(fact => fact.kind === 'block-delta')).toEqual([
      { kind: 'block-delta', index: '0', delta: 'Think' },
      { kind: 'block-delta', index: '0', delta: 'ing' },
      { kind: 'block-delta', index: '1', delta: 'Done' },
    ])
    expect(sealedOf(facts)[0]).toEqual({
      kind: 'thinking',
      id: 'b0',
      visibility: SHOWN,
      text: 'Thinking',
    })
  })

  it('takes reasoning.text, else reasoning.summary, when the delta has no reasoning member', async () => {
    const summaries = await replay(
      bind(),
      chunk({
        delta: { reasoning_details: [{ type: 'reasoning.summary', summary: 'Plan', index: 0 }] },
      }),
      chunk({ finish: 'stop' }),
    )
    expect(sealedOf(summaries)).toEqual([
      { kind: 'thinking', id: 'b0', visibility: SHOWN, text: 'Plan' },
    ])
    const both = await replay(
      bind(),
      chunk({
        delta: {
          reasoning_details: [
            { type: 'reasoning.summary', summary: 'S', index: 0 },
            { type: 'reasoning.text', text: 'T', index: 1 },
          ],
        },
      }),
      chunk({
        delta: { reasoning_details: [{ type: 'reasoning.summary', summary: 'S2', index: 0 }] },
      }),
      chunk({ finish: 'stop' }),
    )
    expect(sealedOf(both)).toEqual([{ kind: 'thinking', id: 'b0', visibility: SHOWN, text: 'T' }])
  })

  it('never shows [REDACTED] as visible text', async () => {
    const facts = await replay(
      bind(),
      chunk({ delta: { reasoning: '[REDACTED]' } }),
      chunk({
        delta: { reasoning_details: [{ type: 'reasoning.text', text: '[REDACTED]', index: 0 }] },
      }),
      chunk({ delta: { content: 'ok' } }),
      chunk({ finish: 'stop' }),
    )
    expect(facts.some(fact => fact.kind === 'block-open' && fact.content === 'thinking')).toBe(
      false,
    )
  })
})

describe('reasoning details and sealing', () => {
  function capture(payloads: readonly string[] = []): { seal: Seal; seen: ReasoningDetail[][] } {
    const seen: ReasoningDetail[][] = []
    return {
      seen,
      seal: details => {
        seen.push([...details])
        return { ok: payloads.map(payload => ({ payload })) }
      },
    }
  }

  function plain(detail: ReasoningDetail): unknown {
    return Object.fromEntries(
      Object.entries(detail.raw).map(([key, value]: [string, JsonValue]) => [
        key,
        value.kind === 'string' ? value.value : value.kind === 'number' ? value.lexeme : value.kind,
      ]),
    )
  }

  it('joins id-less fragments of one index and adopts a signature that arrives alone', async () => {
    const { seal, seen } = capture()
    const text = (value: string) => ({
      type: 'reasoning.text',
      text: value,
      format: 'lab-v1',
      index: 0,
    })
    await replay(
      bind({ seal }),
      chunk({ delta: { reasoning_details: [text('a')] } }),
      chunk({ delta: { reasoning_details: [text('b')] } }),
      chunk({
        delta: {
          reasoning_details: [
            { type: 'reasoning.text', signature: 'sig', format: 'lab-v1', index: 0 },
          ],
        },
      }),
      chunk({ finish: 'stop' }),
    )
    expect(seen).toHaveLength(1)
    expect(seen[0]?.map(plain)).toEqual([
      { type: 'reasoning.text', text: 'ab', format: 'lab-v1', index: '0', signature: 'sig' },
    ])
  })

  it('after a signature only the same signature joins; an item with an id stays apart', async () => {
    const { seal, seen } = capture()
    await replay(
      bind({ seal }),
      chunk({
        delta: {
          reasoning_details: [
            { type: 'reasoning.text', text: 'a', signature: 's1', index: 0 },
            { type: 'reasoning.text', text: 'b', signature: 's1', index: 0 },
            { type: 'reasoning.text', text: 'c', signature: 's2', index: 0 },
            { type: 'reasoning.text', text: 'd', index: 0 },
            { type: 'reasoning.encrypted', data: 'x', id: 'rs_1', index: 1 },
            { type: 'reasoning.encrypted', data: 'y', id: 'rs_1', index: 1 },
          ],
        },
      }),
      chunk({ finish: 'stop' }),
    )
    expect(seen[0]?.map(detail => [detail.type, plain(detail)])).toEqual([
      ['reasoning.text', { type: 'reasoning.text', text: 'ab', signature: 's1', index: '0' }],
      ['reasoning.text', { type: 'reasoning.text', text: 'c', signature: 's2', index: '0' }],
      ['reasoning.text', { type: 'reasoning.text', text: 'd', index: '0' }],
      ['reasoning.encrypted', { type: 'reasoning.encrypted', data: 'x', id: 'rs_1', index: '1' }],
      ['reasoning.encrypted', { type: 'reasoning.encrypted', data: 'y', id: 'rs_1', index: '1' }],
    ])
  })

  it('seals each payload as a reasoning state part at a new index, paired with the thinking block', async () => {
    const { seal } = capture(['p1', 'p2'])
    const facts = await replay(
      bind({ seal }),
      chunk({
        delta: {
          reasoning: 'why',
          reasoning_details: [{ type: 'reasoning.encrypted', data: 'e' }],
        },
      }),
      chunk({ delta: { content: 'answer' } }),
      chunk({ finish: 'stop' }),
    )
    const state = (index: string, payload: string): unknown => ({
      kind: 'block-seal',
      index,
      block: {
        kind: 'reasoning_state',
        id: `b${index}`,
        visibility: { toHuman: false, toModel: true },
        payload,
        pairs: ['b0'],
      },
    })
    expect(facts.slice(-4)).toEqual([state('2', 'p1'), state('3', 'p2'), ACCOUNT, STOP])
  })

  it('gives no part for an empty payload; one beyond the message limit gives a diagnostic instead', async () => {
    const { seal } = capture(['', 'x'.repeat(1048576), 'x'.repeat(1048577), 'kept'])
    const facts = await replay(
      bind({ seal }),
      chunk({ delta: { reasoning_details: [{ type: 'reasoning.encrypted', data: 'e' }] } }),
      chunk({ finish: 'stop' }),
    )
    expect(facts.filter(fact => fact.kind === 'diagnostic')).toEqual([
      {
        kind: 'diagnostic',
        value: { kind: 'reasoning-state-dropped', reason: 'payload-too-long', length: 1048577 },
      },
    ])
    expect(sealedOf(facts).map(block => block.id)).toEqual(['b0', 'b1'])
    expect(sealedOf(facts).slice(1)).toEqual([
      {
        kind: 'reasoning_state',
        id: 'b1',
        visibility: { toHuman: false, toModel: true },
        payload: 'kept',
        pairs: [],
      },
    ])
  })

  it('ends with the fault of the seal hook', async () => {
    const fault: ModelFault = {
      cause: 'upstream-protocol',
      diagnostic: 'seal-test',
      upstreamStatus: null,
    }
    const facts = await replay(
      bind({ seal: () => ({ failure: fault }) }),
      chunk({ delta: { reasoning_details: [{ type: 'reasoning.encrypted', data: 'e' }] } }),
      chunk({ finish: 'stop' }),
    )
    expect(faultOf(facts)).toEqual(fault)
  })

  it('refuses reasoning beyond the buffer limit', async () => {
    const facts = await replay(
      bind({ limits: { ...LIMITS, maxReasoningText: 30 } }),
      chunk({
        delta: { reasoning_details: [{ type: 'reasoning.encrypted', data: 'x'.repeat(20) }] },
      }),
    )
    expect(endedOf(facts)).toEqual(protocolFault('reasoning-over-buffer-limit'))
  })
})

// The identity of streamed reasoning detail items. The cases follow the sealed late-signature
// tests (packages.0.0.1.legacy, anthropic-stream-late-signature.spec.ts) with neutral names.
describe('reasoning detail identity', () => {
  /** A json-text tree as plain data; a number becomes a JavaScript number. */
  function data(value: JsonValue): unknown {
    switch (value.kind) {
      case 'null':
        return null
      case 'boolean':
      case 'string':
        return value.value
      case 'number':
        return Number(value.lexeme)
      case 'array':
        return value.items.map(data)
      case 'object':
        return Object.fromEntries(value.entries.map(entry => [entry.key, data(entry.value)]))
    }
  }

  /** The items that the seal hook gets when each fragment arrives in its own chunk. */
  async function joined(fragments: readonly Record<string, unknown>[]): Promise<unknown[]> {
    const seen: ReasoningDetail[][] = []
    await replay(
      bind({ seal: details => (seen.push([...details]), { ok: [] }) }),
      ...fragments.map(detail => chunk({ delta: { reasoning_details: [detail] } })),
      chunk({ finish: 'stop' }),
    )
    expect(seen).toHaveLength(1)
    return (seen[0] ?? []).map(detail =>
      Object.fromEntries(Object.entries(detail.raw).map(([key, value]) => [key, data(value)])),
    )
  }

  const base = {
    type: 'reasoning.text',
    id: 'block-1',
    index: 0,
    format: 'fmt-a',
    extension: { source: 'controlled' },
  }
  const { id: _id, ...idless } = base
  const observedText = { type: 'reasoning.text', text: 'Thinking. ', format: 'fmt-a', index: 0 }
  const observedSignature = { type: 'reasoning.text', signature: 'SIG', format: 'fmt-a', index: 0 }

  it('joins same-id text and its late signature and keeps unknown members', async () => {
    expect(
      await joined([
        { ...base, text: 'first ', signature: null },
        { ...base, text: 'second', signature: 'signed-one' },
      ]),
    ).toEqual([{ ...base, text: 'first second', signature: 'signed-one' }])
  })

  it('joins same-id fragments that carry the same signature', async () => {
    expect(
      await joined([
        { ...base, text: 'first ', signature: 'signed-one' },
        { ...base, text: 'second', signature: 'signed-one' },
      ]),
    ).toEqual([{ ...base, text: 'first second', signature: 'signed-one' }])
  })

  it.each([
    ['a different id', { id: 'block-2' }],
    ['a different index', { index: 1 }],
    ['a different format', { format: 'fmt-b' }],
    ['a different unknown member', { extension: { source: 'other' } }],
    ['a conflicting signature', { signature: 'signed-two' }],
    ['a different type', { type: 'reasoning.encrypted', data: 'cipher' }],
  ])('keeps a fragment with %s as its own item', async (_case, change) => {
    const first = { ...base, text: 'first', signature: 'signed-one' }
    const next = { ...base, text: 'second', signature: 'signed-one', ...change }
    expect(await joined([first, next])).toEqual([first, next])
  })

  it('compares unknown members losslessly: key order is free, number lexemes are not', async () => {
    const first = { ...idless, extension: { a: 1, b: 2 }, text: 'x' }
    expect(await joined([first, { ...idless, extension: { b: 2, a: 1 }, text: 'y' }])).toEqual([
      { ...first, text: 'xy' },
    ])
    const seen: ReasoningDetail[][] = []
    await replayStream(
      bind({ seal: details => (seen.push([...details]), { ok: [] }) }),
      new TextEncoder().encode(
        [
          '{"model":"lab/model-a","provider":"Lab","choices":[{"index":0,"delta":{"reasoning_details":[{"type":"reasoning.text","text":"x","index":0,"weight":1}]}}]}',
          '{"model":"lab/model-a","provider":"Lab","choices":[{"index":0,"delta":{"reasoning_details":[{"type":"reasoning.text","text":"y","index":0,"weight":1.0}]}}]}',
          '{"model":"lab/model-a","provider":"Lab","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}',
        ]
          .map(frame => `data: ${frame}\n\n`)
          .join(''),
      ),
    )
    expect(seen[0]).toHaveLength(2)
  })

  it('joins id-less same-index fragments that repeat one signature', async () => {
    expect(
      await joined([
        { ...idless, text: 'first ', signature: 'signed-one' },
        { ...idless, text: 'second', signature: 'signed-one' },
      ]),
    ).toEqual([{ ...idless, text: 'first second', signature: 'signed-one' }])
  })

  it('joins an id-less pair without an index only while both are unsigned', async () => {
    const { index: _index, ...unindexed } = idless
    const first = { ...unindexed, text: 'first', signature: null }
    const next = { ...unindexed, text: 'second', signature: 'signed-one' }
    expect(await joined([first, next])).toEqual([first, next])
    const unsigned = { ...unindexed, text: 'second', signature: null }
    expect(await joined([first, unsigned])).toEqual([
      { ...unindexed, text: 'firstsecond', signature: null },
    ])
  })

  it('rebuilds id-less text and then a signature-only fragment into one signed item', async () => {
    expect(await joined([observedText, observedSignature])).toEqual([
      { ...observedText, signature: 'SIG' },
    ])
    expect(
      await joined([observedText, { ...observedText, text: 'Second.' }, observedSignature]),
    ).toEqual([{ ...observedText, text: 'Thinking. Second.', signature: 'SIG' }])
  })

  it('starts a new item for an unsigned fragment after the late signature', async () => {
    const after = { ...observedText, text: 'next block' }
    expect(await joined([observedText, observedSignature, after])).toEqual([
      { ...observedText, signature: 'SIG' },
      after,
    ])
  })

  it('keeps a late signature on a different index apart', async () => {
    const elsewhere = { ...observedSignature, index: 1 }
    expect(await joined([observedText, elsewhere])).toEqual([observedText, elsewhere])
  })

  it('keeps a text-less fragment without a non-empty signature apart', async () => {
    const { signature: _none, ...textless } = observedSignature
    expect(await joined([observedText, textless])).toEqual([observedText, textless])
    const empty = { ...observedSignature, signature: '' }
    expect(await joined([observedText, empty])).toEqual([observedText, empty])
    const numeric = { ...observedSignature, text: 1 }
    expect(await joined([observedText, numeric])).toEqual([observedText, numeric])
  })

  it('keeps a different second signature apart after the first one arrived', async () => {
    const other = { ...observedSignature, signature: 'SIG-OTHER' }
    expect(await joined([observedText, observedSignature, other])).toEqual([
      { ...observedText, signature: 'SIG' },
      other,
    ])
  })

  it('joins adjacent id-less unsigned fragments whose heads are equal', async () => {
    const { signature: _none, ...absent } = { ...idless, text: 'b ', signature: null }
    expect(
      await joined([
        { ...idless, text: 'a ', signature: null },
        absent,
        { ...idless, text: 'c', signature: null },
      ]),
    ).toEqual([{ ...idless, text: 'a b c', signature: null }])
    const first = { ...idless, text: 'a', signature: null }
    const other = { ...idless, text: 'b', signature: null, index: 1 }
    expect(await joined([first, other])).toEqual([first, other])
  })

  it('fills a null id-less signature from a later same-index signature', async () => {
    expect(
      await joined([
        { ...idless, text: 'first ', signature: null },
        { ...idless, text: 'second', signature: 'signed-one' },
      ]),
    ).toEqual([{ ...idless, text: 'first second', signature: 'signed-one' }])
  })

  it.each([
    ['a signature and then none', 'signed-one', null],
    ['an invalid signature type', null, 7],
    ['an empty signature', null, ''],
  ])('keeps id-less fragments apart when they carry %s', async (_case, early, late) => {
    const first = { ...idless, text: 'first', signature: early }
    const next = { ...idless, text: 'second', signature: late }
    expect(await joined([first, next])).toEqual([first, next])
  })

  it('continues absent and null signatures of one id until the signature arrives', async () => {
    const { signature: _none, ...absent } = { ...base, text: 'b ', signature: null }
    expect(
      await joined([
        { ...base, text: 'a ', signature: null },
        absent,
        { ...base, text: 'c', signature: null },
        { ...base, text: '', signature: 'signed-one' },
      ]),
    ).toEqual([{ ...base, text: 'a b c', signature: 'signed-one' }])
    const { signature: _absent, ...unsigned } = { ...base, text: 'x', signature: null }
    expect(await joined([unsigned, { ...base, text: 'y', signature: null }])).toEqual([
      { ...base, text: 'xy', signature: null },
    ])
  })

  it('keeps an unsigned fragment after a signed fragment of the same id apart', async () => {
    const signed = { ...base, text: 'first', signature: 'signed-one' }
    const unsigned = { ...base, text: 'second', signature: null }
    expect(await joined([signed, unsigned])).toEqual([signed, unsigned])
  })

  it.each([
    ['numeric', 7],
    ['empty string', ''],
    ['object', { value: 'signed-one' }],
  ])('does not let a %s signature join fragments', async (_case, signature) => {
    const unsigned = { ...base, text: 'first', signature: null }
    const invalid = { ...base, text: 'first', signature }
    const next = { ...base, text: 'second', signature }
    expect(await joined([unsigned, next])).toEqual([unsigned, next])
    expect(await joined([invalid, next])).toEqual([invalid, next])
  })

  it.each([
    ['an empty id', { id: '' }],
    ['a non-string text', { text: 1 }],
  ])('keeps fragments with %s apart', async (_case, change) => {
    const first = { ...base, text: 'first', signature: null, ...change }
    const next = { ...base, text: 'second', signature: 'signed-one', ...change }
    expect(await joined([first, next])).toEqual([first, next])
  })

  it('refuses the chunk of a fragment with a non-string id', async () => {
    const facts = await replay(
      bind(),
      chunk({ delta: { reasoning_details: [{ ...base, id: 1, text: 'first' }] } }),
    )
    expect(endedOf(facts)).toEqual(protocolFault('reasoning-detail-shape'))
  })

  it('keeps same-id encrypted items apart and joins summaries by the same identity', async () => {
    const encrypted = { ...base, type: 'reasoning.encrypted', data: 'cipher' }
    expect(await joined([encrypted, encrypted])).toEqual([encrypted, encrypted])
    const summary = { type: 'reasoning.summary', format: 'fmt-b', index: 0 }
    expect(
      await joined([
        { ...summary, summary: 'first ' },
        { ...summary, summary: 'second' },
      ]),
    ).toEqual([{ ...summary, summary: 'first second' }])
    const named = { ...summary, id: 'sum-1' }
    expect(
      await joined([
        { ...named, summary: 'a' },
        { ...named, summary: 'b' },
      ]),
    ).toEqual([{ ...named, summary: 'ab' }])
    const apart = [
      { ...named, summary: 'a' },
      { ...named, id: 'sum-2', summary: 'b' },
    ]
    expect(await joined(apart)).toEqual(apart)
    const empty = [
      { ...summary, id: '', summary: 'a' },
      { ...summary, id: '', summary: 'b' },
    ]
    expect(await joined(empty)).toEqual(empty)
  })
})

describe('tool calls', () => {
  const call = (fields: Record<string, unknown>) => ({
    delta: { tool_calls: [{ index: 0, ...fields }] },
  })

  it('buffers argument text until the name, then streams a tool-arguments block and seals a call', async () => {
    const facts = await replay(
      bind(),
      chunk(call({ id: 'call_1', function: { arguments: '{"q":' } })),
      chunk(call({ type: 'function', function: { name: 'lookup', arguments: '"x"' } })),
      chunk(call({ function: { arguments: '}' } })),
      chunk({ finish: 'tool_calls' }),
    )
    expect(facts).toEqual([
      { kind: 'block-open', index: '0', mode: 'append', content: 'tool-arguments' },
      { kind: 'block-delta', index: '0', delta: '{"q":' },
      { kind: 'block-delta', index: '0', delta: '"x"' },
      { kind: 'block-delta', index: '0', delta: '}' },
      {
        kind: 'block-seal',
        index: '0',
        block: {
          kind: 'tool_call',
          id: 'b0',
          visibility: SHOWN,
          callId: 'call_1',
          name: 'lookup',
          arguments: {
            kind: 'object',
            entries: [{ key: 'q', value: { kind: 'string', value: 'x' } }],
          },
        },
      },
      ACCOUNT,
      { kind: 'ended', termination: { kind: 'completed', reason: 'tool-suggestions' } },
    ])
  })

  it('reads empty argument text as an empty object', async () => {
    const facts = await replay(
      bind(),
      chunk(call({ id: 'call_1', function: { name: 'now', arguments: '' } })),
      chunk({ finish: 'tool_calls' }),
    )
    expect(sealedOf(facts)).toEqual([
      expect.objectContaining({ kind: 'tool_call', arguments: { kind: 'object', entries: [] } }),
    ])
  })

  it('a finish while a fragment still has no name is a protocol fault', async () => {
    const facts = await replay(
      bind(),
      chunk(call({ id: 'c', function: { arguments: '{}' } })),
      chunk({ finish: 'stop' }),
    )
    expect(endedOf(facts)).toEqual(protocolFault('tool-call-without-name'))
  })

  it('refuses argument text beyond the limit, before or after the name', async () => {
    const limits = { ...LIMITS, toolArguments: { ...LIMITS.toolArguments, maxBytes: 4 } }
    const facts = await replay(
      bind({ limits }),
      chunk(call({ id: 'c', function: { arguments: '{"a"' } })),
      chunk(call({ function: { arguments: ':1}' } })),
    )
    expect(endedOf(facts)).toEqual(protocolFault('tool-arguments-over-limit'))
  })

  it('arguments that do not decode, a call without an id or a changed name are protocol faults', async () => {
    const invalid = await replay(
      bind(),
      chunk(call({ id: 'c', function: { name: 'f', arguments: '{' } })),
      chunk({ finish: 'tool_calls' }),
    )
    expect(endedOf(invalid)).toEqual(protocolFault('tool-arguments-invalid'))
    const noId = await replay(
      bind(),
      chunk(call({ function: { name: 'f', arguments: '{}' } })),
      chunk({ finish: 'tool_calls' }),
    )
    expect(endedOf(noId)).toEqual(protocolFault('tool-call-without-id'))
    const renamed = await replay(
      bind(),
      chunk(call({ id: 'c', function: { name: 'f' } })),
      chunk(call({ function: { name: 'g' } })),
    )
    expect(endedOf(renamed)).toEqual(protocolFault('tool-name-changed'))
  })
})

describe('finish', () => {
  it('maps stop, tool_calls and length to completed', async () => {
    for (const [finish, reason] of [
      ['stop', 'stop'],
      ['tool_calls', 'tool-suggestions'],
      ['length', 'limit'],
    ] as const) {
      const facts = await replay(bind(), chunk({ delta: { content: 'x' } }), chunk({ finish }))
      expect(endedOf(facts)).toEqual({ kind: 'ended', termination: { kind: 'completed', reason } })
    }
  })

  it('after length seals text, thinking and reasoning, and keeps a tool-arguments block open', async () => {
    const facts = await replay(
      bind({ seal: () => ({ ok: [{ payload: 'p' }] }) }),
      chunk({
        delta: { reasoning: 'r', reasoning_details: [{ type: 'reasoning.encrypted', data: 'e' }] },
      }),
      chunk({ delta: { content: 't' } }),
      chunk({
        delta: { tool_calls: [{ index: 0, id: 'c', function: { name: 'f', arguments: '{"a":' } }] },
      }),
      chunk({ finish: 'length' }),
    )
    expect(sealedOf(facts).map(block => block.kind)).toEqual([
      'thinking',
      'text',
      'reasoning_state',
    ])
  })

  it('any other finish fails as rejected input with the finish value, and seals nothing', async () => {
    const facts = await replay(
      bind(),
      chunk({ delta: { content: 'x' } }),
      chunk({ finish: 'content_filter' }),
    )
    expect(sealedOf(facts)).toEqual([])
    expect(faultOf(facts)).toEqual({
      cause: 'input-rejected',
      diagnostic: 'finish-reason-content_filter',
      upstreamStatus: null,
    })
  })

  it('does not copy an unusual finish value into the diagnostic', async () => {
    const facts = await replay(bind(), chunk({ finish: 'Bad Value <secret>' }))
    expect(faultOf(facts).diagnostic).toBe('finish-reason-other')
  })
})

describe('tail after finish', () => {
  const usage = { prompt_tokens: 9, completion_tokens: 3, total_tokens: 12 }

  it('accepts the same finish again with an empty delta and usage, then a usage-only frame', async () => {
    const facts = await replay(
      bind(),
      chunk({ delta: { content: 'x' } }),
      chunk({ delta: { content: '', role: 'assistant' }, finish: 'stop' }),
      chunk({ delta: { content: '', role: 'assistant' }, finish: 'stop' }, { usage }),
      { ...chunk(), choices: [], usage },
      DONE,
    )
    expect(endedOf(facts)).toEqual(STOP)
  })

  it('refuses more tail frames than usageTail.maxFrames', async () => {
    const record = testRecord()
    const strict = testRecord({ wire: { ...record.wire, usageTail: { maxFrames: 1 } } })
    const facts = await replay(
      bind({ record: strict }),
      chunk({ finish: 'stop' }),
      chunk({ finish: 'stop' }, { usage }),
      chunk(undefined, { usage }),
    )
    expect(endedOf(facts)).toEqual(protocolFault('usage-tail-too-long'))
  })

  it('refuses content or another finish in a tail frame', async () => {
    const content = await replay(
      bind(),
      chunk({ finish: 'stop' }),
      chunk({ delta: { content: 'late' } }),
    )
    expect(endedOf(content)).toEqual(protocolFault('content-after-finish'))
    const changed = await replay(bind(), chunk({ finish: 'stop' }), chunk({ finish: 'length' }))
    expect(endedOf(changed)).toEqual(protocolFault('finish-changed'))
  })
})

describe('account', () => {
  const usage = {
    prompt_tokens: 9,
    completion_tokens: 3,
    prompt_tokens_details: { cached_tokens: 2 },
    completion_tokens_details: { reasoning_tokens: 1 },
    cost: 0.00012345,
  }
  const items: ChatUsage['items'] = [{ name: 'output', state: 'known', lexeme: '3', unit: 'token' }]
  const inconsistent: UsageDiagnostic = { kind: 'usage-inconsistent', field: 'input' }

  it('gives the account of the last usage, then the usage diagnostics, before the termination', async () => {
    const seen: GatewayUsage[] = []
    const facts = await replay(
      bind({
        usage: read => {
          seen.push(read)
          return { ok: { items, diagnostics: [inconsistent] } }
        },
      }),
      chunk({ delta: { content: 'x' } }, { usage: { prompt_tokens: 1 } }),
      chunk({ finish: 'length' }),
      { ...chunk(), choices: [], usage },
      DONE,
    )
    expect(seen).toHaveLength(1)
    expect(seen[0]).toMatchObject({
      promptTokens: '9',
      completionTokens: '3',
      cachedTokens: '2',
      reasoningTokens: '1',
    })
    expect(facts.slice(-3)).toEqual([
      {
        kind: 'account',
        event: 'usage',
        value: {
          usage: items,
          cost: [
            {
              state: 'known',
              lexeme: '0.00012345',
              unit: 'openrouter-credit',
              source: 'supplier',
            },
          ],
          trimmed: { state: 'unknown', unit: 'token' },
          place: 'openrouter/Lab',
          duration: { state: 'unknown' },
          revision: '1',
        },
      },
      { kind: 'diagnostic', value: inconsistent },
      { kind: 'ended', termination: { kind: 'completed', reason: 'limit' } },
    ])
  })

  it('gives the usage hook unknown counts when the response reported no usage, and no cost', async () => {
    const seen: GatewayUsage[] = []
    const facts = await replay(
      bind({
        usage: read => {
          seen.push(read)
          return { ok: { items: [], diagnostics: [] } }
        },
      }),
      chunk({ finish: 'stop' }),
    )
    expect(seen).toEqual([
      {
        promptTokens: null,
        completionTokens: null,
        cachedTokens: null,
        reasoningTokens: null,
        raw: {},
      },
    ])
    expect(facts).toEqual([ACCOUNT, STOP])
  })

  it('keeps a cost that is not a plain decimal as unknown', async () => {
    for (const cost of [-1, 1e-7, 'free'])
      expect(
        (await replay(bind(), chunk({ finish: 'stop' }, { usage: { cost } }))).find(
          fact => fact.kind === 'account',
        ),
      ).toMatchObject({
        value: { cost: [{ state: 'unknown', unit: 'openrouter-credit', source: 'supplier' }] },
      })
  })

  it('also accounts for a response that a finish rejects', async () => {
    const facts = await replay(bind(), chunk({ finish: 'content_filter' }, { usage }))
    expect(facts.map(fact => fact.kind)).toEqual(['account', 'ended'])
  })

  it('ends with the fault of the usage hook, without an account', async () => {
    const fault: ModelFault = {
      cause: 'upstream-protocol',
      diagnostic: 'usage-test',
      upstreamStatus: null,
    }
    const facts = await replay(
      bind({ usage: () => ({ failure: fault }) }),
      chunk({ finish: 'stop' }),
    )
    expect(facts).toEqual([{ kind: 'ended', termination: { kind: 'failed', fault } }])
  })

  it('gives no account for a stream that fails before its end', async () => {
    const facts = await replay(bind(), chunk({ delta: { content: 'x' } }, { usage }), DONE)
    expect(facts.some(fact => fact.kind === 'account')).toBe(false)
  })
})

describe('account of a response that fails after its finish', () => {
  const usage = { prompt_tokens: 9, completion_tokens: 3 }
  const finished = [chunk({ delta: { content: 'x' } }), chunk({ finish: 'stop' }, { usage })]
  const inconsistent: UsageDiagnostic = { kind: 'usage-inconsistent', field: 'input' }
  /** Writes the prompt count it received as an item, so the account shows the usage it kept. */
  const keeping: VendorHooks['usage'] = read => ({
    ok: {
      items:
        read.promptTokens === null
          ? []
          : [{ name: 'input', state: 'known', lexeme: read.promptTokens, unit: 'token' }],
      diagnostics: [inconsistent],
    },
  })
  const account = (items: ChatUsage['items']): TransportFact => ({
    kind: 'account',
    event: 'usage',
    value: {
      usage: items,
      cost: [],
      trimmed: { state: 'unknown', unit: 'token' },
      place: 'openrouter/Lab',
      duration: { state: 'unknown' },
      revision: '1',
    },
  })
  const kept = account([{ name: 'input', state: 'known', lexeme: '9', unit: 'token' }])

  /** The facts of a body that gives `events` and then throws `error`, as a send reads it. */
  async function failing(
    events: readonly (Record<string, unknown> | string)[],
    error: Error,
  ): Promise<readonly TransportFact[]> {
    const bytes = sse(...events)
    const decoding = decodeBody({
      body: (async function* () {
        yield bytes
        throw error
      })(),
      decoder: bind({ usage: keeping }).createDecoder(),
      endMarker: GATEWAY_END_MARKER,
      limits: { maxEventBytes: 65_536, json: LIMITS.toolArguments },
      received: () => false,
      progress: { bodyComplete: false },
    })
    const facts: TransportFact[] = []
    let step = await decoding.next()
    while (step.done !== true) {
      facts.push(step.value)
      step = await decoding.next()
    }
    return [...facts, { kind: 'ended', termination: terminationOf(step.value) }]
  }

  it('keeps the usage received when the body is lost after the finish', async () => {
    const facts = await failing(finished, new ResponseBodyReadError(new Error('reset')))
    expect(facts.slice(-3)).toEqual([
      kept,
      { kind: 'diagnostic', value: inconsistent },
      {
        kind: 'ended',
        termination: {
          kind: 'failed',
          fault: { cause: 'stream-lost', diagnostic: 'response-body-lost', upstreamStatus: null },
        },
      },
    ])
  })

  it('keeps the usage received when the send is stopped after the finish', async () => {
    const facts = await failing(finished, new ResponseBodyStoppedError())
    expect(facts.slice(-3)).toEqual([
      kept,
      { kind: 'diagnostic', value: inconsistent },
      { kind: 'ended', termination: { kind: 'interrupted', stop: 'confirmed' } },
    ])
  })

  it('keeps the usage received when a later frame is malformed or refused', async () => {
    const record = testRecord()
    const strict = testRecord({ wire: { ...record.wire, usageTail: { maxFrames: 1 } } })
    const cases = [
      { record, events: [...finished, '{not json'], fault: protocolFault('frame-invalid-json') },
      {
        record: strict,
        events: [...finished, chunk(undefined, { usage }), chunk(undefined, { usage })],
        fault: protocolFault('usage-tail-too-long'),
      },
      {
        record,
        events: [...finished, chunk({ delta: { content: 'late' } })],
        fault: protocolFault('content-after-finish'),
      },
    ]
    for (const item of cases) {
      const facts = await replay(bind({ record: item.record, usage: keeping }), ...item.events)
      expect(facts.slice(-3)).toEqual([
        kept,
        { kind: 'diagnostic', value: inconsistent },
        item.fault,
      ])
    }
  })

  it('keeps the unknown usage of a finish without usage, and gives none before the finish', async () => {
    const without = await failing(
      [chunk({ delta: { content: 'x' } }), chunk({ finish: 'stop' })],
      new ResponseBodyReadError(new Error('reset')),
    )
    expect(without.filter(fact => fact.kind === 'account')).toEqual([account([])])
    const before = await failing(
      [chunk({ delta: { content: 'x' } }, { usage })],
      new ResponseBodyReadError(new Error('reset')),
    )
    expect(before.some(fact => fact.kind === 'account' || fact.kind === 'diagnostic')).toBe(false)
  })

  it('the decoder gives the account and the fault from end() after it refused a frame', () => {
    const decoder = bind({ usage: keeping }).createDecoder()
    const frame = (value: Record<string, unknown>) => {
      const read = readJsonText(JSON.stringify(value), LIMITS.toolArguments)
      if (read.kind !== 'ok') throw new Error('not JSON')
      return decoder.accept({ kind: 'data', value: read.value })
    }
    frame(chunk({ delta: { content: 'x' } }))
    frame(chunk({ finish: 'stop' }, { usage }))
    const fault = {
      cause: 'upstream-protocol',
      diagnostic: 'content-after-finish',
      upstreamStatus: null,
    }
    expect(frame(chunk({ delta: { content: 'late' } }))).toEqual({ failure: fault })
    expect(frame(chunk(undefined, { usage }))).toMatchObject({
      failure: { diagnostic: 'frame-after-end' },
    })
    expect(decoder.end()).toEqual({
      ok: [
        kept,
        { kind: 'diagnostic', value: inconsistent },
        { kind: 'ended', termination: { kind: 'failed', fault } },
      ],
    })
    expect(decoder.end()).toMatchObject({ failure: { diagnostic: 'decoder-already-ended' } })
  })
})

describe('served model and provider', () => {
  it('the first chunk must report a pinned provider and a model', async () => {
    const other = await replay(bind(), chunk({ finish: 'stop' }, { provider: 'Elsewhere' }))
    expect(endedOf(other)).toEqual(protocolFault('provider-not-pinned'))
    const silent = await replay(bind(), chunk({ finish: 'stop' }, { provider: null }))
    expect(endedOf(silent)).toEqual(protocolFault('serving-not-reported'))
  })

  it('a later chunk must not change the provider or the model', async () => {
    const record = testRecord({ serving: { order: ['Lab'], reports: ['Lab', 'Lab2'] } })
    const provider = await replay(
      bind({ record }),
      chunk({ delta: { content: 'a' } }),
      chunk({ finish: 'stop' }, { provider: 'Lab2' }),
    )
    expect(endedOf(provider)).toEqual(protocolFault('provider-changed'))
    const model = await replay(
      bind(),
      chunk({ delta: { content: 'a' } }),
      chunk({ finish: 'stop' }, { model: 'lab/other' }),
    )
    expect(endedOf(model)).toEqual(protocolFault('model-changed'))
  })
})

describe('in-band error', () => {
  it('maps a numeric code like an HTTP status and never copies the error text', async () => {
    const facts = await replay(
      bind(),
      chunk({ delta: { content: 'x' } }),
      chunk({ finish: 'error' }, { error: { code: 429, message: 'secret upstream text' } }),
    )
    expect(faultOf(facts)).toEqual({
      cause: 'upstream-unavailable',
      diagnostic: 'in-band-error',
      upstreamStatus: '429',
    })
    expect(JSON.stringify(facts)).not.toContain('secret')
  })

  it('an error without a numeric code is unclassified', async () => {
    const facts = await replay(bind(), { error: { code: 'server_error', message: 'm' } })
    expect(faultOf(facts)).toEqual({
      cause: 'unclassified',
      diagnostic: 'in-band-error',
      upstreamStatus: null,
    })
  })
})

describe('end of the stream', () => {
  it('a body that ends after the finish without the end marker completes', async () => {
    const facts = await replay(
      bind(),
      chunk({ delta: { content: 'x' } }),
      chunk({ finish: 'stop' }),
    )
    expect(endedOf(facts)).toEqual(STOP)
  })

  it('a stream without a finish is lost, with or without the end marker', async () => {
    const lost = { cause: 'stream-lost', diagnostic: 'ended-without-finish', upstreamStatus: null }
    expect(faultOf(await replay(bind(), chunk({ delta: { content: 'x' } })))).toEqual(lost)
    expect(faultOf(await replay(bind(), chunk({ delta: { content: 'x' } }), DONE))).toEqual(lost)
  })

  it('an ended decoder refuses every later frame and a second end', () => {
    const decoder = bind().createDecoder()
    expect(decoder.accept({ kind: 'end-marker' })).toEqual({ ok: [] })
    expect(decoder.end()).toMatchObject({ failure: { cause: 'stream-lost' } })
    expect(decoder.accept({ kind: 'data', value: { kind: 'object', entries: [] } })).toEqual({
      failure: { cause: 'upstream-protocol', diagnostic: 'frame-after-end', upstreamStatus: null },
    })
    expect(decoder.end()).toMatchObject({ failure: { diagnostic: 'decoder-already-ended' } })
  })

  it('each dispatch has its own decoder state', async () => {
    const binding = bind()
    await replay(binding, chunk({ delta: { content: 'first' } }), chunk({ finish: 'stop' }))
    const second = await replay(
      binding,
      chunk({ delta: { content: 'second' } }),
      chunk({ finish: 'stop' }),
    )
    expect(second[0]).toEqual({ kind: 'block-open', index: '0', mode: 'append', content: 'text' })
  })
})

describe('chunk shape', () => {
  it('refuses a chunk with two choices, a non-object chunk and unsupported output members', async () => {
    const two = await replay(bind(), {
      ...chunk(),
      choices: [
        { index: 0, delta: {} },
        { index: 1, delta: {} },
      ],
    })
    expect(endedOf(two)).toEqual(protocolFault('multiple-choices'))
    const scalar = await replay(bind(), '42')
    expect(endedOf(scalar)).toEqual(protocolFault('chunk-not-object'))
    const audio = await replay(bind(), chunk({ delta: { audio: { data: 'x' } } }))
    expect(endedOf(audio)).toEqual(protocolFault('unsupported-delta-member'))
  })
})

describe('synthetic streams in the shape of real gateway streams', () => {
  it('summary reasoning with an encrypted item and a doubled finish chunk', async () => {
    const summary = (text: string) => ({
      content: '',
      role: 'assistant',
      reasoning: text,
      reasoning_details: [{ type: 'reasoning.summary', summary: text, format: 'fmt-a', index: 0 }],
    })
    const seen: ReasoningDetail[][] = []
    const facts = await replay(
      bind({
        seal: details => {
          seen.push([...details])
          return { ok: [{ payload: 'sealed' }] }
        },
      }),
      chunk({ delta: summary('**Plan**') }),
      chunk({ delta: summary(' greet') }),
      chunk({
        delta: {
          content: '',
          role: 'assistant',
          reasoning: null,
          reasoning_details: [
            { type: 'reasoning.encrypted', data: 'opaque', format: 'fmt-a', id: 'rs_1', index: 1 },
          ],
        },
      }),
      chunk({ delta: { content: 'Hello', role: 'assistant' } }),
      chunk({ delta: { content: '!', role: 'assistant' } }),
      chunk({ delta: { content: '', role: 'assistant', reasoning: null }, finish: 'stop' }),
      chunk(
        { delta: { content: '', role: 'assistant' }, finish: 'stop' },
        { service_tier: 'default', usage: { prompt_tokens: 9, completion_tokens: 54 } },
      ),
      DONE,
    )
    expect(seen[0]?.map(detail => detail.type)).toEqual([
      'reasoning.summary',
      'reasoning.encrypted',
    ])
    expect(sealedOf(facts)).toEqual([
      { kind: 'thinking', id: 'b0', visibility: SHOWN, text: '**Plan** greet' },
      { kind: 'text', id: 'b1', visibility: SHOWN, text: 'Hello!' },
      {
        kind: 'reasoning_state',
        id: 'b2',
        visibility: { toHuman: false, toModel: true },
        payload: 'sealed',
        pairs: ['b0'],
      },
    ])
    expect(endedOf(facts)).toEqual(STOP)
  })

  it('text reasoning whose signature arrives alone, then the doubled finish chunk', async () => {
    const text = (value: string) => ({
      content: '',
      role: 'assistant',
      reasoning: value,
      reasoning_details: [{ type: 'reasoning.text', text: value, format: 'fmt-b', index: 0 }],
    })
    const seen: ReasoningDetail[][] = []
    const facts = await replay(
      bind({
        seal: details => {
          seen.push([...details])
          return { ok: [{ payload: 'group' }] }
        },
      }),
      chunk({ delta: text('17×20') }),
      chunk({ delta: text(' is 340') }),
      chunk({
        delta: {
          content: '',
          role: 'assistant',
          reasoning_details: [
            { type: 'reasoning.text', signature: 'SIG', format: 'fmt-b', index: 0 },
          ],
        },
      }),
      chunk({ delta: { content: '340', role: 'assistant' } }),
      chunk({ delta: { content: '', role: 'assistant', reasoning: null }, finish: 'stop' }),
      chunk(
        { delta: { content: '', role: 'assistant' }, finish: 'stop' },
        { usage: { prompt_tokens: 19 } },
      ),
      DONE,
    )
    expect(seen[0]).toHaveLength(1)
    expect(seen[0]?.[0]?.raw['signature']).toEqual({ kind: 'string', value: 'SIG' })
    expect(seen[0]?.[0]?.raw['text']).toEqual({ kind: 'string', value: '17×20 is 340' })
    expect(sealedOf(facts).map(block => block.kind)).toEqual([
      'thinking',
      'text',
      'reasoning_state',
    ])
    expect(endedOf(facts)).toEqual(STOP)
  })
})

describe('binding limits', () => {
  it('refuses limits that are not positive integers', () => {
    expect(() => bind({ limits: { ...LIMITS, maxReasoningText: 0 } })).toThrow(RangeError)
    expect(() =>
      bind({ limits: { ...LIMITS, toolArguments: { ...LIMITS.toolArguments, maxDepth: 1.5 } } }),
    ).toThrow(RangeError)
  })
})
