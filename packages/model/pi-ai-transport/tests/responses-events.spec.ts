import type { ModelFault } from '@omne-harness/model-contract'
import type { TransportFact } from '@omne-harness/model-contract/provider'
import { describe, expect, it } from 'vitest'
import type { PiProtocolFrame, PiResponseDecoder } from '../src/index.ts'
import { bindResponses } from '../src/responses/index.ts'
import { readItems, sealItems } from '../src/responses/reasoning.ts'
import {
  LIMITS,
  engineProbe,
  fixedRequest,
  supplierOf,
  testMeter,
  tool,
} from './support/chat-record.ts'
import { frame } from './support/messages-record.ts'
import {
  callItem,
  messageItem,
  reasoningItem,
  responsesRecord,
  stream,
} from './support/responses-record.ts'

const RECORD = responsesRecord()

function decoder(limits = LIMITS): PiResponseDecoder {
  return bindResponses({
    record: RECORD,
    supplier: supplierOf(RECORD),
    meter: testMeter(RECORD, engineProbe()),
    limits,
    release: async () => {},
  }).createDecoder({
    request: fixedRequest(RECORD, { tools: [tool('lookup')] }),
    accounting: { place: 'gateway', costUnit: 'credit' },
  })
}

function run(
  frames: readonly PiProtocolFrame[],
  limits = LIMITS,
): Readonly<{ facts: readonly TransportFact[]; fault: ModelFault | null }> {
  const decoding = decoder(limits)
  const facts: TransportFact[] = []
  for (const item of frames) {
    const accepted = decoding.accept(item)
    if (!('ok' in accepted)) return { facts, fault: accepted.failure }
    facts.push(...accepted.ok)
  }
  const ended = decoding.end()
  if (!('ok' in ended)) return { facts, fault: ended.failure }
  return { facts: [...facts, ...ended.ok], fault: null }
}

const protocol = (diagnostic: string) => ({
  cause: 'upstream-protocol',
  diagnostic,
  upstreamStatus: null,
})

const { created, added, done, partAdded, textDelta, textDone, partDone } = stream
const message0 = added(0, { id: 'm1', type: 'message', role: 'assistant', content: [] })
const reasoning0 = added(0, { id: 'rs_1', type: 'reasoning', summary: [] })
const call0 = added(0, { id: 'fc_1', type: 'function_call', call_id: 'c1', name: 'lookup' })

describe('the facts of a stream, in order', () => {
  it('opens each shown block with its kind, numbers the blocks in order, and seals them at the finish', () => {
    const { facts, fault } = run([
      created,
      frame({ type: 'response.in_progress', response: {} }),
      ...reasoningItem(0, 'rs_1', ['a']),
      added(1, { id: 'm1', type: 'message', role: 'assistant', content: [], phase: 'commentary' }),
      partAdded(1, 0, 'h'),
      textDelta(1, 'i'),
      textDelta(1, ''),
      textDone(1),
      partDone(1),
      partAdded(1, 1),
      textDelta(1, 'there', 1),
      textDone(1, 1),
      partDone(1, 1),
      done(1, { id: 'm1', type: 'message', role: 'assistant', phase: 'commentary' }),
      added(2, {
        id: 'fc_1',
        type: 'function_call',
        call_id: 'c1',
        name: 'lookup',
        arguments: '{"q":',
      }),
      stream.argumentsDelta(2, '"x"}'),
      done(2, { id: 'fc_1', type: 'function_call', call_id: 'c1', arguments: '{"q":"x"}' }),
      stream.completed(),
      { kind: 'end-marker' },
    ])
    expect(fault).toBeNull()
    expect(facts.filter(fact => fact.kind !== 'block-seal').slice(0, 9)).toEqual([
      { kind: 'block-open', index: '0', mode: 'append', content: 'thinking' },
      { kind: 'block-delta', index: '0', delta: 'a' },
      { kind: 'block-open', index: '1', mode: 'append', content: 'text' },
      { kind: 'block-delta', index: '1', delta: 'h' },
      { kind: 'block-delta', index: '1', delta: 'i' },
      { kind: 'block-open', index: '2', mode: 'append', content: 'text' },
      { kind: 'block-delta', index: '2', delta: 'there' },
      { kind: 'block-open', index: '3', mode: 'append', content: 'tool-arguments' },
      { kind: 'block-delta', index: '3', delta: '{"q":' },
    ])
    const seals = facts.flatMap(fact => (fact.kind === 'block-seal' ? [fact] : []))
    expect(seals.map(fact => [fact.index, fact.block.kind])).toEqual([
      ['0', 'thinking'],
      ['1', 'text'],
      ['2', 'text'],
      ['3', 'tool_call'],
      ['4', 'reasoning_state'],
    ])
    const state = seals[4]?.block
    if (state?.kind !== 'reasoning_state') throw new Error('state')
    expect(readItems(state.payload)?.slice(1)).toEqual([
      { type: 'message', id: 'm1', parts: 2, phase: 'commentary' },
      { type: 'function_call', id: 'fc_1', callId: 'c1' },
    ])
  })

  it('takes summary part events around the summary text and opens nothing for an empty part', () => {
    const { facts, fault } = run([
      created,
      reasoning0,
      frame({ type: 'response.reasoning_summary_part.added', output_index: 0, summary_index: 0 }),
      stream.summaryDone(0, 0, ''),
      frame({ type: 'response.reasoning_summary_part.done', output_index: 0, summary_index: 0 }),
      stream.summaryDelta(0, 1, 'b'),
      stream.summaryDone(0, 1, 'b'),
      done(0, { id: 'rs_1', type: 'reasoning', summary: [] }),
      ...messageItem(1, 'm1', 'ok'),
      stream.completed(),
    ])
    expect(fault).toBeNull()
    expect(facts.flatMap(fact => (fact.kind === 'block-seal' ? [fact.block.kind] : []))).toEqual([
      'thinking',
      'text',
      'reasoning_state',
    ])
  })
})

