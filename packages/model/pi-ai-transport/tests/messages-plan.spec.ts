import { writeJsonText, type JsonValue } from '@omne-harness/json-text'
import { describe, expect, it } from 'vitest'
import type { PiFamilyBinding } from '../src/index.ts'
import { bindMessages, type MessagesRecord } from '../src/messages/index.ts'
import {
  LIMITS,
  adoption,
  assembledOf,
  engineProbe,
  fixedRequest,
  imageBlock,
  message,
  pictureBlock,
  pictureRead,
  profileOf,
  resultBlock,
  supplierOf,
  testMeter,
  textBlock,
  tool,
  type RequestParts,
} from './support/chat-record.ts'
import { messagesRecord } from './support/messages-record.ts'

function bind(record: MessagesRecord = messagesRecord()): PiFamilyBinding {
  return bindMessages({
    record,
    supplier: supplierOf(record),
    meter: testMeter(record, engineProbe()),
    limits: LIMITS,
    release: async () => {},
  })
}

function plan(record: MessagesRecord, parts: RequestParts = {}, profile = profileOf(record)) {
  const request = fixedRequest(record, parts)
  return bind(record).rules.plan({
    profile,
    supplier: request.suppliers[0],
    assembled: assembledOf(request),
  })
}

function encodeBody(record: MessagesRecord, parts: RequestParts): Record<string, unknown> {
  const request = fixedRequest(record, parts)
  const outcome = bind(record).encode({
    request,
    media: [],
    declaration: request.declarations[0],
    resent: [],
  })
  if (!('ok' in outcome)) throw new Error(JSON.stringify(outcome.failure))
  return JSON.parse(writeJsonText(outcome.ok.body)) as Record<string, unknown>
}

const adapterOf = (record: MessagesRecord) => supplierOf(record).adoption
const str = (value: string): JsonValue => ({ kind: 'string', value })

describe('rules.plan', () => {
  it('plans the requested parameters and a materialized representation with the body size', () => {
    const record = messagesRecord()
    const outcome = plan(record, { parameters: [{ kind: 'reasoning-effort', value: 'high' }] })
    if (!('ok' in outcome)) throw new Error(JSON.stringify(outcome.failure))
    expect(outcome.ok.parameters.map(item => item.applied)).toEqual([
      { kind: 'reasoning-effort', value: 'high' },
    ])
    expect(outcome.ok.representation).toMatchObject({ kind: 'materialized', media: [] })
    expect(Number(Reflect.get(outcome.ok.representation, 'requestBytes'))).toBeGreaterThan(0)
  })

  it('refuses a supplier of another binding and a profile that does not name the supplier', () => {
    const record = messagesRecord()
    const request = fixedRequest(record)
    const other = { ...request.suppliers[0], adoption: adoption('other-supplier') }
    expect(
      bind(record).rules.plan({
        profile: profileOf(record),
        supplier: other,
        assembled: assembledOf(request),
      }),
    ).toEqual({ failure: { kind: 'invalid', field: 'supplier', reason: 'not-this-binding' } })
    const elsewhere = messagesRecord({ name: 'model-x' })
    expect(plan(record, {}, profileOf(elsewhere))).toEqual({
      failure: { kind: 'invalid', field: 'supplier', reason: 'not-in-profile' },
    })
  })

  it('refuses an effort the record maps unsupported, at planning', () => {
    const record = messagesRecord()
    expect(
      plan(record, { parameters: [{ kind: 'reasoning-effort', value: 'none' }] }),
    ).toMatchObject({ failure: { kind: 'unsupported' } })
  })
})

describe('tools.convertToModelPayload', () => {
  it('writes a tool as its name, description and object schema', () => {
    const record = messagesRecord()
    const payload = bind(record).tools.convertToModelPayload({
      name: 'files.read',
      description: 'Read a file.',
      argumentsSchema: { kind: 'object', entries: [{ key: 'type', value: str('object') }] },
    })
    if (!('ok' in payload)) throw new Error(JSON.stringify(payload.failure))
    expect(JSON.parse(writeJsonText(payload.ok))).toEqual({
      name: 'files_read',
      description: 'Read a file.',
      input_schema: { type: 'object' },
    })
  })

  it('refuses a schema that is not an object and a name longer than the record allows', () => {
    const record = messagesRecord()
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

describe('encode: edges of the conversation', () => {
  const unparsed = (raw: string) => ({
    kind: 'tool_call_unparsed',
    id: 'c1',
    visibility: { toHuman: true, toModel: true },
    callId: 'call-1',
    name: 'lookup',
    raw,
  })

  it.each([
    ['an object', '{"q":"x"}', { q: 'x' }],
    ['text that is not an object', 'not json', {}],
  ])('sends back the unparsed arguments of %s as the input object', (_case, raw, input) => {
    const body = encodeBody(messagesRecord(), {
      messages: [
        message('u1', 'user', [textBlock('b1', 'go')]),
        message('a1', 'assistant', [unparsed(raw)]),
        message('r1', 'tool', [resultBlock('x1', 'call-1'), textBlock('x2', 'failed')]),
      ],
      tools: [tool('lookup')],
    })
    const assistant = (body.messages as { content: Record<string, unknown>[] }[])[1]
    expect(assistant?.content[0]).toMatchObject({ type: 'tool_use', id: 'call-1', input })
  })

  it('writes a numeric sampling parameter where the record supports it', () => {
    const base = messagesRecord()
    const record = messagesRecord({
      parameters: {
        ...base.parameters,
        temperature: {
          support: 'supported',
          default: { kind: 'absent' },
          accept: { min: 0, max: 1 },
          wire: { field: 'temperature' },
        },
      },
    })
    const body = encodeBody(record, {
      parameterAdoptions: [
        {
          supplier: adapterOf(record),
          applied: { kind: 'temperature', value: 0.5 },
          origin: { kind: 'default', source: adapterOf(record) },
        },
      ],
    })
    expect(body.temperature).toBe(0.5)
  })

  it.each([
    [
      'an image of a media type the record does not take',
      [imageBlock('i1', 'image/tiff')],
      '/messages/0/blocks/0',
    ],
  ])('refuses %s', (_case, blocks, field) => {
    const record = messagesRecord()
    const request = fixedRequest(record, { messages: [message('u1', 'user', blocks)] })
    expect(
      bind(record).encode({ request, media: [], declaration: request.declarations[0], resent: [] }),
    ).toEqual({ failure: { kind: 'unsupported', field, adapter: adapterOf(record) } })
  })
})

describe('bindMessages: a record the engine cannot write is refused at binding', () => {
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
          ...messagesRecord().wire,
          toolNames: {
            rule: 'other/1',
            maxLength: 64,
          } as unknown as MessagesRecord['wire']['toolNames'],
        },
      },
      /toolNames/,
    ],
    [
      'no output limit',
      {
        parameters: {
          ...messagesRecord().parameters,
          'max-output-tokens': { support: 'unsupported' },
        },
      },
      /output limit/,
    ],
  ] as const)('%s', (_case, overrides, message) => {
    expect(() => bind(messagesRecord(overrides as Partial<MessagesRecord>))).toThrow(message)
  })
})

