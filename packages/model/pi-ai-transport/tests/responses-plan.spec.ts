import { writeJsonText, type JsonValue } from '@omne-harness/json-text'
import { describe, expect, it } from 'vitest'
import type { PiFamilyBinding } from '../src/index.ts'
import { bindResponses, type ResponsesRecord } from '../src/responses/index.ts'
import { sealItems } from '../src/responses/reasoning.ts'
import {
  LIMITS,
  SCOPE,
  adoption,
  assembledOf,
  callBlock,
  engineProbe,
  fixedRequest,
  message,
  profileOf,
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

function bind(record: ResponsesRecord = responsesRecord(), probe = engineProbe()): PiFamilyBinding {
  return bindResponses({
    record,
    supplier: supplierOf(record),
    meter: testMeter(record, probe),
    limits: LIMITS,
    release: async () => {},
  })
}

function plan(record: ResponsesRecord, parts: RequestParts = {}, profile = profileOf(record)) {
  const request = fixedRequest(record, parts)
  return bind(record).rules.plan({
    profile,
    supplier: request.suppliers[0],
    assembled: assembledOf(request),
  })
}

const adapterOf = (record: ResponsesRecord) => supplierOf(record).adoption
const str = (value: string): JsonValue => ({ kind: 'string', value })

describe('rules.plan', () => {
  it('plans the requested parameters and a materialized representation with the body size', () => {
    const record = responsesRecord()
    const outcome = plan(record, { parameters: [{ kind: 'reasoning-effort', value: 'high' }] })
    if (!('ok' in outcome)) throw new Error(JSON.stringify(outcome.failure))
    expect(outcome.ok.parameters.map(item => item.applied)).toEqual([
      { kind: 'reasoning-effort', value: 'high' },
    ])
    expect(outcome.ok.representation).toMatchObject({ kind: 'materialized', media: [] })
    expect(Number(Reflect.get(outcome.ok.representation, 'requestBytes'))).toBeGreaterThan(0)
  })

  it('refuses a supplier of another binding and a profile that does not name the supplier', () => {
    const record = responsesRecord()
    const request = fixedRequest(record)
    const other = { ...request.suppliers[0], adoption: adoption('other-supplier') }
    expect(
      bind(record).rules.plan({
        profile: profileOf(record),
        supplier: other,
        assembled: assembledOf(request),
      }),
    ).toEqual({ failure: { kind: 'invalid', field: 'supplier', reason: 'not-this-binding' } })
    expect(plan(record, {}, profileOf(responsesRecord({ name: 'model-x' })))).toEqual({
      failure: { kind: 'invalid', field: 'supplier', reason: 'not-in-profile' },
    })
  })

  it('refuses an effort the record maps unsupported, at planning', () => {
    expect(
      plan(responsesRecord(), { parameters: [{ kind: 'reasoning-effort', value: 'none' }] }),
    ).toMatchObject({ failure: { kind: 'unsupported' } })
  })
})

describe('the view the meter reads', () => {
  it('has one turn per message the model sees, the reminder as developer and the carried reasoning items as details', () => {
    const probe = engineProbe()
    const reasoning: JsonValue = {
      kind: 'object',
      entries: [
        { key: 'id', value: str('rs_1') },
        { key: 'type', value: str('reasoning') },
      ],
    }
    const payload = sealItems([
      { type: 'reasoning', item: reasoning },
      { type: 'function_call', id: 'fc_1', callId: 'call-1' },
    ])
    const request = fixedRequest(responsesRecord(), {
      system: [textBlock('s1', 'brief')],
      messages: [
        message('u1', 'user', [textBlock('b1', 'go'), textBlock('b2', 'secret', false)]),
        message(
          'a1',
          'assistant',
          [thinkingBlock('k1', 'plan'), callBlock('c1', 'call-1'), stateBlock('s2', payload)],
          {
            replay: { scope: SCOPE, format: ITEMS_FORMAT, at: [2] },
          },
        ),
        message('r1', 'tool', [resultBlock('x1', 'call-1'), textBlock('x2', 'ok')]),
        message('m1', 'system_reminder', [textBlock('z1', 'note')]),
      ],
      tools: [tool('lookup')],
    })
    const outcome = bind(responsesRecord(), probe).encode({
      request,
      media: [],
      declaration: request.declarations[0],
      resent: [],
    })
    expect('ok' in outcome).toBe(true)
    const [view] = probe.views
    expect(view?.instruction.map(block => block.id)).toEqual(['s1'])
    expect(
      view?.turns.map(turn => [
        turn.role,
        turn.blocks.map(block => block.id),
        turn.replay.kind === 'details' ? turn.replay.details.map(detail => detail['id']) : [],
      ]),
    ).toEqual([
      ['user', ['b1'], []],
      ['assistant', ['c1'], [str('rs_1')]],
      ['tool', ['x1', 'x2'], []],
      ['developer', ['z1'], []],
    ])
  })
})

describe('foreign thinking', () => {
  const foreign = (blocks: readonly unknown[]) =>
    message('a1', 'assistant', blocks, {
      replay: { scope: 'gateway/other', format: ITEMS_FORMAT, at: [] },
    })
  const follow = message('u2', 'user', [textBlock('b2', 'next')])
  const record = responsesRecord()
  const sentFirst = (foreignThinking: 'omit' | 'text' | 'adapter') => {
    const request = fixedRequest(record, {
      messages: [foreign([thinkingBlock('k1', 'pondering'), textBlock('t1', 'answer')]), follow],
    })
    const declaration = { ...request.declarations[0], foreignThinking }
    return bind(record).encode({ request, media: [], declaration, resent: [] })
  }
  const contentOf = (outcome: ReturnType<typeof sentFirst>) => {
    if (!('ok' in outcome)) throw new Error(JSON.stringify(outcome.failure))
    return (JSON.parse(writeJsonText(outcome.ok.body)) as { input: { content: unknown }[] })
      .input[0]?.content
  }

  it('writes foreign thinking as text when the request says text, and leaves it out when it says omit', () => {
    const part = (text: string) => ({ type: 'output_text', text, annotations: [] })
    expect(contentOf(sentFirst('text'))).toEqual([part('pondering'), part('answer')])
    expect(contentOf(sentFirst('omit'))).toEqual([part('answer')])
  })

  it('refuses foreign thinking when the request asks for the adapter', () => {
    expect(sentFirst('adapter')).toEqual({
      failure: { kind: 'unsupported', field: '/messages/0', adapter: adapterOf(record) },
    })
  })
})

describe('the tool choice and the calls', () => {
  function encodeBody(parts: RequestParts) {
    const record = responsesRecord({
      accepts: { forcedToolChoice: true, endsWithAssistant: false },
    })
    const request = fixedRequest(record, parts)
    return bind(record).encode({
      request,
      media: [],
      declaration: request.declarations[0],
      resent: [],
    })
  }
  const choice = (parts: RequestParts) => {
    const outcome = encodeBody(parts)
    if (!('ok' in outcome)) throw new Error(JSON.stringify(outcome.failure))
    return (JSON.parse(writeJsonText(outcome.ok.body)) as Record<string, unknown>).tool_choice
  }

  it.each([
    ['none with tools', { toolChoice: 'none', tools: [tool('lookup')] }, 'none'],
    ['auto without tools', { toolChoice: 'auto' }, undefined],
    ['none without tools', { toolChoice: 'none' }, undefined],
  ])('writes %s', (_case, parts, json) => {
    expect(choice(parts as RequestParts)).toEqual(json)
  })

  it('refuses a forced call without tools, a call left without its result, a result of no call and an incomplete call', () => {
    expect(encodeBody({ toolChoice: 'required' })).toEqual({
      failure: { kind: 'invalid', field: 'toolChoice', reason: 'no-tools' },
    })
    expect(
      encodeBody({
        messages: [
          message('a1', 'assistant', [callBlock('c1', 'call-1')]),
          message('u1', 'user', [textBlock('b1', 'x')]),
        ],
        tools: [tool('lookup')],
      }),
    ).toEqual({
      failure: { kind: 'invalid', field: '/messages/0/blocks/0', reason: 'orphan-tool-call' },
    })
    expect(
      encodeBody({
        messages: [
          message('r1', 'tool', [resultBlock('x1', 'call-9')]),
          message('u1', 'user', [textBlock('b1', 'x')]),
        ],
      }),
    ).toEqual({
      failure: { kind: 'invalid', field: '/messages/0/blocks/0', reason: 'orphan-tool-result' },
    })
  })

  it('sends back the unparsed arguments of a call as they were written', () => {
    const outcome = encodeBody({
      messages: [
        message('a1', 'assistant', [
          {
            kind: 'tool_call_unparsed',
            id: 'c1',
            visibility: { toHuman: true, toModel: true },
            callId: 'call-1',
            name: 'lookup',
            raw: 'not json',
          },
        ]),
        message('r1', 'tool', [resultBlock('x1', 'call-1'), textBlock('x2', 'failed')]),
      ],
      tools: [tool('lookup')],
    })
    if (!('ok' in outcome)) throw new Error(JSON.stringify(outcome.failure))
    expect((JSON.parse(writeJsonText(outcome.ok.body)) as { input: unknown[] }).input[0]).toEqual({
      type: 'function_call',
      call_id: 'call-1',
      name: 'lookup',
      arguments: 'not json',
    })
  })
})

describe('tools.convertToModelPayload', () => {
  it('writes a tool as a function with its name, description and object schema', () => {
    const payload = bind().tools.convertToModelPayload({
      name: 'files.read',
      description: 'Read a file.',
      argumentsSchema: { kind: 'object', entries: [{ key: 'type', value: str('object') }] },
    })
    if (!('ok' in payload)) throw new Error(JSON.stringify(payload.failure))
    expect(JSON.parse(writeJsonText(payload.ok))).toEqual({
      type: 'function',
      name: 'files_read',
      description: 'Read a file.',
      parameters: { type: 'object' },
    })
  })

  it('refuses a schema that is not an object and a name longer than the record allows', () => {
    const record = responsesRecord()
    const binding = bind(record)
    expect(
      binding.tools.convertToModelPayload({
        name: 't',
        description: 'd',
        argumentsSchema: str('x'),
      }),
    ).toEqual({
      failure: { kind: 'unsupported', field: 'argumentsSchema', adapter: adapterOf(record) },
    })
    expect(
      binding.tools.convertToModelPayload({
        name: 'x'.repeat(65),
        description: 'd',
        argumentsSchema: { kind: 'object', entries: [] },
      }),
    ).toEqual({ failure: { kind: 'unsupported', field: 'name', adapter: adapterOf(record) } })
  })
})

describe('bindResponses: a record the engine cannot write is refused at binding', () => {
  it.each([
    [
      'formats that do not accept what they produce',
      { replay: { declaration: {}, formats: { produces: 'a', accepts: ['b'] }, binding: 'none' } },
      /accept what they produce/,
    ],
    [
      'a tool name rule the engine does not have',
      {
        wire: {
          ...responsesRecord().wire,
          toolNames: {
            rule: 'other/1',
            maxLength: 64,
          } as unknown as ResponsesRecord['wire']['toolNames'],
        },
      },
      /toolNames/,
    ],
    [
      'a serving pin of more than one upstream',
      { serving: { order: ['a', 'b'], reports: ['A', 'B'] } },
      /one upstream/,
    ],
  ] as const)('%s', (_case, overrides, pattern) => {
    expect(() => bind(responsesRecord(overrides as Partial<ResponsesRecord>))).toThrow(pattern)
  })

  it('refuses limits that bound nothing', () => {
    const record = responsesRecord()
    expect(() =>
      bindResponses({
        record,
        supplier: supplierOf(record),
        meter: testMeter(record, engineProbe()),
        limits: { ...LIMITS, maxReasoningText: 0 },
        release: async () => {},
      }),
    ).toThrow(/limits/)
  })

  it('releases once however often it is asked', async () => {
    let released = 0
    const record = responsesRecord()
    const binding = bindResponses({
      record,
      supplier: supplierOf(record),
      meter: testMeter(record, engineProbe()),
      limits: LIMITS,
      release: async () => {
        released += 1
      },
    })
    await Promise.all([binding.release(), binding.release()])
    expect(released).toBe(1)
    expect(binding.endpoint).toBe('responses')
    expect(binding.replayFormat).toBe(ITEMS_FORMAT)
  })
})
