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
import { currentCodecDomain, type ModelLogCodecDomain } from './log-codec-domain.ts'
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
  readonly timing: JsonObject & { readonly sentAt: string | null; readonly endedAt: string }
  readonly usage: JsonObject
  readonly cost: JsonObject
  readonly inputCalibration: JsonObject
  readonly outcome: string
}
function responseProjection(value: JsonValue): value is ModelLogResponseProjection {
  return (
    object(value) &&
    responseIdentity(value) &&
    responseTiming(value) &&
    object(value.usage) &&
    object(value.cost) &&
    object(value.inputCalibration) &&
    typeof value.outcome === 'string'
  )
}
function responseIdentity(value: JsonObject): boolean {
  return (
    typeof value.id === 'string' &&
    isJsonNumber(value.dispatch) &&
    object(value.call) &&
    typeof value.call.callId === 'string' &&
    object(value.route)
  )
}
function responseTiming(value: JsonObject): boolean {
  return (
    object(value.timing) &&
    (typeof value.timing.sentAt === 'string' || value.timing.sentAt === null) &&
    typeof value.timing.endedAt === 'string'
  )
}

// The instance's reachable JavaScript constructor cannot mint an unchecked capture.
const captureToken = Object.freeze({})
class CapturedValue {
  readonly #owned = true
  readonly #domain: ModelLogCodecDomain
  readonly #format: string
  readonly #writable: boolean
  constructor(
    token: unknown,
    domain: ModelLogCodecDomain,
    format: string,
    writable: boolean,
    readonly category: ModelLogCategory,
    readonly value: JsonValue,
    readonly record: ModelInvocationRecord | null,
    readonly message: Message | null,
    readonly response: ModelLogResponseProjection | null,
  ) {
    if (token !== captureToken) throw new TypeError('Use captureModelLogValue')
    this.#domain = domain
    this.#format = format
    this.#writable = writable
    Object.freeze(this)
  }
  static matches(
    value: unknown,
    domain: ModelLogCodecDomain,
    writable: boolean,
  ): value is CapturedValue {
    return CapturedValue.owns(value) && value.#domain === domain && (!writable || value.#writable)
  }
  static format(value: CapturedValue): string {
    return value.#format
  }
  static owns(value: unknown): value is CapturedValue {
    return value !== null && typeof value === 'object' && #owned in value
  }
}
export type CapturedModelLogValue = CapturedValue
export function capturedFormat(value: CapturedModelLogValue): string {
  return CapturedValue.format(value)
}

export function createValueCodec(domain: ModelLogCodecDomain) {
  function owns(value: unknown, writable: boolean): value is CapturedModelLogValue {
    return CapturedValue.matches(value, domain, writable)
  }
  function captureModelLogValue(input: {
    readonly category: ModelLogCategory
    readonly input: ModelLogValueInput
  }): { readonly ok: CapturedModelLogValue } | ModelLogInvalidValue {
    return captureValue(input, domain.writeFormat, true)
  }
  function captureValue(
    input: {
      readonly category: ModelLogCategory
      readonly input: ModelLogValueInput
    },
    format: string,
    writable: boolean,
  ): { readonly ok: CapturedModelLogValue } | ModelLogInvalidValue {
    const source = input.input
    const snapshot =
      source.kind === 'text'
        ? readJsonStrict(source.text)
        : source.kind === 'value'
          ? copyJsonValue(source.value)
          : { failed: 'not_json' }
    if ('failed' in snapshot) return invalidValue('not_json')
    const value = snapshot.ok
    if (input.category === 'record') return captureRecord(value, format, writable)
    if (input.category === 'message') return captureMessage(value, format, writable)
    if (input.category !== 'response') return invalidValue('category')
    return captureResponse(value, format, writable)
  }
  function captureRecord(
    value: JsonValue,
    format: string,
    writable: boolean,
  ): { readonly ok: CapturedModelLogValue } | ModelLogInvalidValue {
    const judged = judgeModelInvocationRecord(value)
    return 'rejected' in judged
      ? invalidValue('value')
      : Object.freeze({
          ok: new CapturedValue(
            captureToken,
            domain,
            format,
            writable,
            'record',
            value,
            judged.ok,
            null,
            null,
          ),
        })
  }
  function captureMessage(
    value: JsonValue,
    format: string,
    writable: boolean,
  ): { readonly ok: CapturedModelLogValue } | ModelLogInvalidValue {
    const judged = judgeMessage(value)
    return 'rejected' in judged
      ? invalidValue('value')
      : Object.freeze({
          ok: new CapturedValue(
            captureToken,
            domain,
            format,
            writable,
            'message',
            value,
            null,
            judged.ok,
            null,
          ),
        })
  }
  function captureResponse(
    value: JsonValue,
    format: string,
    writable: boolean,
  ): { readonly ok: CapturedModelLogValue } | ModelLogInvalidValue {
    const judged = judgeModelResponse(value)
    if ('rejected' in judged || !responseProjection(value)) return invalidValue('value')
    if (value.reply !== undefined) {
      const reply = judgeMessage(value.reply)
      if ('rejected' in reply || reply.ok.type !== 'assistant') return invalidValue('value')
    }
    return Object.freeze({
      ok: new CapturedValue(
        captureToken,
        domain,
        format,
        writable,
        'response',
        value,
        null,
        null,
        value,
      ),
    })
  }

  /** Full value recognition, not merely an id/type/content or source comparison. */
  function recognizeMessageValue(input: {
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

  return Object.freeze({ captureModelLogValue, captureValue, recognizeMessageValue, owns })
}
export type MessageValueRecognition =
  | { readonly absent: true }
  | { readonly same: true; readonly original: CapturedModelLogValue }
  | { readonly different: true }
  | { readonly undetermined: true; readonly reason: 'message_value' }

export const { captureModelLogValue, recognizeMessageValue } = createValueCodec(currentCodecDomain)
