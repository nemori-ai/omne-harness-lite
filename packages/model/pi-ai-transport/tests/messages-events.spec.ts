import type { ModelFault } from '@omne-harness/model-contract'
import type { TransportFact } from '@omne-harness/model-contract/provider'
import { describe, expect, it } from 'vitest'
import type { PiProtocolFrame, PiResponseDecoder } from '../src/index.ts'
import { bindMessages } from '../src/messages/index.ts'
import { readThinking, sealThinking } from '../src/messages/reasoning.ts'
import {
  LIMITS,
  engineProbe,
  fixedRequest,
  supplierOf,
  testMeter,
  tool,
} from './support/chat-record.ts'
import { frame, messagesRecord } from './support/messages-record.ts'

const RECORD = messagesRecord({ serving: { order: ['upstream'], reports: ['Lab'] } })

function decoder(limits = LIMITS): PiResponseDecoder {
  return bindMessages({
    record: RECORD,
    supplier: supplierOf(RECORD),
    meter: testMeter(RECORD, engineProbe()),
    limits,
    release: async () => {},
  }).createDecoder({
    request: fixedRequest(RECORD, { tools: [tool('lookup')] }),
    accounting: {
      place: 'gateway',
      costUnit: 'credit',
      generation: { requestHeader: 'x-generation-id', path: '/api/v1/generation' },
    },
  })
}

function run(
  frames: readonly PiProtocolFrame[],
  options: Readonly<{ limits?: typeof LIMITS; end?: boolean }> = {},
): Readonly<{ facts: readonly TransportFact[]; fault: ModelFault | null }> {
  const decoding = decoder(options.limits)
  const facts: TransportFact[] = []
  for (const item of frames) {
    const accepted = decoding.accept(item)
    if (!('ok' in accepted)) return { facts, fault: accepted.failure }
    facts.push(...accepted.ok)
  }
  if (options.end === false) return { facts, fault: null }
  const ended = decoding.end()
  if (!('ok' in ended)) return { facts, fault: ended.failure }
  return { facts: [...facts, ...ended.ok], fault: null }
}

const protocol = (diagnostic: string) => ({
  cause: 'upstream-protocol',
  diagnostic,
  upstreamStatus: null,
})

const START = frame({
  type: 'message_start',
  message: {
    provider: 'Lab',
    usage: { input_tokens: 7, cache_read_input_tokens: 3, cache_creation_input_tokens: 2 },
  },
})
const block = (index: number, content_block: object) =>
  frame({ type: 'content_block_start', index, content_block })
const delta = (index: number, value: object) =>
  frame({ type: 'content_block_delta', index, delta: value })
const stop = (index: number) => frame({ type: 'content_block_stop', index })
const finish = (stop_reason: string | null, usage: object = { output_tokens: 5 }) =>
  frame({ type: 'message_delta', delta: { stop_reason }, usage })

