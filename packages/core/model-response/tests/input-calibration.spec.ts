import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  LosslessNumber,
  readJsonStrict,
  writeJsonLossless,
  type JsonObject,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import {
  copyInputCalibration,
  judgeModelResponse,
  judgePendingModelResponse,
  validate,
} from '@omne-harness-lite/model-response'
import { isObject } from '../src/json.ts'

function object(value: unknown): JsonObject {
  if (!isObject(value)) throw new Error('expected object fixture')
  return value
}
const decoded = readJsonStrict(
  readFileSync(
    new URL(
      '../../../../.meta_harness/design/spec/data/model-response/v11/examples.json',
      import.meta.url,
    ),
    'utf8',
  ),
)
if ('failed' in decoded || !Array.isArray(decoded.ok)) throw new Error('invalid normative fixtures')
const examples = decoded.ok.map(object)
function sample(name = 'complete-disjoint-input'): JsonObject {
  const value = examples.find(row => row.name === name)?.value
  const parsed = readJsonStrict(writeJsonLossless(value))
  if ('failed' in parsed) throw new Error('invalid fixture')
  return object(parsed.ok)
}
function calibration(value: JsonObject): JsonObject {
  return object(value.inputCalibration)
}
function change(value: JsonObject, member: string, patch: JsonObject): JsonObject {
  const evidence = calibration(value)
  return {
    ...value,
    inputCalibration: { ...evidence, [member]: { ...object(evidence[member]), ...patch } },
  }
}
function without(value: JsonObject, name: string): JsonObject {
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== name))
}

