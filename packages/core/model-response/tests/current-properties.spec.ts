import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import {
  LosslessNumber,
  readJsonStrict,
  toOpaqueJson,
  writeJsonLossless,
  type JsonObject,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import { OPAQUE_IDENTIFIER_WHITESPACE_CODE_POINTS } from '@omne-harness-lite/identity-values'
import {
  judgeModelResponse,
  judgePendingModelResponse,
  validate,
} from '@omne-harness-lite/model-response'
import loopSchema from '@omne-harness-lite/loop-extension/schema' with { type: 'json' }
import responseSchema from '@omne-harness-lite/model-response/schema' with { type: 'json' }
import { isObject } from '../src/json.ts'

const source = readFileSync(
  new URL(
    '../../../../.meta_harness/design/spec/data/model-response/v11/examples.md',
    import.meta.url,
  ),
  'utf8',
)
function parse(text: string): JsonValue {
  const result = readJsonStrict(text)
  if ('failed' in result) throw new Error(`bad accepted example: ${result.failed}`)
  return result.ok
}
function object(value: JsonValue | undefined): JsonObject {
  if (!isObject(value)) throw new Error('expected object example')
  return value
}
function example(heading: string): JsonObject {
  const begin = source.indexOf(`### ${heading}`)
  if (begin < 0) throw new Error(`missing ${heading}`)
  const block = source.slice(begin).match(/```json\n(\{[\s\S]*?\})\n```/u)?.[1]
  if (block === undefined) throw new Error(`missing JSON in ${heading}`)
  return object(parse(block))
}
function omit(value: JsonObject, ...keys: string[]): JsonObject {
  return Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)))
}
const complete = example('E-1 正常收尾')
const truncated = example('E-2 写到上限截断')
const interrupted = example('E-4 用户中断，还没有内容')
const openedFailure = example('E-5 首 token 之后的故障')
const failed = example('E-6 与 E-7 一次调用的两次发出')
const pending = example('MR7-complete')
const reply = object(complete.reply)
const timing = object(complete.timing)
const delivered = object(openedFailure).delivered

const order: readonly (readonly [string, unknown, string])[] = [
  [
    'unknown outcome before all',
    { ...complete, outcome: 'future', dispatch: 0, failure: { cause: 'future' }, cost: null },
    'outcome_unknown',
  ],
  [
    'dispatch before cause and shape',
    {
      ...complete,
      dispatch: new LosslessNumber('-1e400'),
      failure: { cause: 'future' },
      cost: null,
    },
    'dispatch_zero',
  ],
  [
    'cause before malformed shape',
    { ...omit(complete, 'reply'), failure: { cause: 'future', inBand: false }, cost: null },
    'cause_unknown',
  ],
  [
    'fractional dispatch is malformed',
    { ...complete, dispatch: new LosslessNumber('-0.01') },
    'malformed',
  ],
  [
    'bad reply member before reply on failure',
    { ...failed, reply: { ...reply, ending: 'future' } },
    'malformed',
  ],
  ['bad cost before missing reply', { ...omit(complete, 'reply'), cost: {} }, 'malformed'],
  [
    'bad failure member before interrupted condition',
    { ...interrupted, failure: { cause: 'request_rejected', inBand: false } },
    'malformed',
  ],
  [
    'missing reply before failure on success',
    { ...omit(complete, 'reply'), failure: { cause: 'request_rejected' } },
    'reply_missing',
  ],
  [
    'reply on failure before missing failure',
    { ...omit(failed, 'failure'), reply, delivered },
    'reply_on_failure',
  ],
  [
    'reply and delivered before failure on interrupted',
    { ...interrupted, reply, delivered, failure: { cause: 'request_rejected' } },
    'reply_and_delivered',
  ],
  [
    'missing failure before first token',
    omit(openedFailure, 'failure', 'delivered'),
    'failure_missing',
  ],
  [
    'failure on interrupted before bad inBand',
    { ...interrupted, failure: { cause: 'interrupted_mid_reply', inBand: true } },
    'failure_on_interrupted',
  ],
  [
    'failure on success before ending',
    {
      ...complete,
      failure: { cause: 'request_rejected' },
      reply: { ...reply, ending: 'truncated_at_limit' },
    },
    'failure_on_success',
  ],
  [
    'ending before first token',
    {
      ...complete,
      reply: { ...reply, ending: 'truncated_at_limit' },
      timing: omit(timing, 'firstTokenAt'),
    },
    'reply_ending_mismatch',
  ],
  [
    'first token before disposition',
    { ...omit(complete, 'replyDisposition'), timing: omit(timing, 'firstTokenAt') },
    'first_token_inconsistent',
  ],
  [
    'inBand missing status is finally malformed',
    { ...openedFailure, failure: { cause: 'interrupted_mid_reply', inBand: true } },
    'malformed',
  ],
  ['opened failure needs delivered', omit(openedFailure, 'delivered'), 'first_token_inconsistent'],
]

