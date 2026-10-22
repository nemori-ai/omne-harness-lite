// The revisioned rules behind the four hooks: the whole signed group, usage arithmetic, the tool
// schema subset and the cross-field check.
import { describe, expect, it } from 'vitest'
import type { JsonValue } from '@omne-harness/json-text'
import type { GatewayUsage, ReasoningDetail } from '@omne-harness/pi-ai-transport/chat-completions'
import { recordAdoption } from '@omne-harness/pi-ai-transport'
import { ANTHROPIC_OWNER } from '@omne-harness/pi-ai-anthropic'
import { hooksOf, REASONING_RULES, TOOL_SCHEMA_RULES, USAGE_RULES } from '../src/rules.ts'
import { recordNamed } from './support/anthropic.ts'

const SONNET = recordNamed('anthropic/claude-sonnet-5')
const FORMAT = 'anthropic-claude-v1'

function str(value: string): JsonValue {
  return { kind: 'string', value }
}

/** A joined detail; string members are strings, `index` a number, `null` the JSON null. */
function detail(members: Readonly<Record<string, string | number | null>>): ReasoningDetail {
  const raw = Object.fromEntries(
    Object.entries(members).map(([key, value]): [string, JsonValue] => [
      key,
      value === null
        ? { kind: 'null' }
        : typeof value === 'number'
          ? { kind: 'number', lexeme: String(value) }
          : str(value),
    ]),
  )
  const type = members['type']
  const format = members['format']
  return {
    type:
      type === 'reasoning.encrypted' || type === 'reasoning.text' || type === 'reasoning.summary'
        ? type
        : 'other',
    format: typeof format === 'string' ? format : null,
    raw,
  }
}

function okOf<T>(outcome: Readonly<{ ok: T }> | Readonly<{ failure: unknown }>): T {
  if (!('ok' in outcome)) throw new Error(`failure: ${JSON.stringify(outcome.failure)}`)
  return outcome.ok
}

const SIGNED = { type: 'reasoning.text', format: FORMAT, index: 0, text: 'think', signature: 'sig' }
const ENCRYPTED = { type: 'reasoning.encrypted', format: FORMAT, index: 1, data: 'cipher' }

describe('anthropic-signed-group/1', () => {
  const codec = REASONING_RULES['anthropic-signed-group/1'](SONNET)
  const adapter = recordAdoption(ANTHROPIC_OWNER, SONNET)

  it('seals the whole group of signed text and encrypted data as one payload, in arrival order', () => {
    expect(codec.seal([detail(SIGNED), detail({ ...ENCRYPTED, id: 'enc' })])).toEqual({
      ok: [
        {
          payload:
            '[{"format":"anthropic-claude-v1","index":0,"signature":"sig","text":"think","type":"reasoning.text"},{"data":"cipher","format":"anthropic-claude-v1","id":"enc","index":1,"type":"reasoning.encrypted"}]',
        },
      ],
    })
  })

  // Sealed anthropic-replay.ts:157-196: one item that Anthropic cannot take back spoils the group.
  it.each([
    ['unsigned text', { ...SIGNED, signature: null }],
    ['an empty signature', { ...SIGNED, signature: '' }],
    ['a signature without text', { type: 'reasoning.text', format: FORMAT, signature: 'sig' }],
    ['the redaction marker', { ...ENCRYPTED, data: '[REDACTED]' }],
    ['empty encrypted data', { ...ENCRYPTED, data: '' }],
    ['another format', { ...ENCRYPTED, format: 'openai-responses-v1' }],
    ['no format', { type: 'reasoning.encrypted', data: 'cipher' }],
    ['a summary', { type: 'reasoning.summary', format: FORMAT, summary: 'visible' }],
    ['an unknown type', { type: 'reasoning.other', format: FORMAT, data: 'x' }],
  ] as const)('seals nothing when the group holds %s', (_label, item) => {
    expect(codec.seal([detail(SIGNED), detail(item)])).toEqual({ ok: [] })
  })

  it('seals nothing for no details', () => {
    expect(codec.seal([])).toEqual({ ok: [] })
  })

  it('replays the carried groups as their items, in part order, and leaves thinking to them', () => {
    const [first] = okOf(codec.seal([detail(SIGNED)]))
    const [second] = okOf(codec.seal([detail(ENCRYPTED)]))
    if (first === undefined || second === undefined) throw new Error('sealed nothing')
    expect(
      codec.replay(
        [
          { payload: first.payload, format: FORMAT },
          { payload: second.payload, format: FORMAT },
        ],
        ['think'],
        'continuable',
      ),
    ).toEqual({
      ok: {
        kind: 'details',
        details: [detail(SIGNED).raw, detail(ENCRYPTED).raw].map(raw =>
          Object.fromEntries(Object.entries(raw).toSorted(([a], [b]) => (a < b ? -1 : 1))),
        ),
      },
    })
  })

  it('refuses a payload that is not a whole replayable group', () => {
    for (const payload of [
      'not json',
      '[]',
      JSON.stringify(SIGNED),
      JSON.stringify([{ ...SIGNED, signature: '' }]),
      JSON.stringify([SIGNED, { ...ENCRYPTED, data: '[REDACTED]' }]),
    ])
      expect(codec.replay([{ payload, format: FORMAT }], [], 'continuable')).toEqual({
        failure: { kind: 'invalid', field: 'reasoning_state', reason: 'payload-not-replayable' },
      })
  })

  it('refuses foreign thinking under the rule adapter: it has no signed form', () => {
    expect(codec.replay([], ['foreign thinking'], 'foreign')).toEqual({
      failure: { kind: 'unsupported', field: 'thinking', adapter },
    })
  })

  it('does not write own thinking without a carried group, so the request goes on', () => {
    expect(codec.replay([], ['unsigned thinking'], 'continuable')).toEqual({
      ok: { kind: 'none' },
    })
  })

  it('writes nothing for no parts and no or empty thinking', () => {
    for (const source of ['continuable', 'foreign'] as const) {
      expect(codec.replay([], [], source)).toEqual({ ok: { kind: 'none' } })
      expect(codec.replay([], [''], source)).toEqual({ ok: { kind: 'none' } })
    }
  })
})