describe('the facts of a stream, in order', () => {
  it('opens each shown block with its kind, numbers the blocks in order, and seals them at the finish', () => {
    const { facts, fault } = run([
      START,
      block(0, { type: 'redacted_thinking', data: 'cipher' }),
      stop(0),
      block(1, { type: 'thinking', thinking: 'a', signature: '' }),
      delta(1, { type: 'thinking_delta', thinking: 'b' }),
      delta(1, { type: 'signature_delta', signature: 'sig' }),
      stop(1),
      block(2, { type: 'text', text: '' }),
      delta(2, { type: 'text_delta', text: 'hi' }),
      delta(2, { type: 'text_delta', text: '' }),
      stop(2),
      block(3, { type: 'tool_use', id: 'toolu_1', name: 'lookup', input: {} }),
      delta(3, { type: 'input_json_delta', partial_json: '{"q":' }),
      delta(3, { type: 'input_json_delta', partial_json: '"x"}' }),
      stop(3),
      finish('tool_use'),
      frame({ type: 'message_stop' }),
    ])
    expect(fault).toBeNull()
    const opening = facts.filter(fact => fact.kind !== 'block-seal')
    expect(opening.slice(0, 7)).toEqual([
      { kind: 'block-open', index: '0', mode: 'append', content: 'thinking' },
      { kind: 'block-delta', index: '0', delta: 'a' },
      { kind: 'block-delta', index: '0', delta: 'b' },
      { kind: 'block-open', index: '1', mode: 'append', content: 'text' },
      { kind: 'block-delta', index: '1', delta: 'hi' },
      { kind: 'block-open', index: '2', mode: 'append', content: 'tool-arguments' },
      { kind: 'block-delta', index: '2', delta: '{"q":' },
    ])
    const seals = facts.flatMap(fact => (fact.kind === 'block-seal' ? [fact] : []))
    expect(seals.map(fact => [fact.index, fact.block.kind])).toEqual([
      ['0', 'thinking'],
      ['1', 'text'],
      ['2', 'tool_call'],
      ['3', 'reasoning_state'],
    ])
    const state = seals[3]?.block
    if (state?.kind !== 'reasoning_state') throw new Error('state')
    expect(readThinking(state.payload)).toEqual([
      { type: 'redacted_thinking', data: 'cipher' },
      { type: 'thinking', thinking: 'ab', signature: 'sig' },
    ])
    expect(facts.at(-2)).toMatchObject({
      kind: 'account',
      value: {
        usage: [
          { name: 'input', lexeme: '7' },
          { name: 'output', lexeme: '5' },
          { name: 'cache-read', lexeme: '3' },
          { name: 'cache-write', lexeme: '2' },
          { name: 'reasoning', state: 'unknown' },
        ],
        cost: [],
        place: 'gateway/Lab',
        trimmed: { state: 'unknown', unit: 'token' },
        duration: { state: 'unknown' },
        revision: '1',
      },
    })
  })

  it('shows unsigned thinking but leaves it out of the reasoning state', () => {
    const { facts } = run([
      START,
      block(0, { type: 'thinking', thinking: 'plan', signature: '' }),
      stop(0),
      block(1, { type: 'text', text: 'done' }),
      stop(1),
      finish('end_turn'),
    ])
    const kinds = facts.flatMap(fact => (fact.kind === 'block-seal' ? [fact.block.kind] : []))
    expect(kinds).toEqual(['thinking', 'text'])
  })

  it('reports an upstream transformation once however often it is repeated', () => {
    const transformation = { type: 'thinking_dropped', path: 'messages.1.content.0', reason: 'x' }
    const { facts } = run([
      frame({
        type: 'message_start',
        message: { provider: 'Lab', usage: {}, input_transformations: [transformation] },
      }),
      block(0, { type: 'text', text: 'a' }),
      stop(0),
      frame({
        type: 'message_delta',
        delta: { stop_reason: 'end_turn' },
        usage: {},
        input_transformations: [transformation],
      }),
    ])
    expect(facts.filter(fact => fact.kind === 'diagnostic')).toHaveLength(1)
  })

  it('names an unknown cost as unknown rather than leaving it out', () => {
    const { facts } = run([
      START,
      block(0, { type: 'text', text: 'a' }),
      stop(0),
      finish('end_turn', { output_tokens: 1, cost: -1 }),
    ])
    expect(facts.find(fact => fact.kind === 'account')).toMatchObject({ value: { cost: [] } })
    const { facts: priced } = run([
      START,
      block(0, { type: 'text', text: 'a' }),
      stop(0),
      finish('end_turn', { output_tokens: 1, cost: 1e-7 }),
    ])
    expect(priced.find(fact => fact.kind === 'account')).toMatchObject({
      value: {
        cost: [{ state: 'known', lexeme: '0.0000001', unit: 'credit', source: 'billable' }],
      },
    })
  })
})