describe('what the decoder refuses', () => {
  it.each([
    ['an event before the start', [message0], 'event-before-start'],
    ['a second start', [created, created], 'response-restarted'],
    [
      'an item out of order',
      [created, added(1, { id: 'm1', type: 'message', role: 'assistant' })],
      'item-out-of-order',
    ],
    ['an item over an open one', [created, message0, reasoning0], 'item-out-of-order'],
    ['a part of no message', [created, reasoning0, partAdded(0)], 'part-out-of-order'],
    ['a part out of order', [created, message0, partAdded(0, 1)], 'part-out-of-order'],
    [
      'a part over an open one',
      [created, message0, partAdded(0), partAdded(0)],
      'part-out-of-order',
    ],
    ['text with no open part', [created, message0, textDelta(0, 'x')], 'delta-out-of-place'],
    [
      'text for another item',
      [created, message0, partAdded(0), textDelta(1, 'x')],
      'delta-out-of-place',
    ],
    [
      'text for another part',
      [created, message0, partAdded(0), textDelta(0, 'x', 1)],
      'delta-out-of-place',
    ],
    ['the end of a part not open', [created, message0, textDone(0)], 'stop-out-of-place'],
    [
      'a part done while it is open',
      [created, message0, partAdded(0), partDone(0)],
      'stop-out-of-place',
    ],
    [
      'a part done while the next is open',
      [created, message0, partAdded(0), textDone(0), partAdded(0, 1), partDone(0)],
      'stop-out-of-place',
    ],
    [
      'arguments on a message',
      [created, message0, stream.argumentsDelta(0, '{}')],
      'delta-out-of-place',
    ],
    [
      'the end of arguments on a message',
      [
        created,
        message0,
        frame({ type: 'response.function_call_arguments.done', output_index: 0 }),
      ],
      'delta-out-of-place',
    ],
    [
      'a summary on a message',
      [created, message0, stream.summaryDelta(0, 0, 'x')],
      'delta-out-of-place',
    ],
    [
      'a summary part event on a message',
      [
        created,
        message0,
        frame({ type: 'response.reasoning_summary_part.added', output_index: 0, summary_index: 0 }),
      ],
      'delta-out-of-place',
    ],
    [
      'a summary out of order',
      [created, reasoning0, stream.summaryDelta(0, 1, 'x')],
      'delta-out-of-place',
    ],
    [
      'a summary over an open one',
      [created, reasoning0, stream.summaryDelta(0, 0, 'x'), stream.summaryDelta(0, 1, 'y')],
      'delta-out-of-place',
    ],
    [
      'the end of a summary not open',
      [created, reasoning0, stream.summaryDone(0, 0, 'x')],
      'stop-out-of-place',
    ],
    [
      'the end of a summary on a message',
      [created, message0, stream.summaryDone(0, 0, '')],
      'stop-out-of-place',
    ],
    [
      'the end of another summary',
      [created, reasoning0, stream.summaryDelta(0, 0, 'x'), stream.summaryDone(0, 1, 'x')],
      'stop-out-of-place',
    ],
    [
      'an item done that is not open',
      [created, done(0, { id: 'm1', type: 'message' })],
      'item-out-of-place',
    ],
    [
      'an item done at another index',
      [created, message0, done(1, { id: 'm1', type: 'message' })],
      'item-out-of-place',
    ],
    [
      'an item done of another type',
      [created, message0, done(0, { id: 'm1', type: 'reasoning' })],
      'item-out-of-place',
    ],
    [
      'an item done with another id',
      [created, message0, done(0, { id: 'm2', type: 'message' })],
      'item-out-of-place',
    ],
    [
      'a message done with an open part',
      [created, message0, partAdded(0), done(0, { id: 'm1', type: 'message' })],
      'item-out-of-place',
    ],
    [
      'a reasoning item done with an open summary',
      [
        created,
        reasoning0,
        stream.summaryDelta(0, 0, 'x'),
        done(0, { id: 'rs_1', type: 'reasoning' }),
      ],
      'item-out-of-place',
    ],
    [
      'a call done with another call id',
      [created, call0, done(0, { id: 'fc_1', type: 'function_call', call_id: 'c2' })],
      'item-out-of-place',
    ],
    [
      'a finish with an open item',
      [created, message0, stream.completed()],
      'finish-with-open-item',
    ],
    [
      'an incomplete response without a reason',
      [created, ...messageItem(0, 'm1', 'x'), stream.incomplete(null)],
      'finish-without-reason',
    ],
    [
      'content after the finish',
      [created, ...messageItem(0, 'm1', 'x'), stream.completed(), created],
      'content-after-finish',
    ],
    [
      'tool arguments that are not JSON',
      [created, ...callItem(0, 'fc_1', 'c1', '{'), stream.completed()],
      'tool-arguments-invalid',
    ],
  ] as const)('refuses %s', (_case, frames, diagnostic) => {
    expect(run(frames as readonly PiProtocolFrame[]).fault).toEqual(protocol(diagnostic))
  })

  it('refuses a frame after the decoder ended, and a second end', () => {
    const decoding = decoder()
    for (const item of [created, ...messageItem(0, 'm1', 'a'), stream.completed()])
      decoding.accept(item)
    expect('ok' in decoding.end()).toBe(true)
    expect(decoding.accept(created)).toEqual({ failure: protocol('frame-after-end') })
    expect(decoding.end()).toEqual({ failure: protocol('decoder-already-ended') })
  })

  it('refuses summary text and tool arguments beyond their limits', () => {
    const small = {
      ...LIMITS,
      maxReasoningText: 3,
      toolArguments: { ...LIMITS.toolArguments, maxBytes: 4 },
    }
    expect(run([created, reasoning0, stream.summaryDelta(0, 0, 'abcd')], small).fault).toEqual(
      protocol('reasoning-over-buffer-limit'),
    )
    expect(run([created, call0, stream.argumentsDelta(0, '{"q":1}')], small).fault).toEqual(
      protocol('tool-arguments-over-limit'),
    )
  })
})

