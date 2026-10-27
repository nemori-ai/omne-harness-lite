import { createHash } from 'node:crypto'
import { writeJsonText, type JsonValue } from '@omne-harness/json-text'
import type { FixedModelRequest, ReplayDeclaration } from '@omne-harness/model-contract'
import type { TransportDispatch } from '@omne-harness/model-contract/provider'
import { describe, expect, it } from 'vitest'
import {
  bindChatCompletions,
  type ChatCompletionsRecord,
  type GatewayParam,
  type VendorHooks,
} from '../src/chat-completions/index.ts'
import { composeFamilies, defineFamily, type PiFamilyBinding } from '../src/index.ts'
import {
  EXTENSION,
  LIMITS,
  FORMAT,
  OWNER,
  SCOPE,
  callBlock,
  engineProbe,
  fixedRequest,
  imageBlock,
  message,
  resultBlock,
  stateBlock,
  supplierOf,
  testHooks,
  testMeter,
  testRecord,
  textBlock,
  thinkingBlock,
  tool,
  declarationOf,
  type EngineProbe,
  type RequestParts,
} from './support/chat-record.ts'

function bind(
  record: ChatCompletionsRecord = testRecord(),
  probe: EngineProbe = engineProbe(),
  hooks: VendorHooks = testHooks(probe),
): PiFamilyBinding {
  return bindChatCompletions({
    record,
    supplier: supplierOf(record),
    hooks,
    meter: testMeter(record, probe),
    limits: LIMITS,
    release: async () => {
      probe.released += 1
    },
  })
}

/** The encode input of a request: its one declaration, no media and the resent messages. */
function inputOf(request: FixedModelRequest, resent: TransportDispatch['resent'] = []) {
  return { request, media: [], declaration: request.declarations[0], resent }
}

function encode(record: ChatCompletionsRecord, parts: RequestParts = {}, probe = engineProbe()) {
  return bind(record, probe).encode(inputOf(fixedRequest(record, parts)))
}

/** The body of a successful encode as plain JSON, for structural comparison. */
function body(outcome: ReturnType<typeof encode>): Record<string, unknown> {
  if (!('ok' in outcome)) throw new Error(`encode failed: ${JSON.stringify(outcome.failure)}`)
  const parsed: unknown = JSON.parse(writeJsonText(outcome.ok.body))
  if (typeof parsed !== 'object' || parsed === null) throw new Error('body is not an object')
  return Object.fromEntries(Object.entries(parsed))
}

function messagesOf(outcome: ReturnType<typeof encode>): unknown {
  return body(outcome).messages
}

const adapterOf = (record: ChatCompletionsRecord) => supplierOf(record).adoption

