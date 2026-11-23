import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { JsonValue } from '@omne-harness/json-text'
import type { GatewayUsage, ReasoningDetail } from '@omne-harness/pi-ai-transport/chat-completions'
import { hooksOf } from '../src/rules.ts'
import { KIMI_RECORDS } from '../src/records.ts'
const RECORD = KIMI_RECORDS[0]

const HOOKS = hooksOf(RECORD)
const str = (value: string): JsonValue => ({ kind: 'string', value })
const num = (lexeme: string): JsonValue => ({ kind: 'number', lexeme })

function textDetail(text: string): ReasoningDetail {
  return {
    type: 'reasoning.text',
    format: 'unknown',
    raw: { type: str('reasoning.text'), text: str(text), format: str('unknown'), index: num('0') },
  }
}

describe('the reasoning rule kimi-reasoning-text/1', () => {
  const codec = HOOKS.reasoning
  if (codec === null) throw new Error('the record carries reasoning back')

  it('seals each reasoning text item as its members in key order, and nothing else', () => {
    const other: ReasoningDetail = {
      type: 'reasoning.encrypted',
      format: 'unknown',
      raw: { type: str('reasoning.encrypted'), text: str('sealed upstream'), data: str('x') },
    }
    expect(
      codec.seal([textDetail('first'), other, textDetail(''), textDetail('[REDACTED]')]),
    ).toEqual({
      ok: [{ payload: '{"format":"unknown","index":0,"text":"first","type":"reasoning.text"}' }],
    })
  })

  it('replays sealed items as they were, and thinking without a state as plain reasoning', () => {
    const [sealed] = (() => {
      const outcome = codec.seal([textDetail('kept')])
      if (!('ok' in outcome)) throw new Error('seal failed')
      return outcome.ok
    })()
    if (sealed === undefined) throw new Error('nothing sealed')
    expect(
      codec.replay(
        [{ payload: sealed.payload, format: 'kimi-reasoning-text-v1' }],
        [],
        'continuable',
      ),
    ).toEqual({
      ok: {
        kind: 'details',
        details: [
          {
            format: str('unknown'),
            index: num('0'),
            text: str('kept'),
            type: str('reasoning.text'),
          },
        ],
      },
    })
    expect(codec.replay([], ['a', 'b'], 'foreign')).toEqual({ ok: { kind: 'plain', text: 'ab' } })
    expect(codec.replay([], [], 'foreign')).toEqual({ ok: { kind: 'none' } })
  })

  it('refuses a payload that is not a reasoning text item', () => {
    for (const payload of ['not json', '[]', '{"type":"reasoning.text","text":""}'])
      expect(
        codec.replay([{ payload, format: 'kimi-reasoning-text-v1' }], [], 'continuable'),
      ).toEqual({
        failure: { kind: 'invalid', field: 'reasoning_state', reason: 'payload-not-replayable' },
      })
  })
})

describe('the usage rule kimi-usage/1', () => {
  function usage(details: JsonValue | undefined, cached: string | null = '3584'): GatewayUsage {
    return {
      promptTokens: '5009',
      completionTokens: '23',
      cachedTokens: cached,
      reasoningTokens: '18',
      raw: details === undefined ? {} : { prompt_tokens_details: details },
    }
  }
  const reported = (write: string): JsonValue => ({
    kind: 'object',
    entries: [
      { key: 'cached_tokens', value: num('3584') },
      { key: 'cache_write_tokens', value: num(write) },
    ],
  })

  it('splits the prompt into uncached input, cache read and cache write, with output and reasoning', () => {
    expect(HOOKS.usage(usage(reported('0')))).toEqual({
      ok: {
        items: [
          { name: 'input', state: 'known', lexeme: '1425', unit: 'token' },
          { name: 'output', state: 'known', lexeme: '23', unit: 'token' },
          { name: 'cache-read', state: 'known', lexeme: '3584', unit: 'token' },
          { name: 'cache-write', state: 'known', lexeme: '0', unit: 'token' },
          { name: 'reasoning', state: 'known', lexeme: '18', unit: 'token' },
        ],
        diagnostics: [],
      },
    })
  })

  it('leaves the input unknown when a part is not reported, and flags a negative remainder', () => {
    const input = (details: JsonValue | undefined) => {
      const read = HOOKS.usage(usage(details))
      if (!('ok' in read)) throw new Error('usage refused')
      return { input: read.ok.items[0], diagnostics: read.ok.diagnostics }
    }
    expect(input(undefined)).toEqual({
      input: { name: 'input', state: 'unknown', unit: 'token' },
      diagnostics: [],
    })
    expect(input(reported('9000'))).toEqual({
      input: { name: 'input', state: 'unknown', unit: 'token' },
      diagnostics: [{ kind: 'usage-inconsistent', field: 'input' }],
    })
    const odd = HOOKS.usage(usage(reported('1.5')))
    if (!('ok' in odd)) throw new Error('usage refused')
    expect(odd.ok.items.slice(0, 4).map(item => [item.name, item.state])).toEqual([
      ['input', 'unknown'],
      ['output', 'known'],
      ['cache-read', 'known'],
      ['cache-write', 'unknown'],
    ])
  })
})

