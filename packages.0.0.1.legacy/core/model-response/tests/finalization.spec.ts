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
  judgeResponseFinalization,
  validate,
} from '@omne-harness-lite/model-response'
import { isObject } from '../src/json.ts'

function object(value: unknown): JsonObject {
  if (!isObject(value)) throw new Error('expected fixture object')
  return value
}
function parse(text: string): JsonValue {
  const parsed = readJsonStrict(text)
  if ('failed' in parsed) throw new Error(`invalid fixture: ${parsed.failed}`)
  return parsed.ok
}
const readyExamples = parse(
  readFileSync(new URL('fixtures/ready-examples.json', import.meta.url), 'utf8'),
)
if (!Array.isArray(readyExamples)) throw new Error('expected normative examples')
const rows = readyExamples.map(object)
const pending = object(rows.find(row => row.name === 'ready-complete-original-facts')?.value)
const final: JsonObject = { ...pending, replyDisposition: 'persisted' }
function changed(member: string, patch: JsonObject): JsonObject {
  return { ...final, [member]: { ...object(final[member]), ...patch } }
}
function reorder(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(reorder)
  if (isObject(value))
    return Object.fromEntries(
      Object.entries(value)
        .reverse()
        .map(([key, child]) => [key, reorder(child)]),
    )
  return value
}

