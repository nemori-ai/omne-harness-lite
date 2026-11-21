import { describe, expect, it } from 'vitest'
import type { JsonValue } from '@omne-harness/json-text'
import type { GatewayUsage, ReasoningDetail } from '@omne-harness/pi-ai-transport/chat-completions'
import { hooksOf } from '../src/rules.ts'
import { RECORD } from './support/qwen.ts'

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

describe('the reasoning rule qwen-reasoning-text/1', () => {
  const codec = HOOKS.reasoning
  if (codec === null) throw new Error('the record carries reasoning back')

  it('seals each reasoning text item as its members in key order, and nothing else', () => {
    const other: ReasoningDetail = {
      type: 'reasoning.encrypted',
      format: 'unknown',
      raw: { type: str('reasoning.encrypted'), data: str('x') },
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
        [{ payload: sealed.payload, format: 'qwen-reasoning-text-v1' }],
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
        codec.replay([{ payload, format: 'qwen-reasoning-text-v1' }], [], 'continuable'),
      ).toEqual({
        failure: { kind: 'invalid', field: 'reasoning_state', reason: 'payload-not-replayable' },
      })
  })
})

describe('the usage rule qwen-usage/1', () => {
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