function usage(input: Partial<GatewayUsage> & Readonly<{ cacheWrite?: string }>): GatewayUsage {
  const details: JsonValue =
    input.cacheWrite === undefined
      ? { kind: 'object', entries: [] }
      : {
          kind: 'object',
          entries: [
            { key: 'cache_write_tokens', value: { kind: 'number', lexeme: input.cacheWrite } },
          ],
        }
  return {
    promptTokens: input.promptTokens ?? null,
    completionTokens: input.completionTokens ?? null,
    cachedTokens: input.cachedTokens ?? null,
    reasoningTokens: input.reasoningTokens ?? null,
    raw: { prompt_tokens_details: details },
  }
}

const item = (name: string, lexeme: string | null) =>
  lexeme === null
    ? { name, state: 'unknown', unit: 'token' }
    : { name, state: 'known', lexeme, unit: 'token' }

// Sealed accounts.ts:17-36.
describe('anthropic-usage/1', () => {
  const anthropic = USAGE_RULES['anthropic-usage/1']()

  it('subtracts the cache read and write from the prompt', () => {
    expect(
      anthropic(
        usage({
          promptTokens: '100',
          completionTokens: '4',
          cachedTokens: '20',
          cacheWrite: '5',
          reasoningTokens: '2',
        }),
      ),
    ).toEqual({
      ok: {
        items: [
          item('input', '75'),
          item('output', '4'),
          item('cache-read', '20'),
          item('cache-write', '5'),
          item('reasoning', '2'),
        ],
        diagnostics: [],
      },
    })
  })

  it('a negative input remainder is unknown, never zero, with a diagnostic', () => {
    const negative = okOf(
      anthropic(usage({ promptTokens: '1', cachedTokens: '1', cacheWrite: '1' })),
    )
    expect(negative.items[0]).toEqual(item('input', null))
    expect(negative.diagnostics).toEqual([{ kind: 'usage-inconsistent', field: 'input' }])
  })

  it('missing counts stay unknown without a diagnostic', () => {
    expect(anthropic(usage({ promptTokens: '10', cachedTokens: '0' }))).toEqual({
      ok: {
        items: [
          item('input', null),
          item('output', null),
          item('cache-read', '0'),
          item('cache-write', null),
          item('reasoning', null),
        ],
        diagnostics: [],
      },
    })
  })

  it('keeps counts beyond the safe integers exact', () => {
    const big = usage({ promptTokens: '9007199254740995', cachedTokens: '1', cacheWrite: '1' })
    expect(okOf(anthropic(big)).items[0]).toEqual(item('input', '9007199254740993'))
  })
})

describe('object-root/1', () => {
  const toolSchema = TOOL_SCHEMA_RULES['object-root/1'](SONNET)

  it('passes an object schema unchanged and refuses any other root', () => {
    const schema: JsonValue = { kind: 'object', entries: [{ key: 'type', value: str('object') }] }
    expect(toolSchema(schema)).toEqual({ ok: schema })
    expect(toolSchema(str('object'))).toEqual({
      failure: {
        kind: 'unsupported',
        field: 'argumentsSchema',
        adapter: recordAdoption(ANTHROPIC_OWNER, SONNET),
      },
    })
  })
})

describe('check and hooksOf', () => {
  it('none/1 accepts every request, and every record has the signed-group codec', () => {
    const hooks = hooksOf(SONNET)
    expect(hooks.check({ applied: [], messages: [], treatments: [] })).toEqual({ ok: undefined })
    expect(hooks.reasoning).not.toBeNull()
  })
})