describe('MR11 complete Pending and finalization relation', () => {
  for (const row of rows)
    it(`normative ready example: ${row.name}`, () => {
      if (row.definition !== 'PendingModelResponse' && row.definition !== 'ModelResponse')
        throw new Error('unexpected example definition')
      expect(validate(row.definition, row.value).valid).toBe(row.schemaValid)
    })

  it('accepts the three dispositions and applicable late without filling Pending', () => {
    const before = writeJsonLossless(pending)
    for (const replyDisposition of [
      'persisted',
      { vetoed: { by: 'extension', reason: 'declined' } },
      { consumed: { by: 'side_query' } },
      { consumed: { by: 'compaction' } },
    ]) {
      for (const late of [false, true]) {
        const target = { ...pending, replyDisposition, ...(late ? { late: true } : {}) }
        expect(judgeModelResponse(target)).toEqual({ ok: true })
        const result = judgeResponseFinalization(pending, target)
        expect(result).toEqual({ ok: true })
        expect(Object.isFrozen(result)).toBe(true)
      }
    }
    expect(judgeResponseFinalization(pending, pending)).toEqual({ rejected: 'malformed' })
    expect(judgePendingModelResponse(final)).toEqual({ rejected: 'malformed' })
    expect(writeJsonLossless(pending)).toBe(before)
  })

  it('preserves every original fact even when each changed final is independently legal', () => {
    const reply = object(pending.reply)
    const blocks = reply.blocks
    if (!Array.isArray(blocks)) throw new Error('missing fixture blocks')
    const calibration = object(pending.inputCalibration)
    const request = object(calibration.requestInput)
    const originalRoute = object(pending.route)
    const changedBinding = {
      ...object(originalRoute.adaptation),
      configuration: { revision: 'new-version', values: {} },
    }
    const cases = [
      { ...final, id: 'another-response' },
      changed('call', { callId: 'another-call' }),
      changed('call', { runId: 'another-run' }),
      { ...final, dispatch: 2 },
      { ...final, attemptId: 2 },
      { ...final, stopReason: 'another-reason' },
      changed('route', { selectedBy: 'layer_lock' }),
      changed('route', { upstreamRequestId: 'another-upstream-request' }),
      changed('route', { parameters: { temperature: 0.25 } }),
      {
        ...final,
        route: {
          ...originalRoute,
          adaptation: changedBinding,
          profileSnapshot: { ...object(originalRoute.profileSnapshot), adaptation: changedBinding },
        },
        inputCalibration: {
          ...calibration,
          requestInput: {
            ...request,
            countingBasis: { ...object(request.countingBasis), binding: changedBinding },
          },
        },
      },
      changed('reply', { id: 'another-message' }),
      changed('reply', { response: 'another-response' }),
      changed('reply', { createdAt: '2026-09-23T10:00:05Z' }),
      changed('reply', { blocks: [{ ...object(blocks[0]), text: 'changed' }, ...blocks.slice(1)] }),
      changed('timing', { endedAt: '2026-09-23T10:00:05Z' }),
      changed('usage', { input_tokens: 11 }),
      changed('cost', { cost_usd: new LosslessNumber('0.00310000000000000000001') }),
      changed('raw', { body: { ...object(object(pending.raw).body), key: 'another-body' } }),
      {
        ...final,
        inputCalibration: {
          ...calibration,
          requestInput: { ...request, prefixDigest: '4'.repeat(64) },
        },
      },
      {
        ...final,
        inputCalibration: {
          ...calibration,
          outputGroup: {
            ...object(calibration.outputGroup),
            blockDigests: ['4'.repeat(64), '4'.repeat(64)],
          },
        },
      },
    ]
    for (const target of cases) {
      expect(judgeModelResponse(target)).toEqual({ ok: true })
      expect(judgeResponseFinalization(pending, target)).toEqual({ rejected: 'malformed' })
    }
  })

  it('compares whole JSON values including absent, nested same-named fields and headers', () => {
    const route = object(pending.route)
    const original = {
      ...pending,
      route: {
        ...route,
        parameters: {
          extra: { late: true, replyDisposition: 'original', sequence: [1, 1, 2], nullable: null },
        },
      },
      raw: {
        ...object(pending.raw),
        headers: { 'x-order': ['one', 'one', 'two', ''], 'x-empty': [] },
      },
    }
    const completed = { ...original, replyDisposition: 'persisted' }
    expect(judgeResponseFinalization(original, completed)).toEqual({ ok: true })
    for (const extra of [
      { late: false, replyDisposition: 'original', sequence: [1, 1, 2], nullable: null },
      { late: true, replyDisposition: 'changed', sequence: [1, 1, 2], nullable: null },
      { late: true, replyDisposition: 'original', sequence: [1, 2, 1], nullable: null },
      { late: true, replyDisposition: 'original', sequence: [1, 1, 2] },
    ]) {
      const target = { ...completed, route: { ...original.route, parameters: { extra } } }
      expect(judgeModelResponse(target)).toEqual({ ok: true })
      expect(judgeResponseFinalization(original, target)).toEqual({ rejected: 'malformed' })
    }
    for (const headers of [
      { 'x-order': ['one', 'two', 'one', ''], 'x-empty': [] },
      { 'x-order': ['one', 'one', 'two', ''] },
    ])
      expect(
        judgeResponseFinalization(original, { ...completed, raw: { ...original.raw, headers } }),
      ).toEqual({ rejected: 'malformed' })
    expect(judgeResponseFinalization(original, { ...completed, stopReason: '' })).toEqual({
      rejected: 'malformed',
    })
  })

  it('preserves precise numbers and unknown without rounding or recalibration', () => {
    const original = {
      ...pending,
      dispatch: new LosslessNumber('9007199254740993'),
      cost: {
        cost_usd: new LosslessNumber('0.123456789012345678901234567890'),
        source: 'upstream_usage',
      },
      usage: { ...object(pending.usage), output_tokens: new LosslessNumber('9007199254740993') },
      raw: { ...object(pending.raw), headers: { 'x-order': ['one', 'one', '', 'two'] } },
    }
    const before = writeJsonLossless(original)
    const completed = { ...original, replyDisposition: 'persisted' }
    expect(judgeResponseFinalization(original, reorder(completed))).toEqual({ ok: true })
    expect(
      judgeResponseFinalization(original, {
        ...completed,
        dispatch: new LosslessNumber('9007199254740993.0'),
        cost: {
          ...original.cost,
          cost_usd: new LosslessNumber('12345678901234567890123456789e-29'),
        },
      }),
    ).toEqual({ ok: true })
    expect(
      judgeResponseFinalization(original, {
        ...completed,
        dispatch: new LosslessNumber('9007199254740992'),
      }),
    ).toEqual({ rejected: 'malformed' })
    expect(
      judgeResponseFinalization(original, {
        ...completed,
        cost: {
          ...original.cost,
          cost_usd: new LosslessNumber('0.123456789012345678901234567891'),
        },
      }),
    ).toEqual({ rejected: 'malformed' })
    expect(writeJsonLossless(original)).toBe(before)
    const copied = copyInputCalibration(pending.inputCalibration)
    if (!('ok' in copied)) throw new Error('valid original calibration rejected')
    expect(writeJsonLossless(copied.ok)).toBe(writeJsonLossless(pending.inputCalibration))
    const unknown = { ...original, cost: { cost_usd: 'unknown', source: 'none' } }
    expect(
      judgeResponseFinalization(unknown, { ...unknown, replyDisposition: 'persisted' }),
    ).toEqual({ ok: true })
    expect(
      judgeResponseFinalization(unknown, {
        ...unknown,
        cost: { cost_usd: 0, source: 'upstream_usage' },
        replyDisposition: 'persisted',
      }),
    ).toEqual({ rejected: 'malformed' })
    expect(unknown.cost.cost_usd).toBe('unknown')
  })

  it('keeps original derivations and rejects new derivations in final.reply', () => {
    const reply = object(pending.reply)
    const blocks = reply.blocks
    if (!Array.isArray(blocks)) throw new Error('missing fixture blocks')
    const image = {
      id: 'original-image',
      kind: 'image',
      mediaType: 'image/png',
      visibility: { toHuman: true, toModel: true },
      data: { storage: 'attachments', key: 'original-image', mediaType: 'image/png' },
    }
    const derived = {
      ...image,
      renderings: [
        {
          producedBy: 'system',
          blocks: [
            {
              id: 'original-rendering',
              kind: 'text',
              text: 'original',
              visibility: { toHuman: true, toModel: true },
            },
          ],
        },
      ],
      transcript: 'original',
    }
    for (const first of [image, derived]) {
      const original = { ...pending, reply: { ...reply, blocks: [first, ...blocks.slice(1)] } }
      const completed = { ...original, replyDisposition: 'persisted' }
      expect(judgeResponseFinalization(original, completed)).toEqual({ ok: true })
      for (const changed of [derived, { ...derived, transcript: 'changed' }, image]) {
        if (changed === first) continue
        const target = { ...completed, reply: { ...reply, blocks: [changed, ...blocks.slice(1)] } }
        expect(judgeModelResponse(target)).toEqual({ ok: true })
        expect(judgeResponseFinalization(original, target)).toEqual({ rejected: 'malformed' })
      }
    }
  })

  it('fully rejects Pending before touching final and retains each named error priority', () => {
    const defect = new Error('final must not be inspected')
    const untouched = new Proxy(
      {},
      {
        getPrototypeOf() {
          throw defect
        },
      },
    )
    for (const [original, reason] of [
      [{ ...pending, outcome: 'future', dispatch: 0 }, 'outcome_unknown'],
      [{ ...pending, dispatch: 0, failure: { cause: 'future' } }, 'dispatch_zero'],
      [{ ...pending, failure: { cause: 'future' } }, 'cause_unknown'],
      [
        { ...pending, reply: { ...object(pending.reply), ending: 'truncated_at_limit' } },
        'reply_ending_mismatch',
      ],
      [
        {
          ...pending,
          inputCalibration: {
            ...object(pending.inputCalibration),
            observedInput: {
              kind: 'from_usage',
              provenance: {
                adapterRevision: 'original',
                fieldPaths: ['usage'],
                upstreamRequestId: 'different',
              },
            },
          },
        },
        'malformed',
      ],
    ] as const)
      expect(judgeResponseFinalization(original, untouched)).toEqual({ rejected: reason })
    expect(() => judgeResponseFinalization(pending, untouched)).toThrow(defect)
    expect(
      judgeResponseFinalization(pending, { ...final, outcome: 'future', dispatch: 0 }),
    ).toEqual({ rejected: 'outcome_unknown' })
    expect(judgeResponseFinalization(pending, { ...final, dispatch: 0, reply: null })).toEqual({
      rejected: 'dispatch_zero',
    })
    expect(judgeResponseFinalization(pending, { ...final, failure: { cause: 'future' } })).toEqual({
      rejected: 'cause_unknown',
    })
    expect(
      judgeResponseFinalization(pending, {
        ...final,
        reply: { ...object(pending.reply), ending: 'truncated_at_limit' },
        inputCalibration: {},
      }),
    ).toEqual({ rejected: 'malformed' })
    expect(
      judgeResponseFinalization(pending, {
        ...final,
        reply: { ...object(pending.reply), ending: 'truncated_at_limit' },
      }),
    ).toEqual({ rejected: 'reply_ending_mismatch' })
  })

  it('rejects getters and non-JSON without invoking getters or silently dropping fields', () => {
    let getterCalls = 0
    const getter = {
      ...pending,
      get stopReason() {
        getterCalls++
        return 'changed'
      },
    }
    expect(judgeResponseFinalization(getter, final)).toEqual({ rejected: 'malformed' })
    expect(getterCalls).toBe(0)
    const getterFinal = {
      ...final,
      get extra() {
        getterCalls++
        return 1
      },
    }
    expect(judgeResponseFinalization(pending, getterFinal)).toEqual({ rejected: 'malformed' })
    expect(getterCalls).toBe(0)
    for (const value of [undefined, Infinity, NaN, 1n, new Date(0), { ...final, extra: undefined }])
      expect(judgeResponseFinalization(pending, value)).toEqual({ rejected: 'malformed' })
    expect(readJsonStrict('{"id":"one","id":"two"}')).toEqual({ failed: 'duplicate_member' })
  })
})