describe('MR11 calibration representation and relations', () => {
  it('accepts exactly the unavailable vocabularies without defaulting missing reasons', () => {
    const value = sample()
    for (const [member, reasons] of [
      ['requestInput', ['not_retained', 'not_sent', 'send_unknown']],
      [
        'observedInput',
        [
          'missing_usage',
          'response_cache',
          'inconsistent_usage',
          'scope_unknown',
          'not_sent',
          'send_unknown',
        ],
      ],
      ['outputGroup', ['not_retained', 'not_sent', 'send_unknown']],
    ] as const) {
      for (const reason of reasons) {
        const next = {
          ...value,
          inputCalibration: { ...calibration(value), [member]: { kind: 'unavailable', reason } },
        }
        expect(judgeModelResponse(next)).toEqual({ ok: true })
      }
      for (const replacement of [
        { kind: 'unavailable' },
        { kind: 'unavailable', reason: 'future' },
      ])
        expect(
          judgeModelResponse({
            ...value,
            inputCalibration: { ...calibration(value), [member]: replacement },
          }),
        ).toEqual({ rejected: 'malformed' })
    }
  })

  it('retains delivered and empty output groups without synthesizing content', () => {
    const complete = sample()
    const base = {
      ...without(without(complete, 'reply'), 'replyDisposition'),
      outcome: 'interrupted',
      initiator: 'runtime_lost',
    }
    const delivered = change(
      { ...base, delivered: object(complete.reply).blocks ?? [] },
      'outputGroup',
      { source: 'delivered', completeness: 'partial' },
    )
    expect(judgeModelResponse(delivered)).toEqual({ ok: true })
    const none = change(base, 'outputGroup', { source: 'none', blockDigests: [] })
    expect(judgeModelResponse(none)).toEqual({ ok: true })
    expect(
      judgeModelResponse(change(none, 'outputGroup', { blockDigests: ['0'.repeat(64)] })),
    ).toEqual({ rejected: 'malformed' })
  })
  for (const row of examples)
    it(`normative ${row.name}`, () => {
      const value = object(row.value)
      const pending = String(row.name).startsWith('pending-')
      const before = writeJsonLossless(value)
      expect(validate(pending ? 'PendingModelResponse' : 'ModelResponse', value).valid).toBe(
        row.schemaValid,
      )
      expect((pending ? judgePendingModelResponse : judgeModelResponse)(value)).toEqual(
        row.relationsValid ? { ok: true } : { rejected: 'malformed' },
      )
      expect(writeJsonLossless(value)).toBe(before)
    })

  it('requires every evidence member in both representations without old-format defaults', () => {
    for (const name of ['complete-disjoint-input', 'pending-complete-required-evidence']) {
      const value = sample(name)
      const judge = name.startsWith('pending') ? judgePendingModelResponse : judgeModelResponse
      expect(judge(without(value, 'inputCalibration'))).toEqual({ rejected: 'malformed' })
      for (const member of ['requestInput', 'observedInput', 'outputGroup'])
        expect(judge({ ...value, inputCalibration: without(calibration(value), member) })).toEqual({
          rejected: 'malformed',
        })
    }
  })

  it('retains the ordered named rejections before new cross-value checks', () => {
    const value = sample()
    const badMember = { ...value, inputCalibration: {} }
    for (const [patch, reason] of [
      [{ outcome: 'future' }, 'outcome_unknown'],
      [{ dispatch: 0 }, 'dispatch_zero'],
      [{ failure: { cause: 'future' } }, 'cause_unknown'],
    ] as const)
      expect(judgeModelResponse({ ...badMember, ...patch })).toEqual({ rejected: reason })
    const reply = object(value.reply)
    expect(
      judgeModelResponse({ ...badMember, reply: { ...reply, ending: 'truncated_at_limit' } }),
    ).toEqual({ rejected: 'malformed' })
    const relation = change(value, 'requestInput', { projectionRevision: 'different' })
    expect(validate('ModelResponse', relation).valid).toBe(true)
    expect(judgeModelResponse(without(relation, 'reply'))).toEqual({ rejected: 'reply_missing' })
    expect(
      judgeModelResponse({ ...relation, reply: { ...reply, ending: 'truncated_at_limit' } }),
    ).toEqual({ rejected: 'reply_ending_mismatch' })
    expect(
      judgeModelResponse({ ...relation, timing: without(object(value.timing), 'firstTokenAt') }),
    ).toEqual({ rejected: 'first_token_inconsistent' })
    const pending = sample('pending-complete-required-evidence')
    expect(
      judgePendingModelResponse({
        ...change(pending, 'outputGroup', { blockDigests: [] }),
        reply: { ...object(pending.reply), ending: 'truncated_at_limit' },
      }),
    ).toEqual({ rejected: 'reply_ending_mismatch' })
  })

  it('uses exact integer arithmetic and does not turn unknown into zero', () => {
    const value = sample('upstream-total-with-missing-cache-detail')
    const usage = {
      ...object(value.usage),
      input_tokens: new LosslessNumber('9007199254740993'),
      cache_read_tokens: 2,
      cache_write_tokens: 'unknown',
    }
    const exact = { ...value, usage }
    expect(
      judgeModelResponse(
        change(exact, 'observedInput', { tokens: new LosslessNumber('9007199254740995') }),
      ),
    ).toEqual({ ok: true })
    expect(
      judgeModelResponse(
        change(exact, 'observedInput', { tokens: new LosslessNumber('9007199254740994') }),
      ),
    ).toEqual({ rejected: 'malformed' })
    expect(
      judgeModelResponse({
        ...value,
        usage: {
          ...object(value.usage),
          input_tokens: 0,
          cache_read_tokens: 0,
          cache_write_tokens: 0,
        },
      }),
    ).toEqual({ rejected: 'malformed' })
    const from = sample()
    expect(
      judgeModelResponse({
        ...from,
        usage: {
          input_tokens: 'unknown',
          output_tokens: 'unknown',
          cache_read_tokens: 'unknown',
          cache_write_tokens: 'unknown',
          source: 'none',
        },
      }),
    ).toEqual({ rejected: 'malformed' })
    expect(
      judgeModelResponse({ ...from, usage: { ...object(from.usage), input_tokens: 'unknown' } }),
    ).toEqual({ rejected: 'malformed' })
    const retained = sample('conflicting-source-retained-no-anchor')
    const before = writeJsonLossless(retained.usage)
    expect(judgeModelResponse(retained)).toEqual({ ok: true })
    expect(writeJsonLossless(retained.usage)).toBe(before)
  })

  it('compares complete bindings without object-key order or floating-point collapse', () => {
    const value = sample()
    const request = object(calibration(value).requestInput)
    const basis = object(request.countingBasis)
    const binding = object(basis.binding)
    for (const name of ['implementation', 'definition', 'configuration']) {
      const changed = { ...binding, [name]: { ...object(binding[name]), revision: 'changed' } }
      expect(
        judgeModelResponse(
          change(value, 'requestInput', { countingBasis: { ...basis, binding: changed } }),
        ),
      ).toEqual({ rejected: 'malformed' })
    }
    const reordered = Object.fromEntries(Object.entries(binding).reverse())
    expect(
      judgeModelResponse(
        change(value, 'requestInput', { countingBasis: { ...basis, binding: reordered } }),
      ),
    ).toEqual({ ok: true })
    const configuration = {
      ...object(binding.configuration),
      values: { integer: new LosslessNumber('9007199254740993'), ordered: [1, 2, 1] },
    }
    const captured = { ...binding, configuration }
    const route = object(value.route)
    const large = change(
      {
        ...value,
        route: {
          ...route,
          adaptation: captured,
          profileSnapshot: { ...object(route.profileSnapshot), adaptation: captured },
        },
      },
      'requestInput',
      { countingBasis: { ...basis, binding: captured } },
    )
    expect(judgeModelResponse(large)).toEqual({ ok: true })
    for (const values of [
      { integer: new LosslessNumber('9007199254740992'), ordered: [1, 2, 1] },
      { integer: new LosslessNumber('9007199254740993'), ordered: [1, 1, 2] },
    ])
      expect(
        judgeModelResponse(
          change(large, 'requestInput', {
            countingBasis: {
              ...basis,
              binding: { ...captured, configuration: { ...configuration, values } },
            },
          }),
        ),
      ).toEqual({ rejected: 'malformed' })
  })

  it('checks observed route facts only when both are supplied; output sources and lengths agree', () => {
    const value = sample()
    const provenance = object(object(calibration(value).observedInput).provenance)
    for (const name of ['upstreamRequestId', 'upstreamModel', 'servingProvider']) {
      const current = change(
        { ...value, route: { ...object(value.route), [name]: 'actual' } },
        'observedInput',
        { provenance: { ...provenance, [name]: 'different' } },
      )
      expect(judgeModelResponse(current)).toEqual({ rejected: 'malformed' })
      expect(judgeModelResponse(change(current, 'observedInput', { provenance }))).toEqual({
        ok: true,
      })
    }
    expect(
      judgeModelResponse(change(value, 'outputGroup', { source: 'none', blockDigests: [] })),
    ).toEqual({ rejected: 'malformed' })
    expect(judgeModelResponse(change(value, 'outputGroup', { source: 'delivered' }))).toEqual({
      rejected: 'malformed',
    })
    expect(
      judgeModelResponse(
        change({ ...value, reply: { ...object(value.reply), blocks: [] } }, 'outputGroup', {
          blockDigests: [],
        }),
      ),
    ).toEqual({ ok: true })
  })
})