describe('MR11 conditional shapes and rejection order', () => {
  it('accepts all seven conditional rows and current optional fact variants', () => {
    for (const value of [
      complete,
      truncated,
      example('E-3 用户中断，已有内容'),
      interrupted,
      openedFailure,
      failed,
      example('E-10 开了口之后失去连续性'),
    ])
      expect(judgeModelResponse(value)).toEqual({ ok: true })
    for (const value of [
      { ...interrupted, timing: complete.timing },
      { ...interrupted, initiator: 'run_cancelled' },
      { ...interrupted, initiator: 'runtime_lost' },
      { ...complete, replyDisposition: { vetoed: { by: 'guard', reason: 'reason' } } },
      { ...complete, replyDisposition: { consumed: { by: 'side_query' } } },
      { ...failed, failure: { cause: 'unrecognized' }, raw: { headers: {} } },
      { ...failed, failure: { cause: 'unrecognized', upstreamError: { raw: null } } },
    ])
      expect(judgeModelResponse(value)).toEqual({ ok: true })
    for (const cause of loopSchema.$defs.FailureCause.enum.filter(
      value => value !== 'interrupted_mid_reply',
    ))
      expect(judgeModelResponse({ ...failed, failure: { cause, localError: 'trace' } })).toEqual({
        ok: true,
      })
  })

  it.each(order)('%s', (_name, value, reason) => {
    expect(judgeModelResponse(value)).toEqual({ rejected: reason })
  })

  it('rejects closed-member and no-run/late violations without repair', () => {
    for (const value of [
      { ...complete, extra: true },
      { ...complete, late: false },
      { ...complete, stopReason: null },
      { ...complete, raw: {} },
      { ...complete, raw: { headers: { x: 1 } } },
      { ...complete, replyDisposition: { vetoed: { by: 'x' }, consumed: { by: 'side_query' } } },
      { ...interrupted, replyDisposition: 'persisted' },
      { ...complete, initiator: 'user' },
      omit(complete, 'attemptId'),
      { ...complete, call: omit(object(complete.call), 'runId') },
      { ...omit(complete, 'attemptId'), call: omit(object(complete.call), 'runId'), late: true },
    ])
      expect(judgeModelResponse(value)).toEqual({ rejected: 'malformed' })
  })
})

