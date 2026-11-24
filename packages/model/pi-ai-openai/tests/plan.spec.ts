import { describe, expect, it } from 'vitest'
import { recordAdoption } from '@omne-harness/pi-ai-transport'
import { writeJsonText } from '@omne-harness/json-text'
import type { Parameter } from '@omne-harness/model-contract'
import { OPENAI_OWNER, type OpenAiRecord } from '@omne-harness/pi-ai-openai'
import {
  assembledOf,
  bindingOf,
  fixedRequest,
  imageBlock,
  officialProfile,
  recordNamed,
  supplierOf,
  textBlock,
  message,
  tool,
  encodeInput,
  type RequestParts,
} from './support/openai.ts'

const SOL = recordNamed('openai/gpt-5.6-sol')
const ASTRA = recordNamed('openai/gpt-6-astra')
const ASTRA_PRO = recordNamed('openai/gpt-6-astra-pro')
const ENGINES = [
  ['chat-completions', ASTRA_PRO],
  ['Responses', ASTRA],
] as const

async function plan(record: OpenAiRecord, parameters: readonly Parameter[]) {
  const binding = await bindingOf(record)
  const request = fixedRequest(record)
  const outcome = binding.rules.plan({
    profile: officialProfile(record),
    supplier: supplierOf(record),
    assembled: { ...assembledOf(request), parameters },
  })
  await binding.release()
  return outcome
}

describe('parameters', () => {
  it('passes the output limit and the efforts low, medium and high as explicit adoptions', async () => {
    const outcome = await plan(SOL, [
      { kind: 'max-output-tokens', value: '4096' },
      { kind: 'reasoning-effort', value: 'medium' },
    ])
    if (!('ok' in outcome)) throw new Error(JSON.stringify(outcome.failure))
    expect(outcome.ok.parameters.map(item => item.applied)).toEqual([
      { kind: 'max-output-tokens', value: '4096' },
      { kind: 'reasoning-effort', value: 'medium' },
    ])
    expect(outcome.ok.parameters.every(item => item.origin.kind === 'explicit')).toBe(true)
  })

  it('adds no default: an omitted parameter is not written', async () => {
    const outcome = await plan(SOL, [])
    expect(outcome).toMatchObject({ ok: { parameters: [] } })
  })

  it.each([
    { kind: 'temperature', value: 0.5 },
    { kind: 'top-p', value: 0.5 },
    { kind: 'stop', value: ['END'] },
    { kind: 'seed', value: '7' },
    { kind: 'frequency-penalty', value: 0 },
    { kind: 'presence-penalty', value: 0 },
  ] satisfies readonly Parameter[])(
    'refuses $kind $value before sending, never drops it',
    async parameter => {
      expect(await plan(SOL, [parameter])).toEqual({
        failure: {
          kind: 'unsupported',
          field: parameter.kind,
          adapter: recordAdoption(OPENAI_OWNER, SOL),
        },
      })
    },
  )

  it('writes xhigh on a measured Responses route and refuses it on an unverified Chat route', async () => {
    const effort = { kind: 'reasoning-effort', value: 'xhigh' } as const
    const declined = { failure: { kind: 'unsupported', field: effort.kind } }
    expect(await plan(ASTRA_PRO, [effort])).toMatchObject(declined)
    expect(await plan(ASTRA, [effort])).toMatchObject({ ok: { parameters: [{ applied: effort }] } })
    for (const record of [ASTRA, ASTRA_PRO]) {
      const binding = await bindingOf(record)
      try {
        const encoded = binding.encode(encodeInput(fixedRequest(record, { parameters: [effort] })))
        if (record === ASTRA_PRO) expect(encoded).toMatchObject(declined)
        else {
          if ('failure' in encoded) throw new Error(JSON.stringify(encoded.failure))
          expect(JSON.parse(writeJsonText(encoded.ok.body)).reasoning.effort).toBe('xhigh')
        }
      } finally {
        await binding.release()
      }
    }
  })

  it('passes the effort max and writes it as itself', async () => {
    for (const record of [SOL, ASTRA]) {
      const effort: Parameter = { kind: 'reasoning-effort', value: 'max' }
      const outcome = await plan(record, [effort])
      if (!('ok' in outcome)) throw new Error(JSON.stringify(outcome.failure))
      expect(outcome.ok.parameters.map(item => item.applied)).toEqual([effort])
      const binding = await bindingOf(record)
      const request = fixedRequest(record, { parameters: [effort] })
      const encoded = binding.encode(encodeInput(request))
      await binding.release()
      if (!('ok' in encoded)) throw new Error(JSON.stringify(encoded.failure))
      expect(JSON.parse(writeJsonText(encoded.ok.body))).toMatchObject({
        reasoning: { effort: 'max' },
      })
    }
  })

  it.each([
    ['Sol', SOL],
    ['Astra', ASTRA],
  ] as const)(
    'refuses the effort none on %s: no record turns reasoning off',
    async (_name, record) => {
      expect(await plan(record, [{ kind: 'reasoning-effort', value: 'none' }])).toEqual({
        failure: {
          kind: 'unsupported',
          field: 'reasoning-effort',
          adapter: recordAdoption(OPENAI_OWNER, record),
        },
      })
    },
  )

  it('refuses an output limit above the record range', async () => {
    expect(await plan(ASTRA, [{ kind: 'max-output-tokens', value: '128001' }])).toEqual({
      failure: { kind: 'invalid', field: 'max-output-tokens', reason: 'out-of-range' },
    })
  })
})