describe('the events the reader refuses', () => {
  it.each([
    [
      'an event of an unknown type',
      { type: 'response.output_text.annotation.added' },
      'unsupported-event',
    ],
    ['a frame that is not an object', ['x'], 'event-not-object'],
    [
      'an item event without its index',
      { type: 'response.output_item.added', item: {} },
      'event-without-index',
    ],
    [
      'an item event without its item',
      { type: 'response.output_item.added', output_index: 0 },
      'item-without-members',
    ],
    [
      'an item of an unknown type',
      {
        type: 'response.output_item.added',
        output_index: 0,
        item: { id: 'w', type: 'web_search_call' },
      },
      'unsupported-item',
    ],
    [
      'a message not written by the assistant',
      {
        type: 'response.output_item.added',
        output_index: 0,
        item: { id: 'm', type: 'message', role: 'user' },
      },
      'unsupported-item',
    ],
    [
      'an item without an id',
      { type: 'response.output_item.added', output_index: 0, item: { type: 'reasoning' } },
      'item-without-members',
    ],
    [
      'a call without its call id',
      {
        type: 'response.output_item.added',
        output_index: 0,
        item: { id: 'f', type: 'function_call', name: 'n' },
      },
      'item-without-members',
    ],
    [
      'a done call without its call id',
      {
        type: 'response.output_item.done',
        output_index: 0,
        item: { id: 'f', type: 'function_call' },
      },
      'item-without-members',
    ],
    [
      'a done item of an unknown type',
      {
        type: 'response.output_item.done',
        output_index: 0,
        item: { id: 'f', type: 'image_generation_call' },
      },
      'unsupported-item',
    ],
    [
      'a refusal part',
      {
        type: 'response.content_part.added',
        output_index: 0,
        content_index: 0,
        part: { type: 'refusal', refusal: 'no' },
      },
      'unsupported-part',
    ],
    [
      'a text delta without its part index',
      { type: 'response.output_text.delta', output_index: 0, delta: 'x' },
      'event-without-index',
    ],
    [
      'a text delta without its text',
      { type: 'response.output_text.delta', output_index: 0, content_index: 0 },
      'event-without-text',
    ],
  ])('refuses %s', (_case, value, diagnostic) => {
    expect(run([frame(value)]).fault).toEqual(protocol(diagnostic))
  })
})

