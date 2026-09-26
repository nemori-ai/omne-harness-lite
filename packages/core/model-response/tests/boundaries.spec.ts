import { describe, expect, it } from 'vitest'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import {
  LosslessNumber,
  readJsonStrict,
  toOpaqueJson,
  writeJsonLossless,
} from '@omne-harness-lite/content-blocks'
import { OPAQUE_IDENTIFIER_WHITESPACE_CODE_POINTS } from '@omne-harness-lite/identity-values'
import { judgeModelResponse, validate } from '@omne-harness-lite/model-response'
import loopSchema from '@omne-harness-lite/loop-extension/schema' with { type: 'json' }
import {
  complete,
  failed,
  interrupted,
  object,
  omit,
  openedFailure,
  parse,
  text,
} from './fixtures.ts'

describe('S-13 complete conditional table and closed members', () => {
  const block = object(object(complete.reply)).blocks
  const oneBlock = Array.isArray(block) ? block[0] : undefined
  const openedTiming = complete.timing
  const values = [
    ['interrupted opened without retained delivered', { ...interrupted, timing: openedTiming }],
    ['run_cancelled unopened', { ...interrupted, initiator: 'run_cancelled' }],
    ['runtime_lost unopened', { ...interrupted, initiator: 'runtime_lost' }],
    [
      'run_cancelled reply',
      {
        ...complete,
        outcome: 'interrupted',
        initiator: 'run_cancelled',
        reply: { ...object(complete.reply), ending: 'interrupted_by_user' },
      },
    ],
    ['interrupted delivered', { ...interrupted, timing: openedTiming, delivered: [oneBlock] }],
    ['veto with reason', { ...complete, replyDisposition: { vetoed: { by: 'x', reason: 'why' } } }],
    ['veto without reason', { ...complete, replyDisposition: { vetoed: { by: 'x' } } }],
    ['side query consumed', { ...complete, replyDisposition: { consumed: { by: 'side_query' } } }],
    [
      'empty raw headers still own raw evidence',
      { ...failed, failure: { cause: 'unrecognized' }, raw: { headers: {} } },
    ],
    [
      'null raw upstream error is retained evidence',
      { ...failed, failure: { cause: 'unrecognized', upstreamError: { raw: null } } },
    ],
  ] as const
  for (const [name, value] of values)
    it(name, () => {
      expect(validate('ModelResponse', value)).toEqual({ valid: true })
      expect(judgeModelResponse(value)).toEqual({ ok: true })
    })
  for (const cause of loopSchema.$defs.FailureCause.enum.filter(
    value => value !== 'interrupted_mid_reply',
  ))
    it(`all foreign cause spellings remain shape-legal: ${cause}`, () =>
      expect(judgeModelResponse({ ...failed, failure: { cause, localError: 'trace' } })).toEqual({
        ok: true,
      }))
  const rejected = [
    ['unknown root member', { ...complete, extra: true }],
    ['late false', { ...complete, late: false }],
    ['present null stop reason', { ...complete, stopReason: null }],
    ['empty stop reason', { ...complete, stopReason: '' }],
    ['delivered empty', { ...interrupted, delivered: [] }],
    ['raw empty', { ...complete, raw: {} }],
    ['raw unknown', { ...complete, raw: { other: true } }],
    ['header number', { ...complete, raw: { headers: { x: 1 } } }],
    [
      'upstream error empty',
      { ...failed, failure: { cause: 'request_rejected', upstreamError: {} } },
    ],
    ['local error empty', { ...failed, failure: { cause: 'request_rejected', localError: '' } }],
    [
      'status fraction',
      {
        ...failed,
        failure: {
          cause: 'request_rejected',
          statusCode: new LosslessNumber('429.0000000000000000001'),
        },
      },
    ],
    [
      'foreign timing shape',
      { ...complete, timing: { ...object(complete.timing), sentAt: '2026-09-26' } },
    ],
    [
      'adjustment required requested is absent',
      {
        ...complete,
        route: { ...object(complete.route), parameterAdjustments: [{ name: 'x', sent: null }] },
      },
    ],
    [
      'dropped parameters duplicate',
      { ...complete, route: { ...object(complete.route), droppedParameters: ['x', 'x'] } },
    ],
    [
      'reply disposition branch overlap',
      { ...complete, replyDisposition: { vetoed: { by: 'x' }, consumed: { by: 'side_query' } } },
    ],
    ['reply disposition missing', omit(complete, 'replyDisposition')],
    ['reply disposition without reply', { ...interrupted, replyDisposition: 'persisted' }],
    ['initiator on success', { ...complete, initiator: 'user' }],
    [
      'runtime_lost reply',
      {
        ...complete,
        outcome: 'interrupted',
        initiator: 'runtime_lost',
        reply: { ...object(complete.reply), ending: 'interrupted_by_user' },
      },
    ],
    ['attempt missing when run present', omit(complete, 'attemptId')],
    ['run absent with attempt', { ...complete, call: omit(object(complete.call), 'runId') }],
    [
      'late on no run',
      { ...omit(complete, 'attemptId'), call: omit(object(complete.call), 'runId'), late: true },
    ],
  ] as const
  for (const [name, value] of rejected)
    it(name, () => expect(judgeModelResponse(value)).toEqual({ rejected: 'malformed' }))
})

