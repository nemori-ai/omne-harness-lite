// Parameter planning and the request body on the Anthropic records through the binding: the
// supported subset passes, the sealed drops and the effort `none` fail before sending, and the 1h
// cache marker lands on the last message or fails when there is no place for it.
import { describe, expect, it } from 'vitest'
import { recordAdoption } from '@omne-harness/pi-ai-transport'
import { writeJsonText } from '@omne-harness/json-text'
import type { Parameter } from '@omne-harness/model-contract'
import { ANTHROPIC_OWNER, type AnthropicRecord } from '@omne-harness/pi-ai-anthropic'
import {
  assembledOf,
  bindingOf,
  callBlock,
  encodeInput,
  fixedRequest,
  imageBlock,
  message,
  officialProfile,
  recordNamed,
  resultBlock,
  supplierOf,
  textBlock,
  tool,
  type RequestParts,
} from './support/anthropic.ts'

const SONNET = recordNamed('anthropic/claude-sonnet-5')
const OPUS = recordNamed('anthropic/claude-opus-5.5')
const CACHE = { type: 'ephemeral', ttl: '1h' }

async function plan(record: AnthropicRecord, parameters: readonly Parameter[]) {
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

async function encode(record: AnthropicRecord, parts: RequestParts) {
  const binding = await bindingOf(record)
  const encoded = binding.encode(encodeInput(fixedRequest(record, parts)))
  await binding.release()
  return encoded
}

async function bodyOf(record: AnthropicRecord, parts: RequestParts): Promise<unknown> {
  const encoded = await encode(record, parts)
  if (!('ok' in encoded)) throw new Error(JSON.stringify(encoded.failure))
  return JSON.parse(writeJsonText(encoded.ok.body))
}

describe('parameters', () => {
  it.each(['low', 'medium', 'high', 'max'] as const)(
    'passes the effort %s and writes it as itself',
    async value => {
      const effort: Parameter = { kind: 'reasoning-effort', value }
      const outcome = await plan(SONNET, [effort])
      if (!('ok' in outcome)) throw new Error(JSON.stringify(outcome.failure))
      expect(outcome.ok.parameters.map(item => item.applied)).toEqual([effort])
      expect(await bodyOf(SONNET, { parameters: [effort] })).toMatchObject({
        reasoning: { effort: value },
      })
    },
  )

  it('refuses the effort none, which the family does not offer', async () => {
    expect(await plan(SONNET, [{ kind: 'reasoning-effort', value: 'none' }])).toEqual({
      failure: {
        kind: 'unsupported',
        field: 'reasoning-effort',
        adapter: recordAdoption(ANTHROPIC_OWNER, SONNET),
      },
    })
  })

  it('passes the output limit and stop sequences as explicit adoptions and writes them', async () => {
    const parameters: readonly Parameter[] = [
      { kind: 'max-output-tokens', value: '4096' },
      { kind: 'stop', value: ['END', 'STOP'] },
    ]
    const outcome = await plan(SONNET, parameters)
    if (!('ok' in outcome)) throw new Error(JSON.stringify(outcome.failure))
    expect(outcome.ok.parameters.map(item => item.applied)).toEqual(parameters)
    expect(outcome.ok.parameters.every(item => item.origin.kind === 'explicit')).toBe(true)
    expect(await bodyOf(SONNET, { parameters })).toMatchObject({
      max_tokens: 4096,
      stop: ['END', 'STOP'],
    })
  })

  it('adds no default: an omitted parameter is not written', async () => {
    expect(await plan(SONNET, [])).toMatchObject({ ok: { parameters: [] } })
  })

  it.each([
    { kind: 'temperature', value: 0.5 },
    { kind: 'top-p', value: 0.5 },
    { kind: 'seed', value: '7' },
    { kind: 'frequency-penalty', value: 0 },
    { kind: 'presence-penalty', value: 0 },
  ] satisfies readonly Parameter[])(
    'refuses $kind $value before sending, never drops it',
    async parameter => {
      expect(await plan(SONNET, [parameter])).toEqual({
        failure: {
          kind: 'unsupported',
          field: parameter.kind,
          adapter: recordAdoption(ANTHROPIC_OWNER, SONNET),
        },
      })
    },
  )

  it('refuses values outside the record range', async () => {
    expect(await plan(OPUS, [{ kind: 'max-output-tokens', value: '128001' }])).toEqual({
      failure: { kind: 'invalid', field: 'max-output-tokens', reason: 'out-of-range' },
    })
    const many = Array.from({ length: 17 }, (_, index) => `S${index}`)
    expect(await plan(OPUS, [{ kind: 'stop', value: many }])).toEqual({
      failure: { kind: 'invalid', field: 'stop', reason: 'out-of-range' },
    })
  })
})

describe('the 1h cache marker', () => {
  // Sealed anthropic-cache-target.spec.ts:83-89: text mixed with images keeps the text target.
  it('marks the last text part of the last message, with text mixed with images', async () => {
    const body = await bodyOf(SONNET, {
      messages: [message('u1', 'user', [textBlock('b1', 'question'), imageBlock('i1')])],
    })
    expect(body).toMatchObject({
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'question', cache_control: CACHE },
            { type: 'image_url', image_url: { detail: 'auto' } },
          ],
        },
      ],
    })
  })

  // Sealed anthropic-family-current.spec.ts:677-713: a terminal pure-image user message.
  it('marks the last image of a last user message of images only', async () => {
    const body = await bodyOf(SONNET, {
      messages: [
        message('u1', 'user', [textBlock('b1', 'look')]),
        message('a1', 'assistant', [textBlock('t1', 'send it')]),
        message('u2', 'user', [imageBlock('i1'), imageBlock('i2', 'image/jpeg')]),
      ],
    })
    expect(body).toMatchObject({
      messages: [
        { role: 'user', content: [{ type: 'text', text: 'look' }] },
        { role: 'assistant', content: [{ type: 'text', text: 'send it' }] },
        {
          role: 'user',
          content: [
            { type: 'image_url' },
            { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,iVBORw0KGgo=' }, cache_control: CACHE },
          ],
        },
      ],
    })
    const text = JSON.stringify(body)
    expect(text.split('cache_control')).toHaveLength(2)
  })

  // Migration L02: a last message without a place for the marker is a refusal.
  it('refuses a request whose last message has no text and is not a user image message', async () => {
    expect(
      await encode(SONNET, {
        messages: [
          message('u1', 'user', [textBlock('b1', 'look up x')]),
          message('a1', 'assistant', [callBlock('c1', 'call_1')]),
          message('t1', 'tool', [resultBlock('r1', 'call_1')]),
        ],
        tools: [tool('lookup')],
      }),
    ).toEqual({
      failure: {
        kind: 'unsupported',
        field: 'no-cache-target',
        adapter: recordAdoption(ANTHROPIC_OWNER, SONNET),
      },
    })
  })
})