describe('the reasoning state payload', () => {
  const reasoning = {
    kind: 'object',
    entries: [
      { key: 'id', value: { kind: 'string', value: 'rs_1' } },
      { key: 'type', value: { kind: 'string', value: 'reasoning' } },
    ],
  } as const

  it('reads back what it sealed, keys in order', () => {
    const entries = [
      { type: 'reasoning', item: reasoning },
      { type: 'message', id: 'm1', parts: 12, phase: 'commentary' },
      { type: 'message', id: 'm2', parts: 0, phase: null },
      { type: 'function_call', id: 'fc_1', callId: 'c1' },
    ] as const
    const payload = sealItems(entries)
    expect(payload).toBe(
      '[{"item":{"id":"rs_1","type":"reasoning"},"type":"reasoning"},' +
        '{"id":"m1","parts":12,"phase":"commentary","type":"message"},' +
        '{"id":"m2","parts":0,"phase":null,"type":"message"},' +
        '{"call_id":"c1","id":"fc_1","type":"function_call"}]',
    )
    expect(readItems(payload)).toEqual(entries)
  })

  it.each([
    ['text that is not JSON', 'not json'],
    ['a value that is not a list', '{"type":"message"}'],
    ['an empty list', '[]'],
    ['an item that is not an object', '["x"]'],
    ['an item of another type', '[{"text":"t","type":"text"}]'],
    ['a reasoning entry without its item', '[{"type":"reasoning"}]'],
    ['a reasoning entry whose item is not an object', '[{"item":"r","type":"reasoning"}]'],
    [
      'a reasoning item of another type',
      '[{"item":{"id":"r","type":"message"},"type":"reasoning"}]',
    ],
    ['a reasoning item without its id', '[{"item":{"type":"reasoning"},"type":"reasoning"}]'],
    ['a message without its id', '[{"parts":1,"phase":null,"type":"message"}]'],
    ['a message without its part count', '[{"id":"m","phase":null,"type":"message"}]'],
    [
      'a message with a part count that is not a count',
      '[{"id":"m","parts":1.5,"phase":null,"type":"message"}]',
    ],
    [
      'a message with a part count of more than nine digits',
      '[{"id":"m","parts":1000000000,"phase":null,"type":"message"}]',
    ],
    ['a message without its phase', '[{"id":"m","parts":1,"type":"message"}]'],
    [
      'a message with a phase that is not a word',
      '[{"id":"m","parts":1,"phase":"A B","type":"message"}]',
    ],
    ['a call without its call id', '[{"id":"f","type":"function_call"}]'],
    ['a call with an empty id', '[{"call_id":"c","id":"","type":"function_call"}]'],
  ])('reads %s as not a payload of this engine', (_case, payload) => {
    expect(readItems(payload)).toBeNull()
  })
})
