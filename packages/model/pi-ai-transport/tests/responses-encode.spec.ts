import { writeJsonText } from '@omne-harness/json-text'
import type { FixedModelRequest } from '@omne-harness/model-contract'
import { describe, expect, it } from 'vitest'
import type { PiFamilyBinding } from '../src/index.ts'
import { bindResponses, type ItemEntry, type ResponsesRecord } from '../src/responses/index.ts'
import { sealItems } from '../src/responses/reasoning.ts'
import {
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
import { ITEMS_FORMAT, responsesRecord } from './support/responses-record.ts'

function bind(record: ResponsesRecord = responsesRecord()): PiFamilyBinding {
  return bindResponses({
    record,
    supplier: supplierOf(record),
    meter: testMeter(record, engineProbe()),
    limits: LIMITS,
    release: async () => {},
  })
}

function encode(record: ResponsesRecord, parts: RequestParts = {}) {
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

const adapterOf = (record: ResponsesRecord) => supplierOf(record).adoption

function adopted(record: ResponsesRecord, kind: string, value: unknown) {
  return {
    supplier: adapterOf(record),
    applied: { kind, value },
    origin: { kind: 'default', source: adapterOf(record) },
  }
}

const str = (value: string) => ({ kind: 'string', value }) as const
const REASONING_ITEM = {
  kind: 'object',
  entries: [
    { key: 'encrypted_content', value: str('cipher') },
    { key: 'id', value: str('rs_1') },
    { key: 'summary', value: { kind: 'array', items: [] } },
    { key: 'type', value: str('reasoning') },
  ],
} as const
const ENTRIES: readonly ItemEntry[] = [
  { type: 'reasoning', item: REASONING_ITEM },
  { type: 'message', id: 'msg_1', parts: 1, phase: 'commentary' },
  { type: 'function_call', id: 'fc_1', callId: 'call-1' },
]

function answered(payload: string, format = ITEMS_FORMAT): readonly unknown[] {
  return [
    message('u1', 'user', [textBlock('b1', 'weather in Oslo?')]),
    message(
      'a1',
      'assistant',
      [
        thinkingBlock('k1', 'plan the call'),
        textBlock('t1', 'checking'),
        callBlock('c1', 'call-1', 'get_weather'),
        stateBlock('s1', payload),
      ],
      { replay: { scope: SCOPE, format, at: [3] } },
    ),
    message('r1', 'tool', [resultBlock('x1', 'call-1'), textBlock('x2', 'sunny')]),
    message('m1', 'system_reminder', [textBlock('z1', 'context.window-usage: 2% used')]),
  ]
}

const USER = {
  type: 'message',
  role: 'user',
  content: [{ type: 'input_text', text: 'weather in Oslo?' }],
}
const RESULT = { type: 'function_call_output', call_id: 'call-1', output: 'sunny' }
const REMINDER = {
  type: 'message',
  role: 'developer',
  content: [{ type: 'input_text', text: 'context.window-usage: 2% used' }],
}

describe('encode: the body', () => {
  it('writes the route, the pinned upstream, stream, no storage, the encrypted reasoning, and the system prompt as the first developer message', () => {
    const outcome = encode(responsesRecord(), { system: [textBlock('s1', 'be brief')] })
    expect(writeJsonText(('ok' in outcome && outcome.ok.body) || { kind: 'null' })).toBe(
      '{"include":["reasoning.encrypted_content"],"input":[' +
        '{"content":[{"text":"be brief","type":"input_text"}],"role":"developer","type":"message"},' +
        '{"content":[{"text":"hello","type":"input_text"}],"role":"user","type":"message"}],' +
        '"model":"lab/model-a","provider":{"allow_fallbacks":false,"order":["lab"]},' +
        '"store":false,"stream":true}',
    )
  })

  it('writes the system prompt as instructions where the record says so, its text blocks joined', () => {
    const record = responsesRecord({ wire: { ...responsesRecord().wire, system: 'instructions' } })
    const sent = body(
      encode(record, { system: [textBlock('s1', 'be '), textBlock('s2', 'brief')] }),
    )
    expect(sent.instructions).toBe('be brief')
    expect(sent.input).toEqual([
      { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'hello' }] },
    ])
  })

  it('writes the output limit under its own name, and the effort with a summary where the record asks for one', () => {
    const record = responsesRecord({
      wire: { ...responsesRecord().wire, reasoning: { summary: 'auto' } },
    })
    const sent = body(
      encode(record, {
        parameterAdoptions: [
          adopted(record, 'max-output-tokens', '512'),
          adopted(record, 'reasoning-effort', 'max'),
        ],
      }),
    )
    expect(sent.max_output_tokens).toBe(512)
    expect(sent.reasoning).toEqual({ effort: 'xhigh', summary: 'auto' })
    expect(Object.keys(sent)).not.toContain('max_tokens')
    expect(body(encode(responsesRecord())).reasoning).toBeUndefined()
  })

  it('writes the sampling parameters the record maps', () => {
    const base = responsesRecord()
    const range = {
      support: 'supported',
      default: { kind: 'absent' },
      accept: { min: 0, max: 2 },
    } as const
    const record = responsesRecord({
      parameters: {
        ...base.parameters,
        temperature: { ...range, wire: { field: 'temperature' } },
        'top-p': { ...range, wire: { field: 'top_p' } },
        'frequency-penalty': { ...range, wire: { field: 'frequency_penalty' } },
        'presence-penalty': { ...range, wire: { field: 'presence_penalty' } },
        stop: {
          support: 'supported',
          default: { kind: 'absent' },
          accept: { maxItems: 2, maxLength: 8 },
          wire: { field: 'stop' },
        },
      },
    })
    const sent = body(
      encode(record, {
        parameterAdoptions: [
          adopted(record, 'temperature', 0.5),
          adopted(record, 'top-p', 0.9),
          adopted(record, 'frequency-penalty', 0.1),
          adopted(record, 'presence-penalty', 0.2),
          adopted(record, 'stop', ['END']),
        ],
      }),
    )
    expect(sent).toMatchObject({
      temperature: 0.5,
      top_p: 0.9,
      frequency_penalty: 0.1,
      presence_penalty: 0.2,
      stop: ['END'],
    })
  })
})

