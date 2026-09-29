import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  readJsonStrict,
  writeJsonLossless,
  type JsonObject,
} from '@omne-harness-lite/content-blocks'
import {
  judgeModelResponse,
  judgePendingModelResponse,
  validate,
} from '@omne-harness-lite/model-response'
import { isObject } from '../src/json.ts'

const examples = readFileSync(
  new URL(
    '../../../../.meta_harness/design/spec/data/model-response/v10/examples.md',
    import.meta.url,
  ),
  'utf8',
)
function example(heading: string): JsonObject {
  const start = examples.indexOf(`### ${heading}\n`)
  if (start < 0) throw new Error(`missing MR10 example: ${heading}`)
  const block = examples.slice(start).match(/```json\n(\{[\s\S]*?\})\n```/u)?.[1]
  if (block === undefined) throw new Error(`missing MR10 JSON: ${heading}`)
  const parsed = readJsonStrict(block)
  if ('failed' in parsed || !isObject(parsed.ok)) throw new Error(`invalid MR10 JSON: ${heading}`)
  return parsed.ok
}
function withSentAt(value: JsonObject, sentAt: string | number | null): JsonObject {
  const timing = value.timing
  if (!isObject(timing)) throw new Error('MR10 example lacks timing')
  return { ...value, timing: { ...timing, sentAt } }
}
function without(value: JsonObject, ...names: string[]): JsonObject {
  return Object.fromEntries(Object.entries(value).filter(([key]) => !names.includes(key)))
}

const recovered = example('恢复时没有可用实际发送时刻')
const openedRecovered = example('恢复时已开口但实际发送时刻丢失')
const preSendCancelled = example('锚点后零 send 的取消')
const invalidComplete = example('正常回复不能使用 null')
const complete = example('E-1 正常收尾')
const truncated = example('E-2 写到上限截断')
const interruptedReply = example('E-3 用户中断，已有内容')
const interruptedUnopened = example('E-4 用户中断，还没有内容——费用未知')
const failed = example('E-6 与 E-7 一次调用的两次发出')

describe('MR10 recovery timing representation', () => {
  it('accepts the three normative interrupted null examples without changing their facts', () => {
    for (const value of [recovered, openedRecovered, preSendCancelled]) {
      const before = writeJsonLossless(value)
      expect(validate('ModelResponse', value).valid).toBe(true)
      expect(judgeModelResponse(value)).toEqual({ ok: true })
      expect(writeJsonLossless(value)).toBe(before)
    }
    expect(validate('ModelResponse', invalidComplete).valid).toBe(false)
    expect(judgeModelResponse(invalidComplete)).toEqual({ rejected: 'malformed' })
  })

  it('requires sentAt as a present Instant or null and limits null to persisted interrupted', () => {
    const timing = interruptedUnopened.timing
    if (!isObject(timing)) throw new Error('invalid normative timing')
    expect(validate('Timing', { ...timing, sentAt: null }).valid).toBe(true)
    expect(validate('Timing', without(timing, 'sentAt')).valid).toBe(false)
    for (const bad of [0, '']) {
      expect(validate('Timing', { ...timing, sentAt: bad }).valid).toBe(false)
      expect(judgeModelResponse(withSentAt(interruptedUnopened, bad))).toEqual({
        rejected: 'malformed',
      })
    }
    expect(
      judgeModelResponse({ ...interruptedUnopened, timing: without(timing, 'sentAt') }),
    ).toEqual({
      rejected: 'malformed',
    })
    expect(judgeModelResponse(withSentAt(interruptedReply, null))).toEqual({ ok: true })
    for (const value of [complete, truncated, failed]) {
      expect(validate('ModelResponse', withSentAt(value, null)).valid).toBe(false)
      expect(judgeModelResponse(withSentAt(value, null))).toEqual({ rejected: 'malformed' })
    }
  })

  it('keeps named rejection priority before persisted null cross-field refusal', () => {
    expect(judgeModelResponse(without(invalidComplete, 'reply'))).toEqual({
      rejected: 'reply_missing',
    })
    expect(judgeModelResponse(without(withSentAt(failed, null), 'failure'))).toEqual({
      rejected: 'failure_missing',
    })
    const timing = invalidComplete.timing
    if (!isObject(timing)) throw new Error('invalid normative timing')
    expect(
      judgeModelResponse({ ...invalidComplete, timing: without(timing, 'firstTokenAt') }),
    ).toEqual({ rejected: 'first_token_inconsistent' })
    expect(judgeModelResponse(invalidComplete)).toEqual({ rejected: 'malformed' })
  })

  it('rejects null in every Pending branch at the member stage after leading named errors', () => {
    for (const response of [complete, interruptedReply]) {
      const pending = without(response, 'replyDisposition', 'late')
      expect(judgePendingModelResponse(pending)).toEqual({ ok: true })
      const nullPending = withSentAt(pending, null)
      expect(validate('PendingModelResponse', nullPending).valid).toBe(false)
      expect(judgePendingModelResponse(nullPending)).toEqual({ rejected: 'malformed' })
      const reply = complete.reply
      if (!isObject(reply)) throw new Error('normative complete reply missing')
      expect(
        judgePendingModelResponse({ ...nullPending, reply: { ...reply, ending: 'future' } }),
      ).toEqual({ rejected: 'malformed' })
      expect(judgePendingModelResponse({ ...nullPending, outcome: 'future', dispatch: 0 })).toEqual(
        {
          rejected: 'outcome_unknown',
        },
      )
      expect(judgePendingModelResponse({ ...nullPending, dispatch: 0 })).toEqual({
        rejected: 'dispatch_zero',
      })
      expect(judgePendingModelResponse({ ...nullPending, failure: { cause: 'future' } })).toEqual({
        rejected: 'cause_unknown',
      })
    }
  })

  it('preserves known accounts, original route facts and ordered raw headers beside null', () => {
    const usage = complete.usage,
      cost = complete.cost
    if (usage === undefined || cost === undefined)
      throw new Error('normative account facts missing')
    const value: JsonObject = {
      ...recovered,
      usage,
      cost,
      raw: { headers: { 'x-repeat': ['first', 'first', ''], 'x-empty': [] } },
    }
    const before = writeJsonLossless(value)
    expect(judgeModelResponse(value)).toEqual({ ok: true })
    expect(writeJsonLossless(value)).toBe(before)
    expect(value.route).toEqual(recovered.route)
    expect(value.usage).toEqual(usage)
    expect(value.cost).toEqual(cost)
  })
})