describe('exact decimal representation and amount admission', () => {
  for (const source of ['9007199254740993', '1e400', '1e+400', '100000000000000000000000000000001'])
    it(`counts and amounts preserve ${source}`, () => {
      const number = new LosslessNumber(source)
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
      expect(judgeModelResponse(value)).toEqual({ ok: true })
      const result = object(parse(text(value)))
      expect(text(result)).toBe(text(value))
      expect(ExactDecimal.from(number).toString()).toBe(source)
      expect(Object.isFrozen(result)).toBe(true)
    })
  for (const source of ['0.123456789012345678901234567890', '1.234567890123456789e-300', '-0.0000'])
    it(`fractional monetary literal ${source} is never rounded`, () => {
      const cost = { cost_usd: new LosslessNumber(source), source: 'upstream_usage' }
      const value = { ...complete, cost }
      const original = text(value)
      expect(judgeModelResponse(value)).toEqual({ ok: true })
      expect(text(parse(original))).toBe(original)
    })
  for (const source of ['-1e-400', '-0.00000000000000000000000001'])
    it(`negative money ${source} cannot project to zero`, () =>
      expect(
        judgeModelResponse({
          ...complete,
          cost: { cost_usd: new LosslessNumber(source), source: 'upstream_usage' },
        }),
      ).toEqual({ rejected: 'malformed' }))
  for (const source of ['1.00000000000000000000000001', '0.00000000000000000001'])
    it(`fractional usage ${source} cannot project to an integer`, () =>
      expect(
        judgeModelResponse({
          ...complete,
          usage: { ...object(complete.usage), input_tokens: new LosslessNumber(source) },
        }),
      ).toEqual({ rejected: 'malformed' }))
  for (const source of ['0', '-0', '-0e400', '-9007199254740993', '-1e400'])
    it(`integer dispatch ${source} rejected without rounding`, () =>
      expect(judgeModelResponse({ ...complete, dispatch: new LosslessNumber(source) })).toEqual({
        rejected: 'dispatch_zero',
      }))
  it('retains null, opaque arbitrary keys, big integers and exponent spellings', () => {
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
    expect(text(value)).toContain('"n":1e400')
    expect(text(value)).toContain('"n":9007199254740993')
    expect(text(value)).toContain('"requested":null')
  })
})

describe('S-6 shared opaque identity boundary', () => {
  for (const point of OPAQUE_IDENTIFIER_WHITESPACE_CODE_POINTS)
    it(`boundary whitespace U+${point.toString(16)} is rejected but interior retained`, () => {
      const character = String.fromCodePoint(point)
      expect(validate('ResponseId', `${character}x`).valid).toBe(false)
      expect(validate('ResponseId', `x${character}`).valid).toBe(false)
      expect(validate('ResponseId', `x${character}x`).valid).toBe(true)
    })
  for (const value of ['', null, 1, {}, []])
    it(`invalid identifier ${String(value)}`, () =>
      expect(validate('ResponseId', value).valid).toBe(false))
  it('does not trim, normalize, generate, or compare upstream IDs', () => {
    expect(
      judgeModelResponse({
        ...complete,
        id: 'a\u0301',
        reply: { ...object(complete.reply), response: '\u00e1' },
      }),
    ).toEqual({ ok: true })
  })
})

describe('pure shape scope and no repair', () => {
  const outOfScope = [
    [
      'reply response mismatch',
      { ...complete, reply: { ...object(complete.reply), response: 'another' } },
    ],
    [
      'reverse clock order',
      {
        ...complete,
        timing: {
          sentAt: '2026-09-26T10:00:02Z',
          firstTokenAt: '2026-09-26T10:00:00Z',
          endedAt: '2026-09-26T10:00:01Z',
        },
      },
    ],
    [
      'provider not in snapshot',
      { ...complete, route: { ...object(complete.route), provider: 'other' } },
    ],
    [
      'parameter trace disagreements',
      {
        ...complete,
        route: {
          ...object(complete.route),
          parameters: { temperature: 1 },
          parameterAdjustments: [
            { name: 'temperature', requested: 1, sent: 0 },
            { name: 'temperature', requested: 0, sent: 1 },
          ],
          droppedParameters: ['temperature'],
        },
      },
    ],
    ['late is writer fact', { ...complete, late: true }],
    [
      'sensitive text is not silently repaired',
      {
        ...failed,
        failure: { cause: 'unrecognized', localError: 'writer-owned credential-like-text' },
        raw: { headers: { authorization: 'writer-owned arbitrary header' } },
      },
    ],
  ] as const
  for (const [name, value] of outOfScope)
    it(name, () => {
      const before = text(value)
      expect(judgeModelResponse(value)).toEqual({ ok: true })
      expect(text(value)).toBe(before)
    })
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
    it('invalid whole input is malformed without defaulting', () =>
      expect(judgeModelResponse(value)).toEqual({ rejected: 'malformed' }))
  it('preserves frozen inputs and freezes both result branches', () => {
    expect(Object.isFrozen(complete)).toBe(true)
    expect(Object.isFrozen(judgeModelResponse(complete))).toBe(true)
    expect(Object.isFrozen(judgeModelResponse(null))).toBe(true)
    expect(Object.isFrozen(validate('ModelResponse', complete))).toBe(true)
  })
  it('does not call getters or toJSON', () => {
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
    expect(judgeModelResponse(toJSON)).toEqual({ rejected: 'malformed' })
    expect(calls).toBe(0)
  })
  it('unknown boundary exceptions propagate without invented rejection', () => {
    const defect = new Error('foreign object trap')
    const value = new Proxy(
      {},
      {
        getPrototypeOf() {
          throw defect
        },
      },
    )
    expect(() => judgeModelResponse(value)).toThrow(defect)
    expect(() => validate('ModelResponse', value)).toThrow(defect)
  })
  it('representation failures remain the shared JSON boundary result', () => {
    expect(readJsonStrict('{"id":"one","\\u0069d":"two"}')).toEqual({ failed: 'duplicate_member' })
    expect(readJsonStrict('{')).toEqual({ failed: 'syntax' })
    expect(() => writeJsonLossless({ x: undefined })).toThrow(TypeError)
  })
})
