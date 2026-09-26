import {
  isJsonNumber,
  LosslessNumber,
  validate as validateContent,
  type JsonValue,
  type JsonNumber,
  type JsonObject,
} from '@omne-harness-lite/content-blocks'
import { instantFromRfc3339 } from '@omne-harness-lite/offer-expiry'
import { ExactDecimal } from './decimal.ts'
import { isObject, snapshotJson, structureValid, validate, type SchemaDefName } from './schema.ts'
import type { AccountJudgment } from './types.ts'

export function judgeAccountValue(kind: SchemaDefName, value: unknown): AccountJudgment {
  const copied = snapshotJson(value)
  if (kind === 'CostCorrection' && (!isObject(copied) || !validTarget(copied.target)))
    return Object.freeze({ rejected: 'correction_without_target' })
  if (copied === undefined || !structureValid(kind, copied))
    return Object.freeze({ rejected: 'malformed' })
  if (numbers(copied).some(number => ExactDecimal.from(number).compare(ExactDecimal.from(0)) < 0))
    return Object.freeze({ rejected: 'negative_amount' })
  if (badSource(kind, copied)) return Object.freeze({ rejected: 'unknown_with_source' })
  if (
    kind === 'ToolCallAccount' &&
    isObject(copied) &&
    isObject(copied.cost) &&
    Array.isArray(copied.cost.items) &&
    copied.cost.items.some(item => isObject(item) && item.cost_usd === 'unknown') &&
    isJsonNumber(copied.cost.total_usd)
  )
    return Object.freeze({ rejected: 'total_not_unknown' })
  if (!combinations(kind, copied) || !validate(kind, copied).valid)
    return Object.freeze({ rejected: 'malformed' })
  return Object.freeze({ ok: true })
}