describe('encode: the body', () => {
  it('writes sorted-key JSON with the route model, the pinned provider, stream and the fixed fields', () => {
    const record = testRecord()
    const outcome = encode(record, {
      system: [textBlock('s1', 'be brief')],
      parameterAdoptions: [
        {
          supplier: adapterOf(record),
          applied: { kind: 'max-output-tokens', value: '1000' },
          origin: { kind: 'default', source: adapterOf(record) },
        },
        {
          supplier: adapterOf(record),
          applied: { kind: 'reasoning-effort', value: 'max' },
          origin: { kind: 'default', source: adapterOf(record) },
        },
      ],
    })
    if (!('ok' in outcome)) throw new Error('encode failed')
    expect(writeJsonText(outcome.ok.body)).toBe(
      '{"max_tokens":1000,"messages":[{"content":"be brief","role":"developer"},' +
        '{"content":"hello","role":"user"}],"model":"lab/model-a",' +
        '"provider":{"allow_fallbacks":false,"order":["Lab"],"require_parameters":true},' +
        '"reasoning":{"effort":"xhigh"},"store":false,"stream":true}',
    )
  })

  it('writes the gateway effort max where the record maps it', () => {
    const base = testRecord()
    const rule = base.parameters['reasoning-effort']
    if (rule.support !== 'supported') throw new Error('the test record supports reasoning effort')
    const record = testRecord({
      parameters: {
        ...base.parameters,
        'reasoning-effort': {
          ...rule,
          wire: {
            ...rule.wire,
            max: { field: 'reasoning.effort', value: 'max' },
          },
        },
      },
    })
    const effort = {
      supplier: adapterOf(record),
      applied: { kind: 'reasoning-effort', value: 'max' },
      origin: { kind: 'default', source: adapterOf(record) },
    }
    expect(body(encode(record, { parameterAdoptions: [effort] })).reasoning).toEqual({
      effort: 'max',
    })
  })

  it('writes no usage switch and no member outside the gateway vocabulary', () => {
    const keys = Object.keys(body(encode(testRecord())))
    expect(keys).not.toContain('stream_options')
    expect(keys).not.toContain('usage')
  })

  it('writes only the planned values of this supplier', () => {
    const record = testRecord()
    const other = { ...adapterOf(record), name: 'other' }
    const parsed = body(
      encode(record, {
        parameterAdoptions: [
          {
            supplier: other,
            applied: { kind: 'temperature', value: 0.3 },
            origin: { kind: 'default', source: other },
          },
        ],
      }),
    )
    expect(parsed).not.toHaveProperty('temperature')
  })

  it('refuses two applied values for one field as invalid, never throws', () => {
    // Two suppliers that differ only in their credential share one adoption, so the request holds
    // the planned values of both for this binding.
    const record = testRecord()
    const planned = {
      supplier: adapterOf(record),
      applied: { kind: 'max-output-tokens', value: '1000' },
      origin: { kind: 'default', source: adapterOf(record) },
    }
    expect(encode(record, { parameterAdoptions: [planned, planned] })).toEqual({
      failure: { kind: 'invalid', field: 'parameterAdoptions', reason: 'repeated' },
    })
  })

  it('refuses an applied value that the record cannot write', () => {
    const record = testRecord()
    const outcome = encode(record, {
      parameterAdoptions: [
        {
          supplier: adapterOf(record),
          applied: { kind: 'seed', value: '1' },
          origin: { kind: 'default', source: adapterOf(record) },
        },
      ],
    })
    expect(outcome).toEqual({
      failure: { kind: 'unsupported', field: 'seed', adapter: adapterOf(record) },
    })
  })

  it('computes requestBytes from the bytes that the transport sends', () => {
    const outcome = encode(testRecord(), {
      messages: [message('u1', 'user', [textBlock('b1', 'héllo 世界')])],
    })
    if (!('ok' in outcome)) throw new Error('encode failed')
    expect(outcome.ok.representation.requestBytes).toBe(
      String(Buffer.byteLength(writeJsonText(outcome.ok.body), 'utf8')),
    )
  })
})

describe('encode: roles and content', () => {
  const history = [
    message('r1', 'system_reminder', [textBlock('b2', 'remember')]),
    message('i1', 'tool_internal', [textBlock('b3', 'internal')]),
    message('u1', 'user', [textBlock('b4', 'hidden', false), textBlock('b5', 'visible')]),
  ]

  it('maps the instruction and the reminder by the record roles; tool_internal and hidden blocks stay out', () => {
    const messages = messagesOf(
      encode(testRecord(), { system: [textBlock('s1', 'rules')], messages: history }),
    )
    expect(messages).toEqual([
      { role: 'developer', content: 'rules' },
      { role: 'user', content: 'remember' },
      { role: 'user', content: 'visible' },
    ])
  })

  it('writes every content as an array of parts when the record says parts', () => {
    const record = testRecord({
      wire: {
        ...testRecord().wire,
        content: 'parts',
        roles: { instruction: 'system', reminder: 'system' },
      },
    })
    const messages = messagesOf(
      encode(record, { system: [textBlock('s1', 'rules')], messages: history.slice(0, 1) }),
    )
    expect(messages).toEqual([
      { role: 'system', content: [{ type: 'text', text: 'rules' }] },
      { role: 'system', content: [{ type: 'text', text: 'remember' }] },
    ])
  })

  it('writes a content of several parts as an array even when compact', () => {
    const messages = messagesOf(
      encode(testRecord(), {
        messages: [message('u1', 'user', [textBlock('b1', 'a'), imageBlock('b2')])],
      }),
    )
    expect(messages).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'a' },
          {
            type: 'image_url',
            image_url: { url: 'data:image/png;base64,iVBORw0KGgo=', detail: 'auto' },
          },
        ],
      },
    ])
  })

  it('writes empty text parts as they are, and leaves out a message whose every block is hidden', () => {
    const messages = messagesOf(
      encode(testRecord(), {
        system: [textBlock('s1', '')],
        messages: [
          message('u1', 'user', [textBlock('b1', '')]),
          message('a1', 'assistant', [textBlock('b2', ''), textBlock('b3', 'x')]),
          message('u2', 'user', [textBlock('b4', 'hidden', false)]),
          message('u3', 'user', [textBlock('b5', 'next')]),
        ],
      }),
    )
    expect(messages).toEqual([
      { role: 'developer', content: '' },
      { role: 'user', content: '' },
      {
        role: 'assistant',
        content: [
          { type: 'text', text: '' },
          { type: 'text', text: 'x' },
        ],
      },
      { role: 'user', content: 'next' },
    ])
  })

  it('refuses an image when the record takes none or not its media type', () => {
    const record = testRecord()
    const path = '/messages/0/blocks/0'
    const noImages = testRecord({ wire: { ...record.wire, image: null } })
    const gif = [message('u1', 'user', [imageBlock('b1', 'image/gif')])]
    expect(encode(noImages, { messages: [message('u1', 'user', [imageBlock('b1')])] })).toEqual({
      failure: { kind: 'unsupported', field: path, adapter: adapterOf(noImages) },
    })
    expect(encode(record, { messages: gif })).toEqual({
      failure: { kind: 'unsupported', field: path, adapter: adapterOf(record) },
    })
  })
})

