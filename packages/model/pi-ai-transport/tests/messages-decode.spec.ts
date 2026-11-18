import type { ModelFault } from '@omne-harness/model-contract'
import type { TransportFact } from '@omne-harness/model-contract/provider'
import { describe, expect, it } from 'vitest'
import type { PiProtocolFrame, PiResponseDecoder } from '../src/index.ts'
import { bindMessages, type MessagesRecord } from '../src/messages/index.ts'
import { readThinking } from '../src/messages/reasoning.ts'
import {
  LIMITS,
  engineProbe,
  fixedRequest,
  supplierOf,
  testMeter,
  tool,
} from './support/chat-record.ts'
import { frame, framesOf, messagesRecord } from './support/messages-record.ts'
import { factsOfSend } from '../src/fact-stream.ts'
import type { HttpExchange } from '../src/http.ts'

const ACCOUNTING = { place: 'gateway', costUnit: 'gateway-credit' }
const UPSTREAM = messagesRecord({ serving: { order: ['upstream'], reports: ['Anthropic'] } })

function decoderOf(record: MessagesRecord = UPSTREAM): PiResponseDecoder {
  const probe = engineProbe()
  const binding = bindMessages({
    record,
    supplier: supplierOf(record),
    meter: testMeter(record, probe),
    limits: LIMITS,
    release: async () => {},
  })
  const request = fixedRequest(record, { tools: [tool('get_weather')] })
  return binding.createDecoder({ request, accounting: ACCOUNTING })
}

type Run = Readonly<{ facts: readonly TransportFact[]; fault: ModelFault | null }>

function run(frames: readonly PiProtocolFrame[], decoder = decoderOf()): Run {
  const facts: TransportFact[] = []
  for (const item of frames) {
    const accepted = decoder.accept(item)
    if (!('ok' in accepted)) return { facts, fault: accepted.failure }
    facts.push(...accepted.ok)
  }
  const ended = decoder.end()
  if (!('ok' in ended)) return { facts, fault: ended.failure }
  return { facts: [...facts, ...ended.ok], fault: null }
}

const sealed = (facts: readonly TransportFact[]) =>
  facts.flatMap(fact => (fact.kind === 'block-seal' ? [fact.block] : []))

const START = frame({
  type: 'message_start',
  message: { model: 'lab/model-a', provider: 'Anthropic', usage: { input_tokens: 10 } },
})
const TEXT = [
  frame({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }),
  frame({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'hi' } }),
  frame({ type: 'content_block_stop', index: 0 }),
]
const STOP = (reason: string, usage: object = { output_tokens: 3 }) =>
  frame({ type: 'message_delta', delta: { stop_reason: reason }, usage })

describe('decode: recorded streams', () => {
  it('reads a text block and a tool call into sealed blocks, an account and a tool-suggestions end', () => {
    const { facts, fault } = run(framesOf('text-and-tool.sse'))
    expect(fault).toBeNull()
    const blocks = sealed(facts)
    expect(blocks.map(block => block.kind)).toEqual(['text', 'tool_call'])
    expect(blocks[0]).toMatchObject({
      kind: 'text',
      text: 'Oslo is further north than Lima, since Oslo sits at about 60°N while Lima lies in the Southern Hemisphere at about 12°S.',
    })
    expect(blocks[1]).toMatchObject({
      kind: 'tool_call',
      callId: 'toolu_017G4fXgQAkn19thn6W5La7T',
      name: 'get_weather',
      arguments: {
        kind: 'object',
        entries: [{ key: 'city', value: { kind: 'string', value: 'Oslo' } }],
      },
    })
    const account = facts.find(fact => fact.kind === 'account')
    expect(account).toMatchObject({
      value: {
        usage: [
          { name: 'input', state: 'known', lexeme: '414' },
          { name: 'output', state: 'known', lexeme: '101' },
          { name: 'cache-read', state: 'known', lexeme: '0' },
          { name: 'cache-write', state: 'known', lexeme: '0' },
          { name: 'reasoning', state: 'known', lexeme: '0' },
        ],
        cost: [{ state: 'known', lexeme: '0.00919', unit: 'gateway-credit', source: 'billable' }],
        place: 'gateway/Anthropic',
      },
    })
    expect(facts.at(-1)).toEqual({
      kind: 'ended',
      termination: { kind: 'completed', reason: 'tool-suggestions' },
    })
  })

  it('seals the signed thinking block into a reasoning state that pairs with the shown thinking', () => {
    const { facts, fault } = run(framesOf('thinking-and-tool.sse'))
    expect(fault).toBeNull()
    const blocks = sealed(facts)
    expect(blocks.map(block => block.kind)).toEqual([
      'thinking',
      'text',
      'tool_call',
      'reasoning_state',
    ])
    const [thinking, , , state] = blocks
    if (thinking?.kind !== 'thinking' || state?.kind !== 'reasoning_state') throw new Error('kinds')
    expect(state.visibility).toEqual({ toHuman: false, toModel: true })
    expect(state.pairs).toEqual([thinking.id])
    const replayed = readThinking(state.payload)
    expect(replayed).toHaveLength(1)
    expect(replayed?.[0]).toMatchObject({ type: 'thinking', thinking: thinking.text })
    expect(replayed?.[0]?.type === 'thinking' && replayed[0].signature.length).toBeGreaterThan(100)
  })
})