describe('encode: the body around the conversation', () => {
  const effortless = (record: MessagesRecord, kind: string, value: unknown) => ({
    supplier: adapterOf(record),
    applied: { kind, value },
    origin: { kind: 'default', source: adapterOf(record) },
  })

  it('writes an explicit output limit and top_p, and no system member when there is no system prompt', () => {
    const base = messagesRecord()
    const record = messagesRecord({
      parameters: {
        ...base.parameters,
        'top-p': {
          support: 'supported',
          default: { kind: 'absent' },
          accept: { min: 0, max: 1 },
          wire: { field: 'top_p' },
        },
      },
    })
    const body = encodeBody(record, {
      parameterAdoptions: [
        effortless(record, 'max-output-tokens', '512'),
        effortless(record, 'top-p', 0.9),
      ],
    })
    expect(body.max_tokens).toBe(512)
    expect(body.top_p).toBe(0.9)
    expect(Object.keys(body)).not.toContain('system')
  })

  it('carries no reasoning state when the request turns replay off', () => {
    const record = messagesRecord({
      replay: {
        declaration: {},
        formats: { produces: 'f-v1', accepts: ['f-v1'] },
        binding: 'none',
      },
    })
    const state = {
      kind: 'reasoning_state',
      id: 's1',
      visibility: { toHuman: false, toModel: true },
      payload: '[{"signature":"sig","thinking":"t","type":"thinking"}]',
      pairs: [],
    }
    const messages = [
      message('a1', 'assistant', [state, textBlock('t1', 'x')], {
        replay: { scope: 'gateway/lab/model-a', format: 'f-v1', at: [0] },
      }),
      message('u1', 'user', [textBlock('b1', 'next')]),
    ]
    expect(JSON.stringify(encodeBody(record, { messages }))).toContain('"signature":"sig"')
    expect(JSON.stringify(encodeBody(record, { messages, replay: 'off' }))).not.toContain('sig')
  })

  it('sends a request with nothing the model sees unmarked for the cache; media nothing refers to change nothing', () => {
    const record = messagesRecord({
      wire: { ...messagesRecord().wire, cache: { kind: 'last-message', ttl: '5m' } },
    })
    const request = fixedRequest(record, {
      messages: [message('u1', 'user', [textBlock('b1', 'hidden', false)])],
    })
    const binding = bind(record)
    const input = { request, declaration: request.declarations[0], resent: [] }
    const unmarked = binding.encode({ ...input, media: [] })
    if (!('ok' in unmarked)) throw new Error(JSON.stringify(unmarked.failure))
    expect(writeJsonText(unmarked.ok.body)).not.toContain('cache_control')
    expect(binding.encode({ ...input, media: [pictureRead()] })).toEqual(unmarked)
  })
})

describe('rules.plan: a request that refers to an image', () => {
  it('is represented as pending: the references it waits for, and the measure the block carries', () => {
    const record = messagesRecord()
    const request = fixedRequest(record, {
      messages: [message('u1', 'user', [textBlock('b1', 'look'), pictureBlock('b2')])],
    })
    const outcome = bind(record).rules.plan({
      profile: profileOf(record),
      supplier: request.suppliers[0],
      assembled: assembledOf(request),
    })
    if (!('ok' in outcome)) throw new Error(JSON.stringify(outcome.failure))
    expect(outcome.ok.representation).toMatchObject({
      kind: 'pending-media',
      references: [pictureRead().reference],
      media: [pictureRead().measurement],
    })
    expect(outcome.ok.representation).not.toHaveProperty('requestBytes')
  })

  it('names a reference once however many blocks refer to it, and measures only what a block carries', () => {
    const record = messagesRecord()
    const { facts: _measure, ...unmeasured } = pictureBlock('b3') as { facts: unknown }
    const request = fixedRequest(record, {
      messages: [message('u1', 'user', [pictureBlock('b1'), pictureBlock('b2'), unmeasured])],
    })
    const outcome = bind(record).rules.plan({
      profile: profileOf(record),
      supplier: request.suppliers[0],
      assembled: assembledOf(request),
    })
    if (!('ok' in outcome)) throw new Error(JSON.stringify(outcome.failure))
    expect(outcome.ok.representation).toMatchObject({
      kind: 'pending-media',
      references: [pictureRead().reference],
      media: [pictureRead().measurement, pictureRead().measurement],
    })
  })
})