describe('encode: tool calls and results', () => {
  const longId = 'toolu|' + 'x'.repeat(80)
  const hashed = `call_${createHash('sha256').update(longId).digest('base64url').slice(0, 32)}`

  it('keeps a valid call id, normalizes any other, and writes the tool message with the same id', () => {
    const messages = messagesOf(
      encode(testRecord(), {
        messages: [
          message('u1', 'user', [textBlock('b1', 'go')]),
          message('a1', 'assistant', [callBlock('c1', 'call_ok'), callBlock('c2', longId)]),
          message('t1', 'tool', [resultBlock('r1', 'call_ok'), textBlock('b2', 'one')]),
          message('t2', 'tool', [resultBlock('r2', longId), textBlock('b3', 'two')]),
        ],
      }),
    )
    expect(messages).toEqual([
      { role: 'user', content: 'go' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          { id: 'call_ok', type: 'function', function: { name: 'lookup', arguments: '{"q":"x"}' } },
          { id: hashed, type: 'function', function: { name: 'lookup', arguments: '{"q":"x"}' } },
        ],
      },
      { role: 'tool', tool_call_id: 'call_ok', content: 'one' },
      { role: 'tool', tool_call_id: hashed, content: 'two' },
    ])
  })

  it('moves the images of a run of tool results into one user message after the run', () => {
    const messages = messagesOf(
      encode(testRecord(), {
        messages: [
          message('a1', 'assistant', [callBlock('c1', 'call_a'), callBlock('c2', 'call_b')]),
          message('t1', 'tool', [resultBlock('r1', 'call_a'), imageBlock('b1')]),
          message('t2', 'tool', [
            resultBlock('r2', 'call_b'),
            textBlock('b2', 'ok'),
            imageBlock('b3'),
          ]),
        ],
      }),
    )
    const image = {
      type: 'image_url',
      image_url: { url: 'data:image/png;base64,iVBORw0KGgo=', detail: 'auto' },
    }
    expect(messages).toEqual([
      expect.objectContaining({ role: 'assistant' }),
      { role: 'tool', tool_call_id: 'call_a', content: '' },
      { role: 'tool', tool_call_id: 'call_b', content: 'ok' },
      { role: 'user', content: [image, image] },
    ])
  })

  it('refuses a call without a result, and a result without a call, as invalid', () => {
    const record = testRecord()
    expect(
      encode(record, {
        messages: [message('a1', 'assistant', [textBlock('b1', 'x'), callBlock('c1', 'call_a')])],
      }),
    ).toEqual({
      failure: { kind: 'invalid', field: '/messages/0/blocks/1', reason: 'orphan-tool-call' },
    })
    expect(
      encode(record, { messages: [message('t1', 'tool', [resultBlock('r1', 'call_a')])] }),
    ).toEqual({
      failure: { kind: 'invalid', field: '/messages/0/blocks/0', reason: 'orphan-tool-result' },
    })
  })

  it('writes tools through the schema hook, with the tool choice', () => {
    const parsed = body(
      encode(testRecord(), { tools: [tool('lookup')], toolChoice: { name: 'lookup' } }),
    )
    expect(parsed.tools).toEqual([
      {
        type: 'function',
        function: { name: 'lookup', description: 'lookup tool', parameters: { type: 'object' } },
      },
    ])
    expect(parsed.tool_choice).toEqual({ type: 'function', function: { name: 'lookup' } })
  })

  it('returns the refusal of the schema hook with the tool path', () => {
    const refused: JsonValue = {
      kind: 'object',
      entries: [{ key: 'refuse', value: { kind: 'boolean', value: true } }],
    }
    const outcome = encode(testRecord(), { tools: [tool('lookup', refused)] })
    expect(outcome).toMatchObject({ failure: { kind: 'unsupported', field: '/tools/0/schema' } })
  })

  it('converts one tool declaration through the tools adapter in the same form', () => {
    const binding = bind()
    const converted = binding.tools.convertToModelPayload({
      name: 'lookup',
      description: 'lookup tool',
      argumentsSchema: {
        kind: 'object',
        entries: [{ key: 'type', value: { kind: 'string', value: 'object' } }],
      },
    })
    if (!('ok' in converted)) throw new Error('convert failed')
    expect(writeJsonText(converted.ok)).toBe(
      '{"function":{"description":"lookup tool","name":"lookup","parameters":{"type":"object"}},"type":"function"}',
    )
  })
})