describe('decode: events written for the case', () => {
  it('keeps a redacted thinking block only in the reasoning state', () => {
    const { facts } = run([
      START,
      frame({
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'redacted_thinking', data: 'Zm9v' },
      }),
      frame({ type: 'content_block_stop', index: 0 }),
      ...TEXT.map(item => withIndex(item, 1)),
      STOP('end_turn'),
    ])
    const blocks = sealed(facts)
    expect(blocks.map(block => block.kind)).toEqual(['text', 'reasoning_state'])
    const state = blocks[1]
    if (state?.kind !== 'reasoning_state') throw new Error('kind')
    expect(readThinking(state.payload)).toEqual([{ type: 'redacted_thinking', data: 'Zm9v' }])
    expect(state.pairs).toEqual([])
  })

  it('reports each transformation the upstream made once, as words without content', () => {
    const transformations = [
      { type: 'thinking_dropped', path: 'messages.1.content.0', reason: 'prefix_binding_mismatch' },
      { type: 'thinking_dropped', path: 'messages.3.content.0', reason: 'Has Text EqHk==' },
    ]
    const { facts } = run([
      START,
      ...TEXT,
      frame({
        type: 'message_delta',
        delta: { stop_reason: 'end_turn' },
        usage: { output_tokens: 2 },
        input_transformations: transformations,
      }),
    ])
    expect(facts.filter(fact => fact.kind === 'diagnostic')).toEqual([
      {
        kind: 'diagnostic',
        value: {
          kind: 'upstream-transformed',
          type: 'thinking_dropped',
          path: 'messages.1.content.0',
          reason: 'prefix_binding_mismatch',
        },
      },
      {
        kind: 'diagnostic',
        value: {
          kind: 'upstream-transformed',
          type: 'thinking_dropped',
          path: 'messages.3.content.0',
          reason: 'unreadable',
        },
      },
    ])
  })

  it.each([
    ['end_turn', { kind: 'completed', reason: 'stop' }],
    ['stop_sequence', { kind: 'completed', reason: 'stop' }],
    ['max_tokens', { kind: 'completed', reason: 'limit' }],
    [
      'refusal',
      {
        kind: 'failed',
        fault: {
          cause: 'input-rejected',
          diagnostic: 'finish-reason-refusal',
          upstreamStatus: null,
        },
      },
    ],
  ])('ends a stop reason of %s as %o', (reason, termination) => {
    const { facts } = run([START, ...TEXT, STOP(reason)])
    expect(facts.at(-1)).toEqual({ kind: 'ended', termination })
  })

  it('does not seal a tool call that the output limit cut', () => {
    const { facts } = run([
      START,
      frame({
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'tool_use', id: 'toolu_1', name: 'get_weather', input: {} },
      }),
      frame({
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'input_json_delta', partial_json: '{"ci' },
      }),
      frame({ type: 'content_block_stop', index: 0 }),
      STOP('max_tokens'),
    ])
    expect(sealed(facts)).toEqual([])
    expect(facts.at(-1)).toEqual({
      kind: 'ended',
      termination: { kind: 'completed', reason: 'limit' },
    })
  })

  it.each([
    ['an event before the start', [TEXT[0]], 'event-before-start'],
    ['a block out of order', [START, withIndex(TEXT[0], 1)], 'block-out-of-order'],
    [
      'a delta of another kind',
      [
        START,
        TEXT[0],
        frame({
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'thinking_delta', thinking: 'x' },
        }),
      ],
      'delta-out-of-place',
    ],
    ['a finish with an open block', [START, TEXT[0], STOP('end_turn')], 'finish-with-open-block'],
    [
      'content after the finish',
      [START, ...TEXT, STOP('end_turn'), TEXT[0]],
      'content-after-finish',
    ],
    [
      'a provider that is not pinned',
      [frame({ type: 'message_start', message: { provider: 'Other', usage: {} } })],
      'provider-not-pinned',
    ],
    [
      'an unknown block',
      [
        START,
        frame({
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'server_tool_use' },
        }),
      ],
      'unsupported-block',
    ],
  ])('refuses %s as an upstream protocol fault', (_case, frames, diagnostic) => {
    expect(run(frames as readonly PiProtocolFrame[]).fault).toEqual({
      cause: 'upstream-protocol',
      diagnostic,
      upstreamStatus: null,
    })
  })

  it('reports a stream that ended before its finish as lost', () => {
    expect(run([START, ...TEXT]).fault).toEqual({
      cause: 'stream-lost',
      diagnostic: 'ended-without-finish',
      upstreamStatus: null,
    })
  })

  it.each([
    ['overloaded_error', 'upstream-unavailable'],
    ['api_error', 'upstream-unavailable'],
    ['rate_limit_error', 'upstream-unavailable'],
    ['invalid_request_error', 'input-rejected'],
    ['request_too_large', 'input-rejected'],
    ['authentication_error', 'credential'],
    ['permission_error', 'credential'],
    ['something_new', 'unclassified'],
  ])('reads an error event of type %s as an in-band %s fault', (type, cause) => {
    expect(run([START, frame({ type: 'error', error: { type } })]).fault).toEqual({
      cause,
      diagnostic: 'in-band-error',
      upstreamStatus: null,
    })
  })

  it.each([
    ['an event of an unknown type', { type: 'message_paused' }, 'unsupported-event'],
    ['a frame that is not an object', ['x'], 'event-not-object'],
    ['a block event without an index', { type: 'content_block_stop' }, 'event-without-index'],
    ['a start without its message', { type: 'message_start' }, 'message-start-without-message'],
    [
      'a delta of an unknown kind',
      { type: 'content_block_delta', index: 0, delta: { type: 'citations_delta' } },
      'unsupported-delta',
    ],
  ])('refuses %s', (_case, value, diagnostic) => {
    expect(run([frame(value)]).fault).toEqual({
      cause: 'upstream-protocol',
      diagnostic,
      upstreamStatus: null,
    })
  })

  it('takes a ping anywhere and keeps the usage of the start when the finish reports none', () => {
    const { facts } = run([
      frame({ type: 'ping' }),
      START,
      frame({ type: 'ping' }),
      ...TEXT,
      frame({ type: 'message_delta', delta: { stop_reason: 'end_turn' } }),
      frame({ type: 'message_stop' }),
    ])
    expect(facts.find(fact => fact.kind === 'account')).toMatchObject({
      value: {
        usage: [
          { name: 'input', state: 'known', lexeme: '10' },
          { name: 'output', state: 'unknown' },
          { name: 'cache-read', state: 'unknown' },
          { name: 'cache-write', state: 'unknown' },
          { name: 'reasoning', state: 'unknown' },
        ],
      },
    })
  })
})

