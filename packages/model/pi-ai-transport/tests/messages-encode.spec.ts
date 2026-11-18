import { writeJsonText } from '@omne-harness/json-text'
import type { FixedModelRequest } from '@omne-harness/model-contract'
import { describe, expect, it } from 'vitest'
import type { PiFamilyBinding } from '../src/index.ts'
import { bindMessages, type MessagesRecord } from '../src/messages/index.ts'
import { sealThinking } from '../src/messages/reasoning.ts'
import {
  FORMAT,
  LIMITS,
  SCOPE,
  callBlock,
  engineProbe,
  fixedRequest,
  imageBlock,
  message,
  resultBlock,
  stateBlock,
  supplierOf,
  testMeter,
  textBlock,
  thinkingBlock,
  tool,
  type RequestParts,
} from './support/chat-record.ts'
import { messagesRecord } from './support/messages-record.ts'

const UNBOUND = messagesRecord({
  replay: { declaration: {}, formats: { produces: FORMAT, accepts: [FORMAT] }, binding: 'none' },
})

function bind(record: MessagesRecord = messagesRecord()): PiFamilyBinding {
  const probe = engineProbe()
  return bindMessages({
    record,
    supplier: supplierOf(record),
    meter: testMeter(record, probe),
    limits: LIMITS,
    release: async () => {},
  })
}

function encode(record: MessagesRecord, parts: RequestParts = {}) {
  const request: FixedModelRequest = fixedRequest(record, parts)
  return bind(record).encode({
    request,
    media: [],
    declaration: request.declarations[0],
    resent: [],
  })
}

function body(outcome: ReturnType<typeof encode>): Record<string, unknown> {
  if (!('ok' in outcome)) throw new Error(`encode failed: ${JSON.stringify(outcome.failure)}`)
  return JSON.parse(writeJsonText(outcome.ok.body)) as Record<string, unknown>
}

const adapterOf = (record: MessagesRecord) => supplierOf(record).adoption

function effort(record: MessagesRecord, value: string) {
  return {
    supplier: adapterOf(record),
    applied: { kind: 'reasoning-effort', value },
    origin: { kind: 'default', source: adapterOf(record) },
  }
}

const SIGNED = sealThinking([{ type: 'thinking', thinking: 'plan the call', signature: 'sig-1' }])

function answered(record: MessagesRecord): readonly unknown[] {
  return [
    message('u1', 'user', [textBlock('b1', 'weather in Oslo?')]),
    message(
      'a1',
      'assistant',
      [
        thinkingBlock('k1', 'plan the call'),
        stateBlock('s1', SIGNED),
        textBlock('t1', 'checking'),
        callBlock('c1', 'call-1', 'get_weather'),
        callBlock('c2', 'call-2', 'get_weather'),
      ],
      { replay: { scope: SCOPE, format: record.replay.formats.produces, at: [1] } },
    ),
    message('r1', 'tool', [resultBlock('x1', 'call-1'), textBlock('x2', 'sunny')]),
    message('r2', 'tool', [resultBlock('y1', 'call-2'), imageBlock('y2')]),
    message('m1', 'system_reminder', [textBlock('z1', 'context.window-usage: 2% used')]),
  ]
}

describe('encode: the body', () => {
  it('writes the route, the pinned upstream, stream, the output ceiling and adaptive thinking that drops a mismatched block', () => {
    const outcome = encode(messagesRecord(), { system: [textBlock('s1', 'be brief')] })
    expect(writeJsonText(('ok' in outcome && outcome.ok.body) || { kind: 'null' })).toBe(
      '{"max_tokens":4096,"messages":[{"content":[{"text":"hello","type":"text"}],"role":"user"}],' +
        '"model":"lab/model-a","provider":{"allow_fallbacks":false,"order":["lab"]},"stream":true,' +
        '"system":[{"text":"be brief","type":"text"}],' +
        '"thinking":{"block_binding":{"prefix_mismatch_behavior":"drop_block"},"display":"summarized","type":"adaptive"}}',
    )
  })

  it('leaves the block binding out for a model that does not bind its reasoning to the prefix, and the display out when the record has none', () => {
    const record = messagesRecord({
      ...UNBOUND,
      wire: { ...UNBOUND.wire, thinking: { display: null } },
    })
    expect(body(encode(record)).thinking).toEqual({ type: 'adaptive' })
  })

  it('writes the effort under output_config, and stop sequences under their own name', () => {
    const record = messagesRecord()
    const parsed = body(
      encode(record, {
        parameterAdoptions: [
          effort(record, 'high'),
          {
            supplier: adapterOf(record),
            applied: { kind: 'stop', value: ['END'] },
            origin: { kind: 'default', source: adapterOf(record) },
          },
        ],
      }),
    )
    expect(parsed.output_config).toEqual({ effort: 'high' })
    expect(parsed.stop_sequences).toEqual(['END'])
  })

  it('marks the last part of the last message for the cache with the record ttl', () => {
    const record = messagesRecord({
      wire: { ...messagesRecord().wire, cache: { kind: 'last-message', ttl: '1h' } },
    })
    const messages = body(encode(record)).messages as { content: unknown[] }[]
    expect(messages.at(-1)?.content.at(-1)).toEqual({
      type: 'text',
      text: 'hello',
      cache_control: { type: 'ephemeral', ttl: '1h' },
    })
  })
})