describe('copyInputCalibration ownership and local scope', () => {
  it('deeply freezes an independent lossless snapshot, preserving sequences and duplicates', () => {
    const input = object(JSON.parse(writeJsonLossless(calibration(sample()))))
    const original = writeJsonLossless(input)
    const copied = copyInputCalibration(input)
    if (!('ok' in copied)) throw new Error('copy rejected valid fixture')
    function frozen(value: unknown): void {
      if (value === null || typeof value !== 'object') return
      expect(Object.isFrozen(value)).toBe(true)
      for (const item of Object.values(value)) frozen(item)
    }
    frozen(copied)
    const mutable = input as Record<string, JsonValue>
    ;(object(mutable.outputGroup) as Record<string, JsonValue>).blockDigests = []
    ;(object(object(mutable.observedInput).provenance) as Record<string, JsonValue>).fieldPaths = [
      'changed',
    ]
    ;(
      object(object(object(mutable.requestInput).countingBasis).binding) as Record<
        string,
        JsonValue
      >
    ).configuration = { revision: 'changed', values: {} }
    expect(writeJsonLossless(copied.ok)).toBe(original)
    const exact = copyInputCalibration({
      ...calibration(sample()),
      requestInput: {
        ...object(calibration(sample()).requestInput),
        prefixBoundary: new LosslessNumber('9007199254740993'),
      },
    })
    expect('ok' in exact && writeJsonLossless(exact.ok)).toContain('9007199254740993')
  })

  it('rejects accessor/cyclic/non-JSON values without invoking getters or dropping fields', () => {
    let calls = 0
    const getter = {
      ...calibration(sample()),
      get unknown() {
        calls++
        return 0
      },
    }
    const cycle: Record<string, unknown> = { ...calibration(sample()) }
    cycle.cycle = cycle
    for (const value of [
      getter,
      cycle,
      { ...calibration(sample()), unknown: undefined },
      new Date(),
      null,
    ])
      expect(copyInputCalibration(value)).toEqual({ rejected: 'malformed' })
    expect(calls).toBe(0)
  })

  it('checks local versions without claiming complete response or provenance validation', () => {
    const value = sample()
    expect(
      copyInputCalibration(
        calibration(change(value, 'requestInput', { projectionRevision: 'changed' })),
      ),
    ).toEqual({ rejected: 'malformed' })
    expect(
      copyInputCalibration(
        calibration(change(value, 'outputGroup', { projectionRevision: 'changed' })),
      ),
    ).toEqual({ rejected: 'malformed' })
    const independent = sample('known-output-independent-projection-version')
    expect(copyInputCalibration(calibration(independent))).toHaveProperty('ok')
    const copied = copyInputCalibration(calibration(value))
    expect(copied).toHaveProperty('ok')
    expect(
      judgeModelResponse({ ...value, usage: { ...object(value.usage), input_tokens: 'unknown' } }),
    ).toEqual({ rejected: 'malformed' })
  })
})