describe('encode: cache placement', () => {
  const cached = (ttl: '5m' | '1h') =>
    testRecord({ wire: { ...testRecord().wire, cache: { kind: 'last-message', ttl } } })
  const control = { type: 'ephemeral', ttl: '1h' }

  it('marks the last non-empty text part of the last message, turning compact text into a part', () => {
    const messages = messagesOf(
      encode(cached('1h'), {
        messages: [
          message('u1', 'user', [textBlock('b1', 'a'), imageBlock('b2'), textBlock('b3', '')]),
        ],
      }),
    )
    expect(messages).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'a', cache_control: control },
          {
            type: 'image_url',
            image_url: { url: 'data:image/png;base64,iVBORw0KGgo=', detail: 'auto' },
          },
          { type: 'text', text: '' },
        ],
      },
    ])
    expect(messagesOf(encode(cached('1h')))).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'hello', cache_control: control }] },
    ])
  })

  it('marks the last image of a last user message of images only', () => {
    const messages = messagesOf(
      encode(cached('5m'), {
        messages: [message('u1', 'user', [imageBlock('b1'), imageBlock('b2')])],
      }),
    )
    const url = { url: 'data:image/png;base64,iVBORw0KGgo=', detail: 'auto' }
    expect(messages).toEqual([
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: url },
          { type: 'image_url', image_url: url, cache_control: { type: 'ephemeral', ttl: '5m' } },
        ],
      },
    ])
  })

  it('refuses as unsupported no-cache-target when images and only empty text end the request', () => {
    const record = cached('1h')
    for (const blocks of [
      [textBlock('b1', ''), imageBlock('b2')],
      [imageBlock('b1'), textBlock('b2', '')],
    ])
      expect(encode(record, { messages: [message('u1', 'user', blocks)] })).toEqual({
        failure: { kind: 'unsupported', field: 'no-cache-target', adapter: adapterOf(record) },
      })
  })

  it('refuses as unsupported no-cache-target when the last message has no place', () => {
    const record = cached('1h')
    const outcome = encode(record, {
      messages: [
        message('a1', 'assistant', [callBlock('c1', 'call_a')]),
        message('t1', 'tool', [resultBlock('r1', 'call_a'), imageBlock('b1')]),
        message('a2', 'assistant', [callBlock('c2', 'call_b')]),
        message('t2', 'tool', [resultBlock('r2', 'call_b')]),
      ],
    })
    expect(outcome).toEqual({
      failure: { kind: 'unsupported', field: 'no-cache-target', adapter: adapterOf(record) },
    })
  })
})