describe('encode: the conversation', () => {
  it('writes carried thinking first, then text and tool uses; results of one turn go back in one user message', () => {
    const parsed = body(
      encode(UNBOUND, { messages: answered(UNBOUND), tools: [tool('get_weather')] }),
    )
    expect(parsed.messages).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'weather in Oslo?' }] },
      {
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: 'plan the call', signature: 'sig-1' },
          { type: 'text', text: 'checking' },
          { type: 'tool_use', id: 'call-1', name: 'get_weather', input: { q: 'x' } },
          { type: 'tool_use', id: 'call-2', name: 'get_weather', input: { q: 'x' } },
        ],
      },
      {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'call-1',
            content: [{ type: 'text', text: 'sunny' }],
          },
          {
            type: 'tool_result',
            tool_use_id: 'call-2',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: 'image/png', data: 'iVBORw0KGgo=' },
              },
            ],
          },
        ],
      },
      { role: 'user', content: [{ type: 'text', text: 'context.window-usage: 2% used' }] },
    ])
    expect(parsed.tools).toEqual([
      { name: 'get_weather', description: 'get_weather tool', input_schema: { type: 'object' } },
    ])
    expect(parsed.tool_choice).toEqual({ type: 'auto' })
  })

  it('does not carry reasoning state of another format, and says so', () => {
    const record = messagesRecord({
      ...UNBOUND,
      replay: { ...UNBOUND.replay, formats: { produces: 'other-v1', accepts: ['other-v1'] } },
    })
    const messages = answered(UNBOUND)
    const outcome = encode(record, { messages, tools: [tool('get_weather')] })
    const assistant = (body(outcome).messages as { content: { type: string }[] }[])[1]
    expect(assistant?.content.map(part => part.type)).toEqual(['text', 'tool_use', 'tool_use'])
    if (!('ok' in outcome)) throw new Error('encode')
    expect(outcome.ok.diagnostics).toMatchObject([{ kind: 'replay-omitted', reason: 'format' }])
  })

  it('does not carry reasoning state recorded without a prefix to a model that binds it', () => {
    const outcome = encode(messagesRecord(), {
      messages: answered(messagesRecord()),
      tools: [tool('get_weather')],
    })
    if (!('ok' in outcome)) throw new Error('encode')
    expect(outcome.ok.diagnostics).toMatchObject([{ kind: 'replay-omitted', reason: 'no-prefix' }])
    expect(writeJsonText(outcome.ok.body)).not.toContain('sig-1')
  })
})

describe('encode: what the model does not accept is refused before anything is sent', () => {
  const lastAssistant = [
    message('u1', 'user', [textBlock('b1', 'hi')]),
    message('a1', 'assistant', [textBlock('t1', 'prefill')]),
  ]

  it.each([
    ['a forced tool call', { toolChoice: 'required', tools: [tool('get_weather')] }, 'toolChoice'],
    [
      'a named tool',
      { toolChoice: { name: 'get_weather' }, tools: [tool('get_weather')] },
      'toolChoice',
    ],
    ['a conversation that ends with the assistant', { messages: lastAssistant }, '/messages/1'],
  ])('refuses %s', (_case, parts, field) => {
    const record = messagesRecord()
    expect(encode(record, parts as RequestParts)).toEqual({
      failure: { kind: 'unsupported', field, adapter: adapterOf(record) },
    })
  })

  it('refuses effort none where the record maps it unsupported', () => {
    const record = messagesRecord()
    expect(encode(record, { parameterAdoptions: [effort(record, 'none')] })).toMatchObject({
      failure: { kind: 'unsupported' },
    })
  })

  it.each([
    ['a forced tool call', 'required', { type: 'any' }],
    ['a named tool', { name: 'get_weather' }, { type: 'tool', name: 'get_weather' }],
  ])('writes %s for a model that accepts it', (_case, toolChoice, json) => {
    const record = messagesRecord({ accepts: { forcedToolChoice: true, endsWithAssistant: false } })
    expect(body(encode(record, { toolChoice, tools: [tool('get_weather')] })).tool_choice).toEqual(
      json,
    )
  })

  it('refuses at binding a record that maps a parameter the interface has no member for', () => {
    const base = messagesRecord()
    const record = messagesRecord({
      parameters: {
        ...base.parameters,
        seed: {
          support: 'supported',
          default: { kind: 'absent' },
          accept: {},
          wire: { field: 'seed' },
        },
      },
    })
    expect(() => bind(record)).toThrow(/no member for seed/)
  })
})