describe('request body', () => {
  it('writes every content as parts: tool calls, tool results and tool-result images', async () => {
    const body = await bodyOf(SONNET, {
      messages: [
        message('u1', 'user', [textBlock('b1', 'look up x')]),
        message('a1', 'assistant', [callBlock('c1', 'call 1')]),
        message('t1', 'tool', [resultBlock('r1', 'call 1'), textBlock('b2', 'found'), imageBlock('i1')]),
      ],
      tools: [tool('lookup')],
    })
    expect(body).toMatchObject({
      messages: [
        { role: 'user', content: [{ type: 'text', text: 'look up x' }] },
        {
          role: 'assistant',
          content: [],
          tool_calls: [{ type: 'function', function: { name: 'lookup', arguments: '{"q":"x"}' } }],
        },
        { role: 'tool', content: [{ type: 'text', text: 'found' }] },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: 'data:image/png;base64,iVBORw0KGgo=', detail: 'auto' },
              cache_control: CACHE,
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

  it('refuses an image media type outside png, jpeg, webp and gif', async () => {
    expect(
      await encode(SONNET, {
        messages: [message('u1', 'user', [textBlock('b1', 'look'), imageBlock('i1', 'image/bmp')])],
      }),
    ).toEqual({
      failure: {
        kind: 'unsupported',
        field: '/messages/0/blocks/1',
        adapter: recordAdoption(ANTHROPIC_OWNER, SONNET),
      },
    })
  })

  it('refuses a tool whose schema root is not an object', async () => {
    expect(
      await encode(SONNET, { tools: [tool('lookup', { kind: 'string', value: 'object' })] }),
    ).toEqual({
      failure: {
        kind: 'unsupported',
        field: '/tools/0/argumentsSchema',
        adapter: recordAdoption(ANTHROPIC_OWNER, SONNET),
      },
    })
  })
})