describe('decode: refusals', () => {
  const SIGNATURE_REFUSAL =
    '{"type":"error","error":{"type":"invalid_request_error","message":"messages.1.content.0: Invalid `signature` in `thinking` block"}}'

  it('classifies a refused signature as replay-rejected', () => {
    expect(decoderOf().refused?.(400, SIGNATURE_REFUSAL)).toEqual({
      cause: 'replay-rejected',
      replayCarried: true,
      diagnostic: 'replay-signature',
      upstreamStatus: '400',
    })
  })

  // T2: only a request that carried reasoning state back can be refused for it.
  it.each([
    [true, { cause: 'replay-rejected', replayCarried: true, diagnostic: 'replay-signature' }],
    [false, { cause: 'input-rejected', diagnostic: 'replay-not-carried' }],
  ] as const)(
    'ends the dispatch on that refusal by whether it carried state (%s)',
    async (carried, fault) => {
      const exchange: HttpExchange = {
        result: Promise.resolve({
          kind: 'http-error',
          status: 400,
          headers: new Headers() as never,
          errorBody: { kind: 'complete', bytes: new TextEncoder().encode(SIGNATURE_REFUSAL) },
        }),
        stop: () => {},
        stopped: Promise.resolve(),
        requestMaySent: () => true,
      }
      const facts: TransportFact[] = []
      for await (const fact of factsOfSend({
        exchange,
        decoder: decoderOf(),
        route: {} as never,
        limits: {} as never,
        diagnostics: [],
        replayCarried: carried,
      }))
        facts.push(fact)
      expect(facts).toEqual([
        {
          kind: 'ended',
          termination: { kind: 'failed', fault: { ...fault, upstreamStatus: '400' } },
        },
      ])
    },
  )

  it('leaves any other refusal to the status', () => {
    const decoder = decoderOf()
    expect(decoder.refused?.(400, '{"error":{"message":"max_tokens: too large"}}')).toBeNull()
    expect(decoder.refused?.(500, SIGNATURE_REFUSAL)).toBeNull()
  })
})

function withIndex(item: PiProtocolFrame | undefined, index: number): PiProtocolFrame {
  if (item?.kind !== 'data' || item.value.kind !== 'object') throw new Error('frame')
  return {
    kind: 'data',
    value: {
      kind: 'object',
      entries: item.value.entries.map(entry =>
        entry.key === 'index'
          ? { key: 'index', value: { kind: 'number', lexeme: String(index) } }
          : entry,
      ),
    },
  }
}