describe('what the decoder refuses', () => {
  const text0 = [block(0, { type: 'text', text: '' })]
  it.each([
    ['a second start', [START, START], 'message-restarted'],
    [
      'a start that names no provider',
      [frame({ type: 'message_start', message: { usage: {} } })],
      'serving-not-reported',
    ],
    [
      'a block opened over an open one',
      [START, ...text0, block(1, { type: 'text', text: '' })],
      'block-out-of-order',
    ],
    [
      'a delta for another index',
      [START, ...text0, delta(1, { type: 'text_delta', text: 'x' })],
      'delta-out-of-place',
    ],
    [
      'a delta with no open block',
      [START, delta(0, { type: 'text_delta', text: 'x' })],
      'delta-out-of-place',
    ],
    [
      'a signature on text',
      [START, ...text0, delta(0, { type: 'signature_delta', signature: 's' })],
      'delta-out-of-place',
    ],
    [
      'tool arguments on text',
      [START, ...text0, delta(0, { type: 'input_json_delta', partial_json: '{}' })],
      'delta-out-of-place',
    ],
    [
      'text on thinking',
      [
        START,
        block(0, { type: 'thinking', thinking: '', signature: '' }),
        delta(0, { type: 'text_delta', text: 'x' }),
      ],
      'delta-out-of-place',
    ],
    ['a stop for another index', [START, ...text0, stop(1)], 'stop-out-of-place'],
    ['a stop with no open block', [START, stop(0)], 'stop-out-of-place'],
    [
      'a stop event before the finish',
      [START, frame({ type: 'message_stop' })],
      'stop-before-finish',
    ],
    [
      'a finish without a reason',
      [START, ...text0, stop(0), finish(null)],
      'finish-without-reason',
    ],
    [
      'a second stop event',
      [
        START,
        ...text0,
        stop(0),
        finish('end_turn'),
        frame({ type: 'message_stop' }),
        frame({ type: 'message_stop' }),
      ],
      'content-after-finish',
    ],
    ['an end marker frame', [{ kind: 'end-marker' } as const], 'unexpected-end-marker'],
    [
      'tool arguments that are not JSON',
      [
        START,
        block(0, { type: 'tool_use', id: 't', name: 'lookup' }),
        delta(0, { type: 'input_json_delta', partial_json: '{' }),
        stop(0),
        finish('tool_use'),
      ],
      'tool-arguments-invalid',
    ],
  ] as const)('refuses %s', (_case, frames, diagnostic) => {
    expect(run(frames as readonly PiProtocolFrame[]).fault).toEqual(protocol(diagnostic))
  })

  it('refuses a frame after the decoder ended, and a second end', () => {
    const decoding = decoder()
    for (const item of [START, block(0, { type: 'text', text: 'a' }), stop(0), finish('end_turn')])
      decoding.accept(item)
    expect('ok' in decoding.end()).toBe(true)
    expect(decoding.accept(START)).toEqual({ failure: protocol('frame-after-end') })
    expect(decoding.end()).toEqual({ failure: protocol('decoder-already-ended') })
  })

  it('refuses reasoning text and tool arguments beyond their limits', () => {
    const small = {
      ...LIMITS,
      maxReasoningText: 3,
      toolArguments: { ...LIMITS.toolArguments, maxBytes: 4 },
    }
    expect(
      run(
        [
          START,
          block(0, { type: 'thinking', thinking: '', signature: '' }),
          delta(0, { type: 'thinking_delta', thinking: 'abcd' }),
        ],
        { limits: small },
      ).fault,
    ).toEqual(protocol('reasoning-over-buffer-limit'))
    expect(
      run(
        [
          START,
          block(0, { type: 'tool_use', id: 't', name: 'lookup' }),
          delta(0, { type: 'input_json_delta', partial_json: '{"q":1}' }),
        ],
        { limits: small },
      ).fault,
    ).toEqual(protocol('tool-arguments-over-limit'))
  })

  it.each([
    ['nothing written', [START, finish('end_turn')], 'finish-without-content'],
    [
      'no tool call',
      [START, block(0, { type: 'text', text: 'a' }), stop(0), finish('tool_use')],
      'finish-without-tool-call',
    ],
  ] as const)('fails a completion with %s', (_case, frames, diagnostic) => {
    expect(run(frames).facts.at(-1)).toEqual({
      kind: 'ended',
      termination: { kind: 'failed', fault: protocol(diagnostic) },
    })
  })
})

describe('the reasoning state payload', () => {
  it('reads back what it sealed', () => {
    const blocks = [
      { type: 'thinking', thinking: 't', signature: 's' },
      { type: 'redacted_thinking', data: 'd' },
    ] as const
    expect(readThinking(sealThinking(blocks))).toEqual(blocks)
  })

  it.each([
    ['text that is not JSON', 'not json'],
    ['a value that is not a list', '{"type":"thinking"}'],
    ['an empty list', '[]'],
    ['an item that is not an object', '["x"]'],
    ['thinking without a signature', '[{"thinking":"t","type":"thinking"}]'],
    ['thinking with an empty signature', '[{"signature":"","thinking":"t","type":"thinking"}]'],
    ['thinking without its text', '[{"signature":"s","type":"thinking"}]'],
    ['redacted thinking without data', '[{"type":"redacted_thinking"}]'],
    ['redacted thinking with empty data', '[{"data":"","type":"redacted_thinking"}]'],
    ['a block of another type', '[{"text":"t","type":"text"}]'],
  ])('reads %s as not a payload of this engine', (_case, payload) => {
    expect(readThinking(payload)).toBeNull()
  })
})
