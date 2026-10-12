import {
  judgeContentBlock,
  isCanonicalMediaType,
  modalityOf,
  isNonNegativeJsonInteger,
  readJsonStrict,
  type JsonValue,
  type JsonObject,
} from '@omne-harness-lite/content-blocks'
import { judgeAccountValue } from '@omne-harness-lite/call-accounts'
import { isStandardBase64 } from './base64.ts'
import { isObject, snapshot } from './json.ts'
import { validate } from './schema.ts'
import type { ArrivalJudgment, ArrivalRejection, OpenBlock, OpenEvent } from './types.ts'

const events: readonly string[] = ['open', 'fill', 'close', 'trim', 'account', 'finish']
const trimReasons: readonly string[] = [
  'rate_merged',
  'frame_too_long',
  'quota_exhausted',
  'rejected',
]
const finishReasons: readonly string[] = ['end', 'max_tokens', 'interrupted', 'lost']
function reject(rejected: ArrivalRejection): ArrivalJudgment {
  return Object.freeze({ rejected })
}

function unknownReason(event: JsonObject, kind: string, reasons: readonly string[]): boolean {
  return (
    event.t === kind &&
    Object.hasOwn(event, 'reason') &&
    (typeof event.reason !== 'string' || !reasons.includes(event.reason))
  )
}
function eventProtocolRejection(event: JsonObject): ArrivalRejection | undefined {
  if (Object.hasOwn(event, 't') && (typeof event.t !== 'string' || !events.includes(event.t)))
    return 'event_unknown'
  if (unknownReason(event, 'trim', trimReasons)) return 'trim_reason_unknown'
  if (unknownReason(event, 'finish', finishReasons)) return 'finish_reason_unknown'
  return undefined
}
function headModality(kind: JsonValue | undefined): string | undefined {
  return kind === 'voice'
    ? 'audio'
    : kind === 'image'
      ? 'image'
      : kind === 'text' || kind === 'thinking'
        ? 'text'
        : undefined
}
function openHeadRejection(event: JsonObject): ArrivalRejection | undefined {
  if (event.t === 'open' && isObject(event.head)) {
    if (Object.hasOwn(event.head, 'presentation')) return 'presentation_invalid'
    const expected = headModality(event.kind)
    if (
      expected !== undefined &&
      isCanonicalMediaType(event.head.mediaType) &&
      modalityOf(event.head.mediaType) !== expected
    )
      return 'head_modality_mismatch'
  }
  return undefined
}
function fillKindNotAppendable(event: JsonObject): boolean {
  if (
    event.t === 'open' &&
    event.fill === 'append' &&
    ['image', 'file', 'tool_result'].includes(typeof event.kind === 'string' ? event.kind : '')
  )
    return true
  return false
}
function frameMediaInline(
  target: JsonValue | undefined,
  event: JsonObject,
  opened: OpenEvent | undefined,
): boolean {
  if (
    isObject(target) &&
    target.kind === 'tool_execution' &&
    (wholeValues(event).some(hasInlineMedia) || (event.t === 'fill' && opened?.kind === 'voice'))
  )
    return true
  return false
}
function openViewRejection(
  value: JsonObject,
  event: JsonObject,
  openBlock?: OpenBlock,
): ArrivalRejection | undefined {
  // Only these two predicates need an open view. Invalid indices never reach its callback.
  const opened =
    event.t === 'fill' && isNonNegativeJsonInteger(event.index)
      ? openBlock?.(event.index)
      : undefined
  if (frameMediaInline(value.target, event, opened)) return 'frame_media_inline'
  if (
    event.t === 'fill' &&
    opened?.fill === 'replace' &&
    !replacementMatches(opened, event.payload)
  )
    return 'replace_payload_shape'
  return undefined
}
/** S-28 order. openBlock supplies a legal readonly opened view, not sequence validation. */
export function judgeArrivalEnvelope(envelope: unknown, openBlock?: OpenBlock): ArrivalJudgment {
  const value = snapshot(envelope)
  if (!isObject(value) || !isObject(value.event)) return reject('malformed')
  const event = value.event
  const protocol = eventProtocolRejection(event)
  if (protocol !== undefined) return reject(protocol)
  const embedded = embeddedRejection(event)
  if (embedded !== undefined && embedded !== 'malformed') return reject(embedded)
  const head = openHeadRejection(event)
  if (head !== undefined) return reject(head)
  if (fillKindNotAppendable(event)) return reject('fill_kind_not_appendable')
  const contextual = openViewRejection(value, event, openBlock)
  if (contextual !== undefined) return reject(contextual)
  if (embedded === 'malformed' || !validate('ArrivalEnvelope', value).valid)
    return reject('malformed')
  return Object.freeze({ ok: true })
}
/** Strict wire boundary preserves exact numbers and rejects nested duplicate JSON members. */
export function judgeArrivalEnvelopeText(text: string, openBlock?: OpenBlock): ArrivalJudgment {
  const read = readJsonStrict(text)
  return 'failed' in read ? reject('malformed') : judgeArrivalEnvelope(read.ok, openBlock)
}
function wholeValues(event: JsonObject): readonly JsonValue[] {
  if (event.t === 'fill' && isObject(event.payload)) return [event.payload]
  if (event.t === 'close' && Object.hasOwn(event, 'block') && event.block !== undefined)
    return [event.block]
  return []
}
function embeddedRejection(event: JsonObject): ArrivalRejection | undefined {
  if (
    event.t === 'open' &&
    (!Object.hasOwn(event, 'visibility') ||
      (isObject(event.visibility) &&
        (!Object.hasOwn(event.visibility, 'toHuman') ||
          !Object.hasOwn(event.visibility, 'toModel'))))
  )
    return 'visibility_missing'
  for (const block of wholeValues(event)) {
    const judged = judgeContentBlock(block)
    if ('rejected' in judged) return judged.rejected
  }
  if (event.t === 'account') {
    const judgments = [
      judgeAccountValue('Usage', event.usage),
      judgeAccountValue('Cost', event.cost),
    ]
    for (const reason of ['negative_amount', 'unknown_with_source', 'malformed'] as const)
      if (judgments.some(result => 'rejected' in result && result.rejected === reason))
        return reason
  }
  return undefined
}
function hasInlineMedia(value: JsonValue): boolean {
  if (!isObject(value)) return false
  if (
    (value.kind === 'voice' || value.kind === 'image') &&
    isObject(value.data) &&
    Object.hasOwn(value.data, 'inline')
  )
    return true
  if (
    value.kind === 'tool_result' &&
    Array.isArray(value.blocks) &&
    value.blocks.some(hasInlineMedia)
  )
    return true
  return (
    Array.isArray(value.renderings) &&
    value.renderings.some(
      rendering =>
        isObject(rendering) &&
        Array.isArray(rendering.blocks) &&
        rendering.blocks.some(hasInlineMedia),
    )
  )
}
function replacementMatches(opened: OpenEvent, payload: JsonValue | undefined): boolean {
  if (opened.kind === 'voice') return isStandardBase64(payload)
  if (opened.kind === 'text' || opened.kind === 'thinking' || opened.kind === 'tool_call')
    return typeof payload === 'string'
  return wholeReplacementMatches(opened, payload)
}
function wholeReplacementMatches(opened: OpenEvent, payload: JsonValue | undefined): boolean {
  if (
    !isObject(payload) ||
    payload.kind !== opened.kind ||
    payload.id !== opened.id ||
    !isObject(payload.visibility) ||
    payload.visibility.toHuman !== opened.visibility.toHuman ||
    payload.visibility.toModel !== opened.visibility.toModel
  )
    return false
  if (Object.hasOwn(payload, 'mediaType') && payload.mediaType !== opened.head?.mediaType)
    return false
  return 'ok' in judgeContentBlock(payload)
}