describe('encode: the conversation', () => {
  it('rebuilds a continuable reply in the order of its items, with their ids and phase; results and reminders follow', () => {
    const sent = body(
      encode(responsesRecord(), {
        messages: answered(sealItems(ENTRIES)),
        tools: [tool('get_weather')],
      }),
    )
    expect(sent.input).toEqual([
      USER,
      { encrypted_content: 'cipher', id: 'rs_1', summary: [], type: 'reasoning' },
      {
        type: 'message',
        role: 'assistant',
        id: 'msg_1',
        status: 'completed',
        phase: 'commentary',
        content: [{ type: 'output_text', text: 'checking', annotations: [] }],
      },
      {
        type: 'function_call',
        id: 'fc_1',
        call_id: 'call-1',
        name: 'get_weather',
        arguments: '{"q":"x"}',
        status: 'completed',
      },
      RESULT,
      REMINDER,
    ])
    expect(sent.tools).toEqual([
      {
        type: 'function',
        name: 'get_weather',
        description: 'get_weather tool',
        parameters: { type: 'object' },
      },
    ])
    expect(sent.tool_choice).toBe('auto')
  })

  it('sends a reply that is not continuable as its text and calls only, and says why', () => {
    const outcome = encode(responsesRecord(), {
      messages: answered(sealItems(ENTRIES), 'other-v1'),
      tools: [tool('get_weather')],
    })
    expect(body(outcome).input).toEqual([
      USER,
      {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: 'checking', annotations: [] }],
      },
      { type: 'function_call', call_id: 'call-1', name: 'get_weather', arguments: '{"q":"x"}' },
      RESULT,
      REMINDER,
    ])
    if (!('ok' in outcome)) throw new Error('encode')
    expect(outcome.ok.diagnostics).toMatchObject([{ kind: 'replay-omitted', reason: 'format' }])
    expect(outcome.ok.replayCarried).toBe(false)
  })

  it('says it carries reasoning state when a continuable reply goes back', () => {
    const outcome = encode(responsesRecord(), {
      messages: answered(sealItems(ENTRIES)),
      tools: [tool('get_weather')],
    })
    expect('ok' in outcome && outcome.ok.replayCarried).toBe(true)
  })

  it.each([
    ['a payload this engine did not seal', 'not a payload'],
    [
      'a payload with more text than the reply has',
      sealItems([{ type: 'message', id: 'm', parts: 2, phase: null }]),
    ],
    [
      'a payload with fewer items than the reply has',
      sealItems([{ type: 'reasoning', item: REASONING_ITEM }]),
    ],
    [
      'a payload whose call is another call',
      sealItems([
        { type: 'message', id: 'm', parts: 1, phase: null },
        { type: 'function_call', id: 'f', callId: 'call-9' },
      ]),
    ],
  ])('refuses %s as not replayable', (_case, payload) => {
    expect(
      encode(responsesRecord(), { messages: answered(payload), tools: [tool('get_weather')] }),
    ).toEqual({
      failure: { kind: 'invalid', field: 'reasoning_state', reason: 'payload-not-replayable' },
    })
  })

  it('refuses a payload this engine did not seal on a reply with nothing else to send', () => {
    expect(
      encode(responsesRecord(), {
        messages: [
          message('a1', 'assistant', [stateBlock('s1', 'not a payload')], {
            replay: { scope: SCOPE, format: ITEMS_FORMAT, at: [0] },
          }),
          message('u1', 'user', [textBlock('b1', 'next')]),
        ],
      }),
    ).toEqual({
      failure: { kind: 'invalid', field: 'reasoning_state', reason: 'payload-not-replayable' },
    })
  })

  it('writes the results of tool calls as their text, and their images in one user message after them', () => {
    const sent = body(
      encode(responsesRecord(), {
        messages: [
          message('a1', 'assistant', [callBlock('c1', 'call-1'), callBlock('c2', 'call-2')]),
          message('r1', 'tool', [
            resultBlock('x1', 'call-1'),
            textBlock('x2', 'ok'),
            imageBlock('x3'),
          ]),
          message('r2', 'tool', [
            resultBlock('y1', 'call-2'),
            textBlock('y2', 'a'),
            textBlock('y3', 'b'),
          ]),
        ],
        tools: [tool('lookup')],
      }),
    )
    expect((sent.input as unknown[]).slice(2)).toEqual([
      { type: 'function_call_output', call_id: 'call-1', output: 'ok' },
      { type: 'function_call_output', call_id: 'call-2', output: 'ab' },
      {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_image', image_url: 'data:image/png;base64,iVBORw0KGgo=' }],
      },
    ])
  })

  it('refuses an image of a media type the record does not take', () => {
    const record = responsesRecord()
    expect(
      encode(record, { messages: [message('u1', 'user', [imageBlock('i1', 'image/tiff')])] }),
    ).toEqual({
      failure: { kind: 'unsupported', field: '/messages/0/blocks/0', adapter: adapterOf(record) },
    })
  })
})