const CALL = {
  kind: 'tool_call',
  id: 'c1',
  visibility: { toHuman: true, toModel: true },
  callId: 'call 1',
  name: 'lookup',
  arguments: { kind: 'object', entries: [] },
}

async function encodedBody(record: OpenAiRecord, parts: RequestParts): Promise<unknown> {
  const binding = await bindingOf(record)
  const encoded = binding.encode(encodeInput(fixedRequest(record, parts)))
  await binding.release()
  if (!('ok' in encoded)) throw new Error(JSON.stringify(encoded.failure))
  return JSON.parse(writeJsonText(encoded.ok.body))
}

describe('request body', () => {
  const parts: RequestParts = {
    messages: [
      message('u1', 'user', [textBlock('b1', 'look up x')]),
      message('a1', 'assistant', [CALL]),
      message('t1', 'tool', [
        { kind: 'tool_result', id: 'r1', visibility: CALL.visibility, callId: 'call 1' },
        textBlock('b2', 'found'),
        imageBlock('i1'),
      ]),
    ],
    tools: [tool('lookup')],
  }

  it('writes tools, a tool result image after the tool turn and the image detail of the record on chat-completions', async () => {
    expect(await encodedBody(ASTRA_PRO, parts)).toMatchObject({
      messages: [
        { role: 'user', content: 'look up x' },
        {
          role: 'assistant',
          content: '',
          tool_calls: [{ type: 'function', function: { name: 'lookup', arguments: '{}' } }],
        },
        { role: 'tool', content: 'found' },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: 'data:image/png;base64,iVBORw0KGgo=', detail: 'auto' },
            },
          ],
        },
      ],
      tools: [
        {
          type: 'function',
          function: { name: 'lookup', description: 'lookup tool', parameters: { type: 'object' } },
        },
      ],
      tool_choice: 'auto',
      store: false,
    })
  })

  it('writes tools, the call and its output as items, and the tool result image in a user message after them with no detail on Responses', async () => {
    const body = await encodedBody(ASTRA, parts)
    expect(body).toMatchObject({
      input: [
        { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'look up x' }] },
        { type: 'function_call', name: 'lookup', arguments: '{}' },
        { type: 'function_call_output', output: 'found' },
        { type: 'message', role: 'user' },
      ],
      tools: [
        {
          type: 'function',
          name: 'lookup',
          description: 'lookup tool',
          parameters: { type: 'object' },
        },
      ],
      tool_choice: 'auto',
      store: false,
    })
    const input: readonly Readonly<Record<string, unknown>>[] = Reflect.get(Object(body), 'input')
    const [, call, output, images] = input
    expect(output?.['call_id']).toBe(call?.['call_id'])
    expect(images?.['content']).toEqual([
      { type: 'input_image', image_url: 'data:image/png;base64,iVBORw0KGgo=' },
    ])
  })

  it.each(ENGINES)(
    'refuses an orphaned tool call instead of sending it on %s',
    async (_engine, record) => {
      const binding = await bindingOf(record)
      const request = fixedRequest(record, {
        messages: [
          message('u1', 'user', [textBlock('b1', 'look up x')]),
          message('a1', 'assistant', [{ ...CALL, callId: 'call_1' }]),
          message('u2', 'user', [textBlock('b2', 'never mind')]),
        ],
        tools: [tool('lookup')],
      })
      expect(binding.encode(encodeInput(request))).toEqual({
        failure: { kind: 'invalid', field: '/messages/1/blocks/0', reason: 'orphan-tool-call' },
      })
      await binding.release()
    },
  )

  it.each(ENGINES)(
    'refuses a tool whose schema root is not an object on %s',
    async (_engine, record) => {
      const binding = await bindingOf(record)
      const request = fixedRequest(record, {
        tools: [tool('lookup', { kind: 'string', value: 'object' })],
      })
      expect(binding.encode(encodeInput(request))).toEqual({
        failure: {
          kind: 'unsupported',
          field: '/tools/0/argumentsSchema',
          adapter: recordAdoption(OPENAI_OWNER, record),
        },
      })
      await binding.release()
    },
  )
})