function validTarget(value: JsonValue | undefined): boolean {
  if (!isObject(value)) return false
  if (value.kind === 'model_response')
    return Object.keys(value).length === 2 && validate('ResponseId', value.responseId).valid
  if (value.kind === 'tool_execution') {
    return Object.keys(value).length === 2 && validateContent('CallId', value.callId).valid
  }
  return false
}
function numbers(value: JsonValue): readonly JsonNumber[] {
  if (isJsonNumber(value)) return [value]
  if (Array.isArray(value)) return value.flatMap(numbers)
  if (isObject(value)) return Object.values(value).flatMap(numbers)
  return []
}
const tokens = ['input_tokens', 'output_tokens', 'cache_read_tokens', 'cache_write_tokens'] as const
function badSource(kind: SchemaDefName, value: JsonValue): boolean {
  if (!isObject(value)) return false
  if (kind === 'Usage') {
    const allUnknown = tokens.every(token => value[token] === 'unknown')
    return value.source === 'none'
      ? !allUnknown || Object.hasOwn(value, 'reasoning_tokens')
      : allUnknown
  }
  if (kind === 'Cost')
    return value.source === 'none'
      ? value.cost_usd !== 'unknown' || Object.hasOwn(value, 'upstream_inference_cost_usd')
      : value.cost_usd === 'unknown'
  if (kind === 'CostItem') return (value.source === 'none') !== (value.cost_usd === 'unknown')
  if (kind === 'ToolCallAccount')
    return (
      (isObject(value.usage) && badSource('Usage', value.usage)) ||
      (isObject(value.cost) &&
        Array.isArray(value.cost.items) &&
        value.cost.items.some(item => badSource('CostItem', item)))
    )
  return false
}
function combinations(kind: SchemaDefName, value: JsonValue): boolean {
  if (kind === 'AttemptId')
    return isJsonNumber(value) && ExactDecimal.from(value).compare(ExactDecimal.from(1)) >= 0
  if (!isObject(value)) return true
  if (kind === 'Usage')
    return (
      !isJsonNumber(value.reasoning_tokens) ||
      !isJsonNumber(value.output_tokens) ||
      ExactDecimal.from(value.reasoning_tokens).compare(ExactDecimal.from(value.output_tokens)) <= 0
    )
  if (kind === 'CostItem')
    return value.source !== 'model_response' || value.service === 'model_call'
  if (kind === 'TrimSummary') return trimValid(value)
  if (kind === 'FrameAccount') return frameValid(value)
  if (kind === 'CostCorrection')
    return (
      validInstant(value.at) &&
      (value.obtainedVia !== 'generation_endpoint' ||
        (isObject(value.target) && value.target.kind === 'model_response'))
    )
  if (kind !== 'ToolCallAccount') return true
  if (!isObject(value.cost) || !Array.isArray(value.cost.items) || !isObject(value.wallClock))
    return false
  const items = value.cost.items
  if (!items.every(item => combinations('CostItem', item))) return false
  const mirrors = items.filter(item => isObject(item) && item.service === 'model_call')
  const references = mirrors.map(item => (isObject(item) ? item.reference : undefined))
  if (
    new Set(references).size !== references.length ||
    mirrors.length > 0 !== Object.hasOwn(value, 'usage')
  )
    return false
  if (isObject(value.usage) && !combinations('Usage', value.usage)) return false
  const sum = amountSum(
    items.flatMap(item =>
      isObject(item) && (isJsonNumber(item.cost_usd) || item.cost_usd === 'unknown')
        ? [item.cost_usd]
        : [],
    ),
  )
  if (
    sum !== 'unknown' &&
    (value.cost.total_usd === 'unknown' ||
      !isJsonNumber(value.cost.total_usd) ||
      sum.compare(ExactDecimal.from(value.cost.total_usd)) !== 0)
  )
    return false
  if (value.frames !== 'unknown' && (!isObject(value.frames) || !frameValid(value.frames)))
    return false
  if (!validInstant(value.wallClock.startedAt)) return false
  for (const end of [value.wallClock.endedAt, value.stoppedAt])
    if (
      end !== undefined &&
      (!validInstant(end) ||
        typeof value.wallClock.startedAt !== 'string' ||
        typeof end !== 'string' ||
        compareAccountInstants(end, value.wallClock.startedAt) < 0)
    )
      return false
  return true
}
function trimValid(value: JsonObject): boolean {
  if (
    !isObject(value.byReason) ||
    !isJsonNumber(value.merged) ||
    !isJsonNumber(value.cut) ||
    !isJsonNumber(value.omittedBytes)
  )
    return false
  const reason = value.byReason
  if (
    !isJsonNumber(reason.rate_merged) ||
    !isJsonNumber(reason.quota_exhausted) ||
    !isJsonNumber(reason.rejected) ||
    !isJsonNumber(reason.frame_too_long)
  )
    return false
  return (
    ExactDecimal.from(value.merged).compare(ExactDecimal.from(reason.rate_merged)) === 0 &&
    ExactDecimal.from(value.cut).compare(
      ExactDecimal.from(reason.quota_exhausted).add(ExactDecimal.from(reason.rejected)),
    ) === 0 &&
    (ExactDecimal.from(value.cut).compare(ExactDecimal.from(0)) !== 0 ||
      ExactDecimal.from(reason.frame_too_long).compare(ExactDecimal.from(0)) !== 0 ||
      ExactDecimal.from(value.omittedBytes).compare(ExactDecimal.from(0)) === 0)
  )
}
function frameValid(value: JsonObject): boolean {
  if (
    !isObject(value.trims) ||
    !trimValid(value.trims) ||
    !isJsonNumber(value.emitted) ||
    !isObject(value.trims.byReason)
  )
    return false
  const { merged, cut } = value.trims
  const tooLong = value.trims.byReason.frame_too_long
  return (
    isJsonNumber(merged) &&
    isJsonNumber(cut) &&
    isJsonNumber(tooLong) &&
    ExactDecimal.from(merged)
      .add(ExactDecimal.from(cut))
      .add(ExactDecimal.from(tooLong))
      .compare(ExactDecimal.from(value.emitted)) <= 0
  )
}
export function amountSum(values: readonly (JsonNumber | 'unknown')[]): ExactDecimal | 'unknown' {
  let result = ExactDecimal.from(0)
  for (const value of values) {
    if (value === 'unknown') return 'unknown'
    result = result.add(ExactDecimal.from(value))
  }
  return result
}
function validInstant(value: JsonValue | undefined): value is string {
  return (
    typeof value === 'string' &&
    'ok' in instantFromRfc3339(value.replace(/\.[0-9]+(?=[Zz]|[+-])/u, ''))
  )
}
/** Retain all fractional digits: the dependency's millisecond projection is not a tie oracle. */
export function compareAccountInstants(left: string, right: string): -1 | 0 | 1 {
  return instantDecimal(left).compare(instantDecimal(right))
}
function instantDecimal(value: string): ExactDecimal {
  const fraction = /\.([0-9]+)(?=[Zz]|[+-])/u.exec(value)?.[1]
  const parsed = instantFromRfc3339(value.replace(/\.[0-9]+(?=[Zz]|[+-])/u, ''))
  if (!('ok' in parsed)) throw new TypeError('invalid account instant')
  return ExactDecimal.from(parsed.ok).add(
    ExactDecimal.from(fraction === undefined ? 0 : new LosslessNumber(`0.${fraction}e3`)),
  )
}