describe('MR11 exact numbers and opaque JSON', () => {
  it('keeps every nonzero trim counter exact and rejects a fractional count first', () => {
    const zero = {
      merged: 0,
      cut: 0,
      omittedBytes: 0,
      byReason: { rate_merged: 0, frame_too_long: 0, quota_exhausted: 0, rejected: 0 },
    }
    const huge = new LosslessNumber('1e400')
    for (const field of ['merged', 'cut', 'omittedBytes', 'frame_too_long']) {
      const trims =
        field === 'frame_too_long'
          ? { ...zero, byReason: { ...zero.byReason, frame_too_long: huge } }
          : { ...zero, [field]: huge }
      expect(judgeModelResponse({ ...complete, trims })).toEqual({ ok: true })
      expect(writeJsonLossless(trims)).toContain('1e400')
    }
    expect(
      judgeModelResponse({
        ...omit(complete, 'reply'),
        trims: { ...zero, merged: new LosslessNumber('1.0000000000000000000001') },
      }),
    ).toEqual({ rejected: 'malformed' })
  })

  it('does not round huge counts, exponent literals, money, or nested values', () => {
    for (const spelling of ['9007199254740993', '1e400', '1e+400']) {
      const number = new LosslessNumber(spelling)
      const value = {
        ...complete,
        dispatch: number,
        attemptId: number,
        usage: {
          input_tokens: number,
          output_tokens: number,
          cache_read_tokens: 0,
          cache_write_tokens: 0,
          reasoning_tokens: number,
          source: 'upstream',
        },
        cost: { cost_usd: number, upstream_inference_cost_usd: number, source: 'upstream_usage' },
      }
      const before = writeJsonLossless(value)
      expect(judgeModelResponse(value)).toEqual({ ok: true })
      expect(writeJsonLossless(parse(before))).toBe(before)
      expect(ExactDecimal.from(number).toString()).toBe(spelling)
    }
    const opaque = parse(
      '{"category":"connector","n":1e400,"deep":{"n":9007199254740993,"null":null}}',
    )
    const value = {
      ...failed,
      failure: { cause: 'unrecognized', upstreamError: { raw: toOpaqueJson(opaque) } },
      route: {
        ...object(failed.route),
        parameterAdjustments: [{ name: 'x', requested: null, sent: toOpaqueJson(opaque) }],
        parameters: { extra: object(opaque) },
      },
    }
    expect(judgeModelResponse(value)).toEqual({ ok: true })
    expect(writeJsonLossless(value)).toContain('"n":1e400')
    expect(writeJsonLossless(value)).toContain('"requested":null')
  })

  it('rejects negative, fractional, and zero counters at exact boundaries', () => {
    for (const spelling of ['0', '-0', '-0e400', '-9007199254740993', '-1e400'])
      expect(judgeModelResponse({ ...complete, dispatch: new LosslessNumber(spelling) })).toEqual({
        rejected: 'dispatch_zero',
      })
    for (const spelling of ['-1e-400', '-0.00000000000000000000000001'])
      expect(
        judgeModelResponse({
          ...complete,
          cost: { cost_usd: new LosslessNumber(spelling), source: 'upstream_usage' },
        }),
      ).toEqual({ rejected: 'malformed' })
    for (const spelling of ['1.00000000000000000000000001', '0.00000000000000000001'])
      expect(
        judgeModelResponse({
          ...complete,
          usage: { ...object(complete.usage), input_tokens: new LosslessNumber(spelling) },
        }),
      ).toEqual({ rejected: 'malformed' })
    expect(
      judgeModelResponse({
        ...complete,
        route: {
          ...object(complete.route),
          parameters: { temperature: new LosslessNumber('2.0000000000000000000000001') },
        },
      }),
    ).toEqual({ rejected: 'malformed' })
    for (const spelling of ['0.123456789012345678901234567890', '1.234567890123456789e-300'])
      expect(
        judgeModelResponse({
          ...complete,
          cost: { cost_usd: new LosslessNumber(spelling), source: 'upstream_usage' },
        }),
      ).toEqual({ ok: true })
  })

  it('keeps the caller snapshot; current profile copied facts are shape-only at this receiver', () => {
    const route = object(complete.route)
    const snapshot = object(route.profileSnapshot)
    const value = {
      ...complete,
      route: {
        ...route,
        profileSnapshot: {
          ...snapshot,
          maxInputTokens: new LosslessNumber('9007199254740993'),
          maxOutputTokens: new LosslessNumber('1e400'),
        },
        parameters: { seed: new LosslessNumber('-9007199254740993') },
      },
    }
    const before = writeJsonLossless(value)
    expect(judgeModelResponse(value)).toEqual({ ok: true })
    expect(writeJsonLossless(value)).toBe(before)
    const body = {
      storage: 'opaque-storage',
      key: 'opaque-key',
      mediaType: 'application/json',
      bytes: new LosslessNumber('9007199254740993'),
    }
    expect(validate('RawResponse', { body })).toEqual({ valid: true })
    expect(judgeModelResponse({ ...complete, raw: { body } })).toEqual({ ok: true })
  })
})

