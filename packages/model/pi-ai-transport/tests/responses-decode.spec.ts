import type { ModelFault } from '@omne-harness/model-contract'
import type { TransportFact } from '@omne-harness/model-contract/provider'
import { describe, expect, it } from 'vitest'
import type { PiProtocolFrame, PiResponseDecoder } from '../src/index.ts'
import { bindResponses, type ResponsesRecord } from '../src/responses/index.ts'
import { readItems } from '../src/responses/reasoning.ts'
import {
  LIMITS,
  engineProbe,
  fixedRequest,
  supplierOf,
  testMeter,
  tool,
} from './support/chat-record.ts'
import {
  callItem,
  messageItem,
  reasoningItem,
  responsesFramesOf,
  responsesRecord,
  stream,
} from './support/responses-record.ts'
import { frame } from './support/messages-record.ts'

const ACCOUNTING = { place: 'gateway', costUnit: 'gateway-credit' }
const UPSTREAM = responsesRecord({ serving: { order: ['upstream'], reports: ['Upstream'] } })

function decoderOf(record: ResponsesRecord = UPSTREAM): PiResponseDecoder {
  const binding = bindResponses({
    record,
    supplier: supplierOf(record),
    meter: testMeter(record, engineProbe()),
    limits: LIMITS,
    release: async () => {},
  })
  const request = fixedRequest(record, { tools: [tool('get_weather'), tool('lookup')] })
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

function payloadOf(facts: readonly TransportFact[]) {
  const state = sealed(facts).find(block => block.kind === 'reasoning_state')
  if (state?.kind !== 'reasoning_state') throw new Error('no reasoning state')
  return { state, entries: readItems(state.payload) }
}

const OSLO = {
  kind: 'object',
  entries: [{ key: 'city', value: { kind: 'string', value: 'Oslo' } }],
}

describe('decode: recorded streams', () => {
  it.each([
    [
      'reasoning-message-call.sse',
      'Oslo is further north than Lima.',
      'call_jmn8oYLK9o71ZdKuk5VIrvWp',
      ['72', '53', '0', null, '17'],
      '0.000674',
    ],
    [
      'reasoning-message-call-2.sse',
      'Oslo is farther north than Lima.',
      'call_TVyCdAFXh8IJ02QrXhiUetIh',
      ['72', '63', '0', null, '27'],
      '0.00009',
    ],
    [
      'message-call.sse',
      'Oslo is farther north than Lima.',
      'call_6KU3iZXD0j683UUHb41HQBSM',
      ['82', '34', '0', null, '0'],
      '0.000504',
    ],
  ])(
    'reads %s into its text, its call, a reasoning state, an account and a tool-suggestions end',
    (fixture, text, callId, usage, cost) => {
      const { facts, fault } = run(responsesFramesOf(fixture))
      expect(fault).toBeNull()
      const blocks = sealed(facts)
      expect(blocks.map(block => block.kind)).toEqual(['text', 'tool_call', 'reasoning_state'])
      expect(blocks[0]).toMatchObject({ kind: 'text', text })
      expect(blocks[1]).toMatchObject({
        kind: 'tool_call',
        callId,
        name: 'get_weather',
        arguments: OSLO,
      })
      expect(blocks[2]).toMatchObject({ visibility: { toHuman: false, toModel: true }, pairs: [] })
      const names = ['input', 'output', 'cache-read', 'cache-write', 'reasoning']
      expect(facts.find(fact => fact.kind === 'account')).toMatchObject({
        value: {
          usage: names.map((name, index) =>
            usage[index] === null
              ? { name, state: 'unknown' }
              : { name, state: 'known', lexeme: usage[index] },
          ),
          cost: [{ state: 'known', lexeme: cost, unit: 'gateway-credit', source: 'billable' }],
          place: 'gateway/Upstream',
        },
      })
      expect(facts.at(-1)).toEqual({
        kind: 'ended',
        termination: { kind: 'completed', reason: 'tool-suggestions' },
      })
    },
  )

  it('keeps the output items in the order they came, the phase as written, and the reasoning item whole but its status', () => {
    const { facts } = run(responsesFramesOf('reasoning-message-call.sse'))
    const { entries } = payloadOf(facts)
    expect(entries?.map(entry => entry.type)).toEqual(['reasoning', 'message', 'function_call'])
    const [reasoning, shell, call] = entries ?? []
    if (reasoning?.type !== 'reasoning') throw new Error('reasoning')
    const item = reasoning.item.kind === 'object' ? reasoning.item.entries : []
    expect(item.map(entry => entry.key)).toEqual([
      'encrypted_content',
      'format',
      'id',
      'summary',
      'type',
    ])
    expect(item.find(entry => entry.key === 'id')?.value).toEqual({
      kind: 'string',
      value: 'rs_0659762ed9d81b22016afd05e1945087d18b82c4e702e499c1',
    })
    expect(shell).toEqual({
      type: 'message',
      id: 'msg_tmp_mfq93phdy5',
      parts: 1,
      phase: 'commentary',
    })
    expect(call).toEqual({
      type: 'function_call',
      id: 'fc_tmp_mrj5hyvuvbs',
      callId: 'call_jmn8oYLK9o71ZdKuk5VIrvWp',
    })
  })

  it('seals a reasoning state for a reply that has a phase and no reasoning item', () => {
    const { facts } = run(responsesFramesOf('message-call.sse'))
    expect(payloadOf(facts).entries).toEqual([
      { type: 'message', id: 'msg_tmp_vn82jijzqi8', parts: 1, phase: 'commentary' },
      { type: 'function_call', id: 'fc_tmp_730lnwdlvwx', callId: 'call_6KU3iZXD0j683UUHb41HQBSM' },
    ])
  })
})

describe('decode: events written for the case', () => {
  it('seals no reasoning state for a reply with neither a reasoning item nor a phase', () => {
    const { facts, fault } = run([
      stream.created,
      ...messageItem(0, 'm1', 'hi'),
      stream.completed(),
    ])
    expect(fault).toBeNull()
    expect(sealed(facts).map(block => block.kind)).toEqual(['text'])
    expect(facts.at(-1)).toEqual({
      kind: 'ended',
      termination: { kind: 'completed', reason: 'stop' },
    })
  })

  it('shows each summary part as a thinking block the reasoning state pairs with', () => {
    const { facts } = run([
      stream.created,
      ...reasoningItem(0, 'rs_1', ['first', 'second']),
      ...messageItem(1, 'm1', 'answer', 'final_answer'),
      stream.completed(),
    ])
    const blocks = sealed(facts)
    expect(blocks.map(block => block.kind)).toEqual([
      'thinking',
      'thinking',
      'text',
      'reasoning_state',
    ])
    const [first, second, , state] = blocks
    expect(first).toMatchObject({ kind: 'thinking', text: 'first' })
    expect(second).toMatchObject({ kind: 'thinking', text: 'second' })
    if (state?.kind !== 'reasoning_state') throw new Error('state')
    expect(state.pairs).toEqual([first?.id, second?.id])
    const entries = readItems(state.payload)
    expect(entries?.[1]).toEqual({ type: 'message', id: 'm1', parts: 1, phase: 'final_answer' })
  })

  it('keeps a phase that is not a word out of the reasoning state', () => {
    const { facts } = run([
      stream.created,
      ...reasoningItem(0, 'rs_1'),
      ...messageItem(1, 'm1', 'hi', 'Not A Word'),
      stream.completed(),
    ])
    expect(payloadOf(facts).entries?.[1]).toEqual({
      type: 'message',
      id: 'm1',
      parts: 1,
      phase: null,
    })
  })

  it('ends an incomplete response cut by the output limit as a limit, without the call it cut', () => {
    const { facts } = run([
      stream.created,
      ...reasoningItem(0, 'rs_1'),
      ...messageItem(1, 'm1', 'checking', 'commentary'),
      ...callItem(2, 'fc_1', 'call_1', '{"q":'),
      stream.incomplete('max_output_tokens'),
    ])
    expect(sealed(facts).map(block => block.kind)).toEqual(['text', 'reasoning_state'])
    expect(payloadOf(facts).entries?.map(entry => entry.type)).toEqual(['reasoning', 'message'])
    expect(facts.at(-1)).toEqual({
      kind: 'ended',
      termination: { kind: 'completed', reason: 'limit' },
    })
  })

  it.each([
    ['content_filter', 'finish-reason-content_filter'],
    ['Some Reason', 'finish-reason-other'],
  ])('ends an incomplete response for %s as an input-rejected failure', (reason, diagnostic) => {
    const { facts } = run([
      stream.created,
      ...messageItem(0, 'm1', 'hi'),
      stream.incomplete(reason),
    ])
    expect(sealed(facts)).toEqual([])
    expect(facts.at(-1)).toEqual({
      kind: 'ended',
      termination: {
        kind: 'failed',
        fault: { cause: 'input-rejected', diagnostic, upstreamStatus: null },
      },
    })
  })

  it('fails a completed response with nothing written', () => {
    expect(run([stream.created, stream.completed()]).facts.at(-1)).toEqual({
      kind: 'ended',
      termination: {
        kind: 'failed',
        fault: {
          cause: 'upstream-protocol',
          diagnostic: 'finish-without-content',
          upstreamStatus: null,
        },
      },
    })
  })

  it.each([
    ['server_error', null, 'upstream-unavailable'],
    ['rate_limit_exceeded', null, 'upstream-unavailable'],
    ['invalid_prompt', null, 'input-rejected'],
    ['permission_denied', null, 'input-rejected'],
    ['image_content_policy_violation', null, 'input-rejected'],
    ['server_error', 'authentication', 'credential'],
    ['something_new', null, 'unclassified'],
  ])(
    'reads a failed response with code %s and type %s as an in-band %s fault',
    (code, type, cause) => {
      const failed = frame({
        type: 'response.failed',
        response: { status: 'failed', output: [], error: { code, message: 'x' }, error_type: type },
      })
      expect(run([stream.created, failed]).fault).toEqual({
        cause,
        diagnostic: 'in-band-error',
        upstreamStatus: null,
      })
    },
  )

  it('reads an error event as an in-band fault by its code, even before the start', () => {
    expect(
      run([frame({ type: 'error', code: 'rate_limit_exceeded', message: 'x' })]).fault,
    ).toEqual({
      cause: 'upstream-unavailable',
      diagnostic: 'in-band-error',
      upstreamStatus: null,
    })
  })

  it('counts cache writes and names an unknown cost as no cost', () => {
    const { facts } = run([
      stream.created,
      ...messageItem(0, 'm1', 'ok'),
      stream.completed({
        input_tokens: 1052,
        input_tokens_details: { cached_tokens: 0, cache_write_tokens: 1042 },
        output_tokens: 5,
        cost: -1,
      }),
    ])
    expect(facts.find(fact => fact.kind === 'account')).toMatchObject({
      value: {
        usage: [
          { name: 'input', lexeme: '1052' },
          { name: 'output', lexeme: '5' },
          { name: 'cache-read', lexeme: '0' },
          { name: 'cache-write', lexeme: '1042' },
          { name: 'reasoning', state: 'unknown' },
        ],
        cost: [],
      },
    })
  })

  it('takes the end marker after the finish and refuses it before', () => {
    const marker = { kind: 'end-marker' } as const
    expect(
      run([stream.created, ...messageItem(0, 'm1', 'ok'), stream.completed(), marker]).fault,
    ).toBeNull()
    expect(run([stream.created, marker]).fault).toEqual({
      cause: 'upstream-protocol',
      diagnostic: 'unexpected-end-marker',
      upstreamStatus: null,
    })
  })

  it('reports a stream that ended before its finish as lost', () => {
    expect(run([stream.created, ...messageItem(0, 'm1', 'ok')]).fault).toEqual({
      cause: 'stream-lost',
      diagnostic: 'ended-without-finish',
      upstreamStatus: null,
    })
  })

  it('has no refusal of its own: a refused request is left to its status', () => {
    expect(decoderOf().refused).toBeUndefined()
  })
})
