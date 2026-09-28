import {
  copyJsonValue,
  isJsonNumber,
  jsonNumberSource,
  LosslessNumber,
  type JsonNumber,
  type JsonObject,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import { parseOpaqueIdentifier } from '@omne-harness-lite/identity-values'

export const modelLogFormat = 'mrr/3'

export type ModelLogKey =
  | { readonly kind: 'all' | 'messages' | 'selection' }
  | { readonly kind: 'call' | 'intent' | 'ended'; readonly call: string }
  | {
      readonly kind: 'dispatch' | 'dispatched' | 'opened'
      readonly call: string
      readonly dispatch: JsonNumber
    }
  | { readonly kind: 'response' | 'settlement'; readonly response: string }
  | { readonly kind: 'message'; readonly message: string }
  | { readonly kind: 'run'; readonly run: string }

export interface ModelLogInvalidValue {
  readonly invalidValue: true
  readonly reason:
    | 'not_json'
    | 'category'
    | 'value'
    | 'identity'
    | 'dispatch'
    | 'shell'
    | 'purpose'
    | 'message_prefix'
    | 'message_in_log'
    | 'wrapper'
    | 'key_set'
    | 'position'
}
export function invalidValue(reason: ModelLogInvalidValue['reason']): ModelLogInvalidValue {
  return Object.freeze({ invalidValue: true, reason })
}
export function object(value: JsonValue | undefined): value is JsonObject {
  return (
    value !== null && typeof value === 'object' && !Array.isArray(value) && !isJsonNumber(value)
  )
}
export function identity(value: unknown): value is string {
  return 'ok' in parseOpaqueIdentifier(value, 'modelLog')
}
export function positiveInteger(value: unknown): value is JsonNumber {
  return (
    isJsonNumber(value) &&
    ExactDecimal.from(value).isInteger &&
    ExactDecimal.from(value).compare(ExactDecimal.from(0)) > 0
  )
}
/** K1's numeric normalization is independent of the preserved payload spelling. */
export function integerSource(value: JsonNumber): string {
  const [mantissa = '', exponent = '0'] = jsonNumberSource(value).split(/[eE]/u)
  const fractionLength = mantissa.split('.')[1]?.length ?? 0
  const digits = mantissa.replace('.', '').replace(/^0+/u, '')
  const coefficient = digits.replace(/0+$/u, '')
  const power =
    BigInt(exponent) - BigInt(fractionLength) + BigInt(digits.length - coefficient.length)
  return `${coefficient}e${power}`
}
function quote(value: string): string {
  let output = '"'
  for (let index = 0; index < value.length; index++)
    output += `\\u${value.charCodeAt(index).toString(16).padStart(4, '0')}`
  return `${output}"`
}
function encode(parts: readonly string[]): string {
  return `${modelLogFormat}/[${parts.map(quote).join(',')}]`
}
function parts(key: JsonObject): readonly string[] | ModelLogInvalidValue {
  const kind = key.kind
  if (kind === 'all' || kind === 'messages' || kind === 'selection') {
    return Object.keys(key).length === 1 ? [kind] : invalidValue('identity')
  }
  if (kind === 'call' || kind === 'intent' || kind === 'ended') {
    return Object.keys(key).length === 2 && identity(key.call)
      ? [kind, key.call]
      : invalidValue('identity')
  }
  if (kind === 'dispatch' || kind === 'dispatched' || kind === 'opened') {
    if (Object.keys(key).length !== 3 || !identity(key.call)) return invalidValue('identity')
    return positiveInteger(key.dispatch)
      ? [kind, key.call, integerSource(key.dispatch)]
      : invalidValue('dispatch')
  }
  if (kind === 'response' || kind === 'settlement')
    return Object.keys(key).length === 2 && identity(key.response)
      ? [kind, key.response]
      : invalidValue('identity')
  if (kind === 'message')
    return Object.keys(key).length === 2 && identity(key.message)
      ? [kind, key.message]
      : invalidValue('identity')
  if (kind === 'run')
    return Object.keys(key).length === 2 && identity(key.run)
      ? [kind, key.run]
      : invalidValue('identity')
  return invalidValue('identity')
}
export function encodeModelLogKey(
  key: ModelLogKey,
): { readonly ok: string } | ModelLogInvalidValue {
  const copied = copyJsonValue(key)
  if ('failed' in copied || !object(copied.ok)) return invalidValue('not_json')
  const result = parts(copied.ok)
  return 'invalidValue' in result ? result : Object.freeze({ ok: encode(result) })
}
export function decodeModelLogKey(
  input: string,
): { readonly ok: ModelLogKey } | { readonly invalidKey: true } {
  const fail = Object.freeze({ invalidKey: true } as const)
  if (typeof input !== 'string' || !input.startsWith(`${modelLogFormat}/`)) return fail
  let decoded: unknown
  try {
    decoded = JSON.parse(input.slice(modelLogFormat.length + 1))
  } catch (error) {
    if (error instanceof SyntaxError) return fail
    throw error
  }
  if (!Array.isArray(decoded) || !decoded.every((part: unknown) => typeof part === 'string'))
    return fail
  const copied = copyJsonValue(decoded)
  if ('failed' in copied || !Array.isArray(copied.ok)) return fail
  const [kind, id, numeric] = copied.ok
  let key: ModelLogKey
  if ((kind === 'all' || kind === 'messages' || kind === 'selection') && decoded.length === 1)
    key = { kind }
  else if (
    (kind === 'call' || kind === 'intent' || kind === 'ended') &&
    typeof id === 'string' &&
    decoded.length === 2
  )
    key = { kind, call: id }
  else if (
    (kind === 'dispatch' || kind === 'dispatched' || kind === 'opened') &&
    typeof id === 'string' &&
    typeof numeric === 'string' &&
    decoded.length === 3
  ) {
    if (!/^[1-9][0-9]*e(?:0|[1-9][0-9]*)$/u.test(numeric)) return fail
    key = { kind, call: id, dispatch: new LosslessNumber(numeric) }
  } else if (
    (kind === 'response' || kind === 'settlement') &&
    typeof id === 'string' &&
    decoded.length === 2
  )
    key = { kind, response: id }
  else if (kind === 'message' && typeof id === 'string' && decoded.length === 2)
    key = { kind, message: id }
  else if (kind === 'run' && typeof id === 'string' && decoded.length === 2) key = { kind, run: id }
  else return fail
  const encoded = encodeModelLogKey(key)
  return 'ok' in encoded && encoded.ok === input ? Object.freeze({ ok: Object.freeze(key) }) : fail
}

/** Copies strict JSON at the public boundary; undefined denotes an absent member. */
export function modelLogJsonEqual(a: unknown, b: unknown): boolean {
  if (a === undefined || b === undefined) return a === b
  const left = copyJsonValue(a)
  const right = copyJsonValue(b)
  return 'ok' in left && 'ok' in right && equal(left.ok, right.ok)
}
function equal(a: JsonValue | undefined, b: JsonValue | undefined): boolean {
  if (isJsonNumber(a) && isJsonNumber(b))
    return ExactDecimal.from(a).compare(ExactDecimal.from(b)) === 0
  if (Array.isArray(a) && Array.isArray(b))
    return a.length === b.length && a.every((item, index) => equal(item, b[index]))
  if (object(a) && object(b)) {
    const keys = Object.keys(a)
    return (
      keys.length === Object.keys(b).length &&
      keys.every(key => Object.hasOwn(b, key) && equal(a[key], b[key]))
    )
  }
  return a === b
}