describe('encode: replay', () => {
  function assistant(scope: string, thinking = 'pondering'): unknown {
    return message(
      'a1',
      'assistant',
      [thinkingBlock('k1', thinking), stateBlock('s1', 'sealed-1'), textBlock('b1', 'answer')],
      {
        replay: { scope, format: FORMAT, at: [1] },
      },
    )
  }
  const follow = message('u2', 'user', [textBlock('b2', 'next')])
  function omission(id: unknown, scope: string): unknown {
    return { kind: 'replay-omitted', message: id, scope, format: FORMAT, omittedParts: 1 }
  }

  it('writes the carried parts of a continuable message through the reasoning hook', () => {
    const probe = engineProbe()
    const messages = messagesOf(
      encode(testRecord(), { messages: [assistant(SCOPE), follow] }, probe),
    )
    expect(probe.replays).toEqual([
      {
        parts: [{ payload: 'sealed-1', format: FORMAT }],
        thinking: ['pondering'],
        source: 'continuable',
      },
    ])
    expect(messages).toEqual([
      {
        role: 'assistant',
        content: 'answer',
        reasoning_details: [{ type: 'reasoning.encrypted', data: 'sealed-1', format: FORMAT }],
      },
      { role: 'user', content: 'next' },
    ])
  })

  it('leaves out the parts and the thinking of a message from another scope', () => {
    const probe = engineProbe()
    const messages = messagesOf(
      encode(testRecord(), { messages: [assistant('gateway/other'), follow] }, probe),
    )
    expect(probe.replays).toEqual([])
    expect(messages).toEqual([
      { role: 'assistant', content: 'answer' },
      { role: 'user', content: 'next' },
    ])
  })

  it('writes foreign thinking as text when the declaration of the request says text, and meters it as text', () => {
    const record = testRecord()
    const probe = engineProbe()
    const declaration: ReplayDeclaration = { ...declarationOf(record), foreignThinking: 'text' }
    const messages = messagesOf(
      encode(record, { messages: [assistant('gateway/other'), follow], declaration }, probe),
    )
    // The meter gets what goes out: the thinking block as a text block, no thinking block.
    expect(
      probe.views[0]?.turns[0]?.blocks.map(block => [
        block.kind,
        'text' in block ? block.text : null,
      ]),
    ).toEqual([
      ['text', 'pondering'],
      ['text', 'answer'],
    ])
    expect(messages).toEqual([
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'pondering' },
          { type: 'text', text: 'answer' },
        ],
      },
      { role: 'user', content: 'next' },
    ])
  })

  it('leaves out every part when the judged request turns replay off, and reports the omission', () => {
    const request = fixedRequest(testRecord(), {
      messages: [assistant(SCOPE), follow],
      replay: 'off',
    })
    const outcome = bind(testRecord()).encode(inputOf(request))
    expect(messagesOf(outcome)).toEqual([
      { role: 'assistant', content: 'answer' },
      { role: 'user', content: 'next' },
    ])
    expect('ok' in outcome && outcome.ok.diagnostics).toEqual([
      omission(request.messages[0]?.id, SCOPE),
    ])
  })

  it('projects with the declaration of the request, not the official declaration of the record', () => {
    const record = testRecord()
    const declaration: ReplayDeclaration = {
      ...declarationOf(record),
      accepts: [SCOPE, 'gateway/other'],
    }
    const outcome = encode(record, { messages: [assistant('gateway/other'), follow], declaration })
    expect(messagesOf(outcome)).toEqual([
      {
        role: 'assistant',
        content: 'answer',
        reasoning_details: [{ type: 'reasoning.encrypted', data: 'sealed-1', format: FORMAT }],
      },
      { role: 'user', content: 'next' },
    ])
    expect('ok' in outcome && outcome.ok.diagnostics).toEqual([])
  })

  it('reports each message whose parts stay out for another scope, and nothing for a continuable one', () => {
    const request = fixedRequest(testRecord(), {
      messages: [assistant('gateway/other'), follow],
    })
    const outcome = bind(testRecord()).encode(inputOf(request))
    expect('ok' in outcome && outcome.ok.diagnostics).toEqual([
      omission(request.messages[0]?.id, 'gateway/other'),
    ])
  })

  it('leaves out the parts of a resent message and reports the omission', () => {
    const probe = engineProbe()
    const request = fixedRequest(testRecord(), { messages: [assistant(SCOPE), follow] })
    const resent = request.messages.slice(0, 1).map(item => item.id)
    const outcome = bind(testRecord(), probe).encode(inputOf(request, resent))
    expect(probe.replays).toEqual([])
    expect(messagesOf(outcome)).toEqual([
      { role: 'assistant', content: 'answer' },
      { role: 'user', content: 'next' },
    ])
    expect('ok' in outcome && outcome.ok.diagnostics).toEqual([omission(resent[0], SCOPE)])
  })

  it('gives foreign thinking to the reasoning hook when the declaration says adapter', () => {
    const record = testRecord()
    const probe = engineProbe()
    const declaration: ReplayDeclaration = { ...declarationOf(record), foreignThinking: 'adapter' }
    const request = fixedRequest(record, {
      messages: [assistant('gateway/other'), follow],
      declaration,
    })
    expect(messagesOf(bind(record, probe).encode(inputOf(request)))).toEqual([
      { role: 'assistant', content: 'answer', reasoning: 'pondering' },
      { role: 'user', content: 'next' },
    ])
    expect(probe.replays).toEqual([{ parts: [], thinking: ['pondering'], source: 'foreign' }])
  })

  it('refuses foreign thinking for adapter as unsupported when the family has no reasoning codec', () => {
    const record = testRecord()
    const probe = engineProbe()
    const declaration: ReplayDeclaration = { ...declarationOf(record), foreignThinking: 'adapter' }
    const request = fixedRequest(record, {
      messages: [assistant('gateway/other'), follow],
      declaration,
    })
    expect(bind(record, probe, testHooks(probe, false)).encode(inputOf(request))).toEqual({
      failure: { kind: 'unsupported', field: '/messages/0', adapter: adapterOf(record) },
    })
  })

  it('refuses a continuable message with reasoning when the family has no reasoning codec', () => {
    const record = testRecord()
    const probe = engineProbe()
    const outcome = bind(record, probe, testHooks(probe, false)).encode(
      inputOf(fixedRequest(record, { messages: [assistant(SCOPE), follow] })),
    )
    expect(outcome).toEqual({
      failure: { kind: 'unsupported', field: '/messages/0', adapter: adapterOf(record) },
    })
  })
})