describe('the tool schema rule object-root/1', () => {
  it('passes an object root and refuses any other', () => {
    const schema: JsonValue = { kind: 'object', entries: [] }
    expect(HOOKS.toolSchema(schema)).toEqual({ ok: schema })
    expect(HOOKS.toolSchema({ kind: 'array', items: [] })).toMatchObject({
      failure: { kind: 'unsupported', field: 'argumentsSchema' },
    })
  })
})

it.each(KIMI_RECORDS)('preserves a known all-zero terminal usage on $name', record => {
  expect(
    hooksOf(record).usage({
      promptTokens: '0',
      completionTokens: '0',
      cachedTokens: '0',
      reasoningTokens: '0',
      raw: {
        prompt_tokens_details: {
          kind: 'object',
          entries: [{ key: 'cache_write_tokens', value: { kind: 'number', lexeme: '0' } }],
        },
      },
    }),
  ).toEqual({
    ok: {
      items: ['input', 'output', 'cache-read', 'cache-write', 'reasoning'].map(name => ({
        name,
        state: 'known',
        lexeme: '0',
        unit: 'token',
      })),
      diagnostics: [],
    },
  })
})
it('does not infer zero from missing cached input or missing prompt totals', () => {
  for (const patch of [{ promptTokens: null }, { cachedTokens: null }]) {
    const result = HOOKS.usage({
      promptTokens: '10',
      completionTokens: null,
      cachedTokens: '0',
      reasoningTokens: null,
      raw: {
        prompt_tokens_details: {
          kind: 'object',
          entries: [{ key: 'cache_write_tokens', value: { kind: 'number', lexeme: '0' } }],
        },
      },
      ...patch,
    })
    if (!('ok' in result)) throw Error('usage failed')
    expect(result.ok.items.find(item => item.name === 'input')).toEqual({
      name: 'input',
      state: 'unknown',
      unit: 'token',
    })
    expect(result.ok.items.find(item => item.name === 'reasoning')).toEqual({
      name: 'reasoning',
      state: 'unknown',
      unit: 'token',
    })
    expect(result.ok.diagnostics).toEqual([])
  }
})
it('rejects redacted, wrong-type and malformed reasoning instead of replaying withheld content', () => {
  if (!HOOKS.reasoning) throw Error('missing codec')
  for (const payload of [
    '{"type":"reasoning.text","text":"[REDACTED]"}',
    '{"type":"reasoning.encrypted","text":"secret"}',
    '{"type":"reasoning.text","text":0}',
    '{"type":"reasoning.text"}',
    'null',
  ])
    expect(
      HOOKS.reasoning.replay(
        [{ payload, format: 'kimi-reasoning-text-v1' }],
        ['visible fallback'],
        'continuable',
      ),
    ).toEqual({
      failure: { kind: 'invalid', field: 'reasoning_state', reason: 'payload-not-replayable' },
    })
})
it.each(KIMI_RECORDS)(
  'reads the real terminal stream usage without losing cache partitions for $name',
  record => {
    const path = join(
      fileURLToPath(new URL('./fixtures/records/', import.meta.url)),
      encodeURIComponent(record.name),
      record.revision,
      'stream.sse',
    )
    const frames = readFileSync(path, 'utf8')
      .split('\n')
      .filter(line => line.startsWith('data:') && !line.includes('[DONE]'))
      .map(
        line =>
          JSON.parse(line.slice(5)) as {
            usage?: {
              prompt_tokens: number
              completion_tokens: number
              completion_tokens_details: { reasoning_tokens: number }
              prompt_tokens_details: { cached_tokens: number; cache_write_tokens: number }
            }
          },
      )
    const usage = frames.findLast(frame => frame.usage)?.usage
    if (!usage) throw Error('fixture terminal usage absent')
    const result = hooksOf(record).usage({
      promptTokens: String(usage.prompt_tokens),
      completionTokens: String(usage.completion_tokens),
      cachedTokens: String(usage.prompt_tokens_details.cached_tokens),
      reasoningTokens: String(usage.completion_tokens_details.reasoning_tokens),
      raw: {
        prompt_tokens_details: {
          kind: 'object',
          entries: [
            {
              key: 'cache_write_tokens',
              value: num(String(usage.prompt_tokens_details.cache_write_tokens)),
            },
          ],
        },
      },
    })
    if (!('ok' in result)) throw Error('usage refused')
    expect(result.ok.items).toEqual([
      {
        name: 'input',
        state: 'known',
        lexeme: String(
          usage.prompt_tokens -
            usage.prompt_tokens_details.cached_tokens -
            usage.prompt_tokens_details.cache_write_tokens,
        ),
        unit: 'token',
      },
      { name: 'output', state: 'known', lexeme: String(usage.completion_tokens), unit: 'token' },
      {
        name: 'cache-read',
        state: 'known',
        lexeme: String(usage.prompt_tokens_details.cached_tokens),
        unit: 'token',
      },
      {
        name: 'cache-write',
        state: 'known',
        lexeme: String(usage.prompt_tokens_details.cache_write_tokens),
        unit: 'token',
      },
      {
        name: 'reasoning',
        state: 'known',
        lexeme: String(usage.completion_tokens_details.reasoning_tokens),
        unit: 'token',
      },
    ])
    expect(result.ok.diagnostics).toEqual([])
  },
)
