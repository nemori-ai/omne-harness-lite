// The revisioned rules behind the four hooks: encrypted reasoning, usage arithmetic and scope,
// the tool schema subset and the cross-field check.
import { describe, expect, it } from 'vitest'
import type { JsonValue } from '@omne-harness/json-text'
import type { GatewayUsage, ReasoningDetail } from '@omne-harness/pi-ai-transport/chat-completions'
import { recordAdoption } from '@omne-harness/pi-ai-transport'
import { OPENAI_OWNER } from '@omne-harness/pi-ai-openai'
import {
  hooksOf,
  REASONING_RULES,
  TOOL_SCHEMA_RULES,
  USAGE_RULES,
} from '../src/rules.ts'
import { recordNamed } from './support/openai.ts'

const SOL = recordNamed('openai/gpt-5.6-sol')

function str(value: string): JsonValue {
  return { kind: 'string', value }
}

function detail(members: Readonly<Record<string, string>>): ReasoningDetail {
  const raw = Object.fromEntries(Object.entries(members).map(([key, value]) => [key, str(value)]))
  const type = members['type']
  return {
    type:
      type === 'reasoning.encrypted' || type === 'reasoning.text' || type === 'reasoning.summary'
        ? type
        : 'other',
    format: members['format'] ?? null,
    raw,
  }
}

function okOf<T>(outcome: Readonly<{ ok: T }> | Readonly<{ failure: unknown }>): T {
  if (!('ok' in outcome)) throw new Error(`failure: ${JSON.stringify(outcome.failure)}`)
  return outcome.ok
}

const ENCRYPTED = { type: 'reasoning.encrypted', format: 'openai-responses-v1', data: 'cipher' }

describe('openai-encrypted/1', () => {
  const codec = REASONING_RULES['openai-encrypted/1']()

  it('seals each encrypted OpenAI item with ciphertext as one payload, in arrival order', () => {
    const sealed = codec.seal([
      detail({ type: 'reasoning.summary', format: 'openai-responses-v1', summary: 'visible' }),
      detail({ ...ENCRYPTED, data: 'first', id: 'rs_1' }),
      detail({ ...ENCRYPTED, data: 'second' }),
    ])
    expect(sealed).toEqual({
      ok: [
        { payload: '{"data":"first","format":"openai-responses-v1","id":"rs_1","type":"reasoning.encrypted"}' },
        { payload: '{"data":"second","format":"openai-responses-v1","type":"reasoning.encrypted"}' },
      ],
    })
  })

  it('never seals redacted, empty, foreign-format or visible items', () => {
    expect(
      codec.seal([
        detail({ ...ENCRYPTED, data: '[REDACTED]' }),
        detail({ ...ENCRYPTED, data: '' }),
        detail({ ...ENCRYPTED, format: 'anthropic-claude-v1' }),
        detail({ type: 'reasoning.encrypted', data: 'no format' }),
        detail({ type: 'reasoning.text', format: 'openai-responses-v1', text: 'visible' }),
      ]),
    ).toEqual({ ok: [] })
  })

  it('replays carried parts as the sealed items, and refuses a payload that is not one', () => {
    const [part] = okOf(codec.seal([detail(ENCRYPTED)]))
    if (part === undefined) throw new Error('sealed nothing')
    const replayed = codec.replay([{ payload: part.payload, format: 'openai-responses-v1' }], ['ignored'])
    expect(replayed).toEqual({
      ok: {
        kind: 'details',
        details: [{ type: str('reasoning.encrypted'), format: str('openai-responses-v1'), data: str('cipher') }],
      },
    })
    for (const payload of ['not json', '[]', '{"type":"reasoning.summary","summary":"x"}', JSON.stringify({ ...ENCRYPTED, data: '[REDACTED]' })])
      expect(codec.replay([{ payload, format: 'openai-responses-v1' }], [])).toEqual({
        failure: { kind: 'invalid', field: 'reasoning_state', reason: 'payload-not-replayable' },
      })
  })

  it('writes native thinking of a message without parts as plain reasoning, else nothing', () => {
    expect(codec.replay([], ['a', 'b'])).toEqual({ ok: { kind: 'plain', text: 'ab' } })
    expect(codec.replay([], [])).toEqual({ ok: { kind: 'none' } })
  })

  it('none/1 gives no codec', () => {
    expect(REASONING_RULES['none/1']()).toBeNull()
  })
})