describe('encode: the explicit cache', () => {
  const CACHED = responsesRecord({
    wire: { ...responsesRecord().wire, cache: { kind: 'explicit', ttl: '30m' } },
  })

  function digests(prefix: string): string {
    const part = (label: string) =>
      prefix
        .split('.')
        .find(item => item.startsWith(`${label}:`))
        ?.slice(2)
    return `${part('s')}${part('t')}`
  }

  it('writes a key from the system prompt and the tools, the options, and a breakpoint on the last text of the last message', () => {
    const outcome = encode(CACHED, {
      system: [textBlock('s1', 'be brief')],
      messages: [
        message('u1', 'user', [
          textBlock('b1', 'first'),
          textBlock('b2', 'second'),
          imageBlock('i1'),
        ]),
      ],
    })
    const sent = body(outcome)
    if (!('ok' in outcome)) throw new Error('encode')
    expect(sent.prompt_cache_key).toBe(digests(outcome.ok.replayPrefix))
    expect(sent.prompt_cache_key).toMatch(/^[0-9a-f]{64}$/)
    expect(sent.prompt_cache_options).toEqual({ mode: 'explicit', ttl: '30m' })
    expect((sent.input as { content: unknown[] }[])[1]?.content).toEqual([
      { type: 'input_text', text: 'first' },
      { type: 'input_text', text: 'second', prompt_cache_breakpoint: { mode: 'explicit' } },
      { type: 'input_image', image_url: 'data:image/png;base64,iVBORw0KGgo=' },
    ])
  })

  it('keeps the key over a session while the system prompt and tools stay, and changes it when they change', () => {
    const key = (parts: RequestParts) => body(encode(CACHED, parts)).prompt_cache_key
    const system = [textBlock('s1', 'be brief')]
    const first = key({ system })
    expect(
      key({
        system,
        messages: [
          message('u1', 'user', [textBlock('b1', 'hello')]),
          message('a1', 'assistant', [textBlock('t1', 'hi')]),
          message('u2', 'user', [textBlock('b2', 'more')]),
        ],
      }),
    ).toBe(first)
    expect(key({ system: [textBlock('s1', 'be long')] })).not.toBe(first)
    expect(key({ system, tools: [tool('lookup')] })).not.toBe(first)
  })

  it('puts the breakpoint on the last message with text when the input ends with tool results', () => {
    const sent = body(
      encode(CACHED, {
        messages: [
          message('u1', 'user', [textBlock('b1', 'go')]),
          message('a1', 'assistant', [textBlock('t1', 'on it'), callBlock('c1', 'call-1')]),
          message('r1', 'tool', [resultBlock('x1', 'call-1'), textBlock('x2', 'done')]),
        ],
        tools: [tool('lookup')],
      }),
    )
    const input = sent.input as { content?: unknown[] }[]
    expect(input[1]?.content).toEqual([
      {
        type: 'output_text',
        text: 'on it',
        annotations: [],
        prompt_cache_breakpoint: { mode: 'explicit' },
      },
    ])
    expect(JSON.stringify(input.slice(2))).not.toContain('prompt_cache_breakpoint')
  })

  it('refuses a request with no text the model sees to mark', () => {
    expect(
      encode(CACHED, { messages: [message('u1', 'user', [textBlock('b1', 'hidden', false)])] }),
    ).toEqual({
      failure: { kind: 'unsupported', field: 'no-cache-target', adapter: adapterOf(CACHED) },
    })
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
    const record = responsesRecord()
    expect(encode(record, parts as RequestParts)).toEqual({
      failure: { kind: 'unsupported', field, adapter: adapterOf(record) },
    })
  })

  it.each([
    ['a forced tool call', 'required', 'required'],
    ['a named tool', { name: 'get_weather' }, { type: 'function', name: 'get_weather' }],
  ])('writes %s for a model that accepts it', (_case, toolChoice, json) => {
    const record = responsesRecord({ accepts: { forcedToolChoice: true, endsWithAssistant: true } })
    expect(body(encode(record, { toolChoice, tools: [tool('get_weather')] })).tool_choice).toEqual(
      json,
    )
  })

  it('writes a conversation that ends with the assistant for a model that accepts it', () => {
    const record = responsesRecord({
      accepts: { forcedToolChoice: false, endsWithAssistant: true },
    })
    expect((body(encode(record, { messages: lastAssistant })).input as unknown[]).at(-1)).toEqual({
      type: 'message',
      role: 'assistant',
      content: [{ type: 'output_text', text: 'prefill', annotations: [] }],
    })
  })

  it('refuses at binding a record that maps seed, which the interface has no member for', () => {
    const base = responsesRecord()
    const record = responsesRecord({
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