describe('MR11 JSON and pure boundary discipline', () => {
  it('leaves writer-owned source and ordering facts for their actual owner', () => {
    const route = object(complete.route)
    const values = [
      { ...complete, reply: { ...reply, response: 'another_response' } },
      {
        ...complete,
        timing: {
          sentAt: '2026-09-28T10:00:02Z',
          firstTokenAt: '2026-09-28T10:00:00Z',
          endedAt: '2026-09-28T10:00:01Z',
        },
      },
      { ...complete, route: { ...route, provider: 'another_provider' } },
      {
        ...complete,
        route: {
          ...route,
          parameters: { temperature: 1 },
          parameterAdjustments: [
            { name: 'temperature', requested: 1, sent: 0 },
            { name: 'temperature', requested: 0, sent: 1 },
          ],
          droppedParameters: ['temperature'],
        },
      },
      { ...complete, late: true },
      {
        ...failed,
        failure: { cause: 'unrecognized', localError: 'writer-owned credential-like-text' },
        raw: { headers: { authorization: 'writer-owned arbitrary header' } },
      },
    ]
    for (const value of values) {
      const before = writeJsonLossless(value)
      expect(judgeModelResponse(value)).toEqual({ ok: true })
      expect(writeJsonLossless(value)).toBe(before)
    }
  })

  it('handles all opaque identifier boundary code points without trimming', () => {
    for (const point of OPAQUE_IDENTIFIER_WHITESPACE_CODE_POINTS) {
      const c = String.fromCodePoint(point)
      expect(validate('ResponseId', `${c}x`).valid).toBe(false)
      expect(validate('ResponseId', `x${c}`).valid).toBe(false)
      expect(validate('ResponseId', `x${c}x`).valid).toBe(true)
    }
    expect(validate('ResponseId', '')).toEqual({ valid: false })
    expect(
      judgeModelResponse({ ...complete, id: 'a\u0301', reply: { ...reply, response: '\u00e1' } }),
    ).toEqual({ ok: true })
  })

  it('copies mutable input, preserves frozen values, and never mutates caller-owned headers', () => {
    const headers = { 'x-order': ['second', 'first', 'first', ''] }
    const value = { ...complete, raw: { headers } }
    const before = writeJsonLossless(value)
    expect(judgeModelResponse(value)).toEqual({ ok: true })
    expect(writeJsonLossless(value)).toBe(before)
    expect(headers['x-order']).toEqual(['second', 'first', 'first', ''])
    expect(Object.isFrozen(complete)).toBe(true)
    expect(Object.isFrozen(judgeModelResponse(value))).toBe(true)
    expect(Object.isFrozen(judgeModelResponse(null))).toBe(true)
    expect(Object.isFrozen(validate('ModelResponse', value))).toBe(true)
  })

  it('rejects non-JSON, accessors and toJSON without invoking them; trap errors propagate', () => {
    for (const value of [
      undefined,
      null,
      'x',
      1,
      true,
      [],
      new Date(0),
      Infinity,
      NaN,
      1n,
      { ...complete, stopReason: undefined },
      Object.create({ ...complete }),
    ])
      expect(judgeModelResponse(value)).toEqual({ rejected: 'malformed' })
    let calls = 0
    const getter = {
      ...complete,
      get extra() {
        calls++
        return 1
      },
    }
    const toJSON = {
      ...complete,
      toJSON() {
        calls++
        return complete
      },
    }
    expect(judgeModelResponse(getter)).toEqual({ rejected: 'malformed' })
    expect(
      judgePendingModelResponse({
        ...pending,
        get extra() {
          calls++
          return 1
        },
      }),
    ).toEqual({ rejected: 'malformed' })
    expect(judgeModelResponse(toJSON)).toEqual({ rejected: 'malformed' })
    expect(calls).toBe(0)
    const defect = new Error('foreign trap')
    const trapped = new Proxy(
      {},
      {
        getPrototypeOf() {
          throw defect
        },
      },
    )
    expect(() => judgeModelResponse(trapped)).toThrow(defect)
    expect(() => validate('ModelResponse', trapped)).toThrow(defect)
  })

  it('retains fixed enum copies even if imported JSON objects are changed', () => {
    const originalOutcome = [...responseSchema.$defs.ResponseOutcome.enum]
    const originalCause = [...loopSchema.$defs.FailureCause.enum]
    try {
      responseSchema.$defs.ResponseOutcome.enum.push('outside_contract')
      loopSchema.$defs.FailureCause.enum.push('outside_contract')
      expect(judgeModelResponse({ ...complete, outcome: 'outside_contract' })).toEqual({
        rejected: 'outcome_unknown',
      })
      expect(judgeModelResponse({ ...failed, failure: { cause: 'outside_contract' } })).toEqual({
        rejected: 'cause_unknown',
      })
      expect(validate('ResponseOutcome', 'outside_contract')).toEqual({ valid: false })
    } finally {
      responseSchema.$defs.ResponseOutcome.enum.splice(0, Infinity, ...originalOutcome)
      loopSchema.$defs.FailureCause.enum.splice(0, Infinity, ...originalCause)
    }
  })

  it('keeps representation parsing distinct from judgment', () => {
    expect(readJsonStrict('{"id":"one","\\u0069d":"two"}')).toEqual({ failed: 'duplicate_member' })
    expect(readJsonStrict('{')).toEqual({ failed: 'syntax' })
    expect(() => writeJsonLossless({ x: undefined })).toThrow(TypeError)
  })
})