describe('bindChatCompletions', () => {
  it('derives the adoption and the replay format from the record and the counting basis from the meter', () => {
    const record = testRecord()
    const probe = engineProbe()
    const meter = testMeter(record, probe)
    const binding = bindChatCompletions({
      record,
      supplier: supplierOf(record),
      hooks: testHooks(probe),
      meter,
      limits: LIMITS,
      release: async () => undefined,
    })
    expect(binding.adoption).toEqual(supplierOf(record).adoption)
    expect(binding.counting).toBe(meter.instance.basis)
    expect(binding.meter).toBe(meter.instance)
    expect(binding.replayFormat).toBe(FORMAT)
  })

  it('wraps the family release once: every call returns the first promise', async () => {
    const probe = engineProbe()
    const binding = bind(testRecord(), probe)
    const first = binding.release()
    expect(binding.release()).toBe(first)
    await first
    expect(probe.released).toBe(1)
  })

  it('refuses a supplier whose adoption is not the adoption of the record', () => {
    const record = testRecord()
    const probe = engineProbe()
    const drifted = testRecord({ revision: '2' })
    expect(() =>
      bindChatCompletions({
        record,
        supplier: supplierOf(drifted),
        hooks: testHooks(probe),
        meter: testMeter(record, probe),
        limits: LIMITS,
        release: async () => undefined,
      }),
    ).toThrow(RangeError)
  })

  it.each([
    [
      'a default out of its own range',
      () => {
        const base = testRecord()
        return testRecord({
          parameters: {
            ...base.parameters,
            temperature: {
              support: 'supported',
              default: { kind: 'send', value: 3 },
              accept: { min: 0, max: 1 },
              wire: { field: 'temperature' },
            },
          },
        })
      },
    ],
    [
      'a fixed field written twice',
      () =>
        testRecord({
          wire: {
            ...testRecord().wire,
            fixed: [
              { field: 'store', value: false },
              { field: 'store', value: false },
            ],
          },
        }),
    ],
    [
      'a fixed value that turns reasoning off',
      () => {
        const base = testRecord()
        const off = { field: 'reasoning.enabled', value: false } as unknown as GatewayParam
        return testRecord({ wire: { ...base.wire, fixed: [off] } })
      },
    ],
    [
      'an extension on a parameter field',
      () => testRecord({ extensions: [{ definition: EXTENSION, field: 'temperature' }] }),
    ],
  ])('refuses a record with %s', (_name, make) => {
    const record = make()
    expect(() => bind(record)).toThrow(RangeError)
  })

  it('gives a binding that the family table accepts for its own supplier', async () => {
    const record = testRecord()
    const probe = engineProbe()
    const families = composeFamilies([
      defineFamily({
        owner: OWNER,
        records: [record],
        acquire: async (found, supplier) => ({
          ok: bindChatCompletions({
            record: found,
            supplier,
            hooks: testHooks(probe),
            meter: testMeter(found, probe),
            limits: LIMITS,
            release: async () => undefined,
          }),
        }),
      }),
    ])
    const acquired = await families.acquire(supplierOf(record), new AbortController().signal)
    expect('ok' in acquired && acquired.ok.adoption).toEqual(supplierOf(record).adoption)
  })
})
