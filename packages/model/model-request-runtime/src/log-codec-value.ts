import {
  copyJsonValue,
  isJsonNumber,
  readJsonStrict,
  type JsonNumber,
  type JsonObject,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import {
  judgeMessage,
  judgeModelInvocationRecord,
  type Message,
  type ModelInvocationRecord,
} from '@omne-harness-lite/messages'
import { judgeModelResponse } from '@omne-harness-lite/model-response'
import {
  invalidValue,
  modelLogJsonEqual,
  object,
  type ModelLogInvalidValue,
} from './log-codec-key.ts'

export type ModelLogCategory = 'record' | 'message' | 'response'
export type ModelLogValueInput =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'value'; readonly value: unknown }

/** A projection of a fully judged response, preserving its original JSON snapshot. */
export interface ModelLogResponseProjection extends JsonObject {
  readonly id: string
  readonly dispatch: JsonNumber
  readonly call: JsonObject & { readonly callId: string }
  readonly route: JsonObject
  readonly timing: JsonObject & { readonly sentAt: string; readonly endedAt: string }
  readonly usage: JsonObject
  readonly cost: JsonObject
  readonly outcome: string
}
function responseProjection(value: JsonValue): value is ModelLogResponseProjection {
  return (
    object(value) &&
    typeof value.id === 'string' &&
    isJsonNumber(value.dispatch) &&
    object(value.call) &&
    typeof value.call.callId === 'string' &&
    object(value.route) &&
    object(value.timing) &&
    typeof value.timing.sentAt === 'string' &&
    typeof value.timing.endedAt === 'string' &&
    object(value.usage) &&
    object(value.cost) &&
    typeof value.outcome === 'string'
  )
}

// The instance's reachable JavaScript constructor cannot mint an unchecked capture.
const captureToken = Object.freeze({})
class CapturedValue {
  readonly #owned = true
  constructor(
    token: unknown,
    readonly category: ModelLogCategory,
    readonly value: JsonValue,
    readonly record: ModelInvocationRecord | null,
    readonly message: Message | null,
    readonly response: ModelLogResponseProjection | null,
  ) {
    if (token !== captureToken) throw new TypeError('Use captureModelLogValue')
    Object.freeze(this)
  }
  static owns(value: unknown): value is CapturedValue {
    return value !== null && typeof value === 'object' && #owned in value
  }
}
export type CapturedModelLogValue = CapturedValue
export function ownedCapture(value: unknown): value is CapturedModelLogValue {
  return CapturedValue.owns(value)
}

/** Text and value reception are explicit; a string value is never guessed to be JSON text. */
export function captureModelLogValue(input: {
  readonly category: ModelLogCategory
  readonly input: ModelLogValueInput
}): { readonly ok: CapturedModelLogValue } | ModelLogInvalidValue {
  const source = input.input
  const snapshot =
    source.kind === 'text'
      ? readJsonStrict(source.text)
      : source.kind === 'value'
        ? copyJsonValue(source.value)
        : { failed: 'not_json' }
  if ('failed' in snapshot) return invalidValue('not_json')
  const value = snapshot.ok
  if (input.category === 'record') {
    const judged = judgeModelInvocationRecord(value)
    return 'rejected' in judged
      ? invalidValue('value')
      : Object.freeze({
          ok: new CapturedValue(captureToken, 'record', value, judged.ok, null, null),
        })
  }
  if (input.category === 'message') {
    const judged = judgeMessage(value)
    return 'rejected' in judged
      ? invalidValue('value')
      : Object.freeze({
          ok: new CapturedValue(captureToken, 'message', value, null, judged.ok, null),
        })
  }
  if (input.category !== 'response') return invalidValue('category')
  const judged = judgeModelResponse(value)
  if ('rejected' in judged || !responseProjection(value)) return invalidValue('value')
  if (value.reply !== undefined) {
    const reply = judgeMessage(value.reply)
    if ('rejected' in reply || reply.ok.type !== 'assistant') return invalidValue('value')
  }
  return Object.freeze({
    ok: new CapturedValue(captureToken, 'response', value, null, null, value),
  })
}

export type MessageValueRecognition =
  | { readonly absent: true }
  | { readonly same: true; readonly original: CapturedModelLogValue }
  | { readonly different: true }
  | { readonly undetermined: true; readonly reason: 'message_value' }

/** Full value recognition, not merely an id/type/content or source comparison. */
export function recognizeMessageValue(input: {
  readonly candidate: ModelLogValueInput
  readonly original: ModelLogValueInput | null
}): MessageValueRecognition {
  const candidate = captureModelLogValue({ category: 'message', input: input.candidate })
  if ('invalidValue' in candidate)
    return Object.freeze({ undetermined: true, reason: 'message_value' })
  if (input.original === null) return Object.freeze({ absent: true })
  const original = captureModelLogValue({ category: 'message', input: input.original })
  if ('invalidValue' in original)
    return Object.freeze({ undetermined: true, reason: 'message_value' })
  return modelLogJsonEqual(candidate.ok.value, original.ok.value)
    ? Object.freeze({ same: true, original: original.ok })
    : Object.freeze({ different: true })
}