function usage(input: Partial<GatewayUsage> & Readonly<{ cacheWrite?: string }>): GatewayUsage {
  const details: JsonValue =
    input.cacheWrite === undefined
      ? { kind: 'object', entries: [] }
      : { kind: 'object', entries: [{ key: 'cache_write_tokens', value: { kind: 'number', lexeme: input.cacheWrite } }] }
  return {
    promptTokens: input.promptTokens ?? null,
    completionTokens: input.completionTokens ?? null,
    cachedTokens: input.cachedTokens ?? null,
    reasoningTokens: input.reasoningTokens ?? null,
    raw: { prompt_tokens_details: details },
  }
}

const item = (name: string, lexeme: string | null) =>
  lexeme === null ? { name, state: 'unknown', unit: 'token' } : { name, state: 'known', lexeme, unit: 'token' }

describe('usage', () => {
  const openAi = USAGE_RULES['openai-usage/1']()
  const unknownScope = USAGE_RULES['unknown-scope/1']()
  // The sealed refusal tests: 123 prompt, 20 read, 3 written leave 100 uncached.
  const sealed = usage({ promptTokens: '123', completionTokens: '7', cachedTokens: '20', cacheWrite: '3', reasoningTokens: '5' })

  it('openai-usage/1 subtracts cache reads and writes from the prompt', () => {
    expect(openAi(sealed)).toEqual({
      ok: [item('input', '100'), item('output', '7'), item('cache-read', '20'), item('cache-write', '3'), item('reasoning', '5')],
    })
  })

  it('a negative input remainder is unknown, never zero; missing counts stay unknown', () => {
    expect(okOf(openAi(usage({ promptTokens: '1', cachedTokens: '2', cacheWrite: '0' })))[0]).toEqual(item('input', null))
    expect(openAi(usage({ promptTokens: '10', completionTokens: '3' }))).toEqual({
      ok: [item('input', null), item('output', '3'), item('cache-read', null), item('cache-write', null), item('reasoning', null)],
    })
  })

  it('keeps counts beyond the safe integers exact', () => {
    const big = usage({ promptTokens: '9007199254740993', cachedTokens: '0', cacheWrite: '0' })
    expect(okOf(openAi(big))[0]).toEqual(item('input', '9007199254740993'))
  })

  it('unknown-scope/1 keeps every count but the input, whose scope is unknown', () => {
    expect(unknownScope(sealed)).toEqual({
      ok: [item('input', null), item('output', '7'), item('cache-read', '20'), item('cache-write', '3'), item('reasoning', '5')],
    })
  })
})

describe('object-root/1', () => {
  const toolSchema = TOOL_SCHEMA_RULES['object-root/1'](SOL)

  it('passes an object schema unchanged and refuses any other root', () => {
    const schema: JsonValue = { kind: 'object', entries: [{ key: 'type', value: str('object') }] }
    expect(toolSchema(schema)).toEqual({ ok: schema })
    expect(toolSchema(str('object'))).toEqual({
      failure: { kind: 'unsupported', field: 'argumentsSchema', adapter: recordAdoption(OPENAI_OWNER, SOL) },
    })
  })
})

describe('check and hooksOf', () => {
  it('none/1 accepts every request', () => {
    expect(hooksOf(SOL).check({ applied: [], messages: [], treatments: [] })).toEqual({ ok: undefined })
  })

  it('a Pro record gets the unknown scope, the others the OpenAI usage', () => {
    const pro = hooksOf(recordNamed('openai/gpt-5.6-sol-pro'))
    const plain = hooksOf(SOL)
    const sealed = usage({ promptTokens: '5', cachedTokens: '0', cacheWrite: '0' })
    expect(okOf(pro.usage(sealed))[0]).toEqual(item('input', null))
    expect(okOf(plain.usage(sealed))[0]).toEqual(item('input', '5'))
    expect(plain.reasoning).not.toBeNull()
  })
})
