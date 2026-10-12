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
  | {
      readonly kind: 'call' | 'created' | 'intent' | 'ended' | 'acknowledged'
      readonly call: string
    }
  | { readonly kind: 'creation'; readonly creationKey: string }
  | {
      readonly kind: 'dispatch' | 'dispatched' | 'opened'
      readonly call: string
      readonly dispatch: JsonNumber
    }
  | { readonly kind: 'response' | 'ready' | 'settlement'; readonly response: string }
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
function singletonKind(kind: JsonValue | undefined) {
  return kind === 'all' || kind === 'messages' || kind === 'selection'
}
function callKind(kind: JsonValue | undefined) {
  return (
    kind === 'call' ||
    kind === 'created' ||
    kind === 'intent' ||
    kind === 'ended' ||
    kind === 'acknowledged'
  )
}
function dispatchKind(kind: JsonValue | undefined) {
  return kind === 'dispatch' || kind === 'dispatched' || kind === 'opened'
}
function responseKind(kind: JsonValue | undefined) {
  return kind === 'response' || kind === 'ready' || kind === 'settlement'
}
function identityParts(
  key: JsonObject,
  kind: string,
  field: 'call' | 'response' | 'message' | 'creationKey' | 'run',
): readonly string[] | ModelLogInvalidValue {
  return Object.keys(key).length === 2 && identity(key[field])
    ? [kind, key[field]]
    : invalidValue('identity')
}
function dispatchParts(key: JsonObject, kind: string): readonly string[] | ModelLogInvalidValue {
  if (Object.keys(key).length !== 3 || !identity(key.call)) return invalidValue('identity')
  return positiveInteger(key.dispatch)
    ? [kind, key.call, integerSource(key.dispatch)]
    : invalidValue('dispatch')
}
function parts(key: JsonObject): readonly string[] | ModelLogInvalidValue {
  const kind = key.kind
  if (singletonKind(kind)) {
    return Object.keys(key).length === 1 ? [kind] : invalidValue('identity')
  }
  if (callKind(kind)) return identityParts(key, kind, 'call')
  if (dispatchKind(kind)) return dispatchParts(key, kind)
  if (responseKind(kind)) return identityParts(key, kind, 'response')
  if (kind === 'message') return identityParts(key, kind, 'message')
  if (kind === 'creation') return identityParts(key, kind, 'creationKey')
  if (kind === 'run') return identityParts(key, kind, 'run')
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
  const key = keyFromParts(copied.ok, decoded.length)
  if (key === undefined) return fail
  const encoded = encodeModelLogKey(key)
  return 'ok' in encoded && encoded.ok === input ? Object.freeze({ ok: Object.freeze(key) }) : fail
}

function identityKey(kind: JsonValue | undefined, id: string): ModelLogKey | undefined {
  if (callKind(kind)) return { kind, call: id }
  if (responseKind(kind)) return { kind, response: id }
  if (kind === 'message') return { kind, message: id }
  if (kind === 'creation') return { kind, creationKey: id }
  if (kind === 'run') return { kind, run: id }
  return undefined
}
function keyFromParts(parts: readonly JsonValue[], length: number): ModelLogKey | undefined {
  const [kind, id, numeric] = parts
  if (singletonKind(kind) && length === 1) return { kind }
  if (typeof id !== 'string') return undefined
  if (length === 2) return identityKey(kind, id)
  return dispatchKey(kind, id, numeric, length)
}
function dispatchKey(
  kind: JsonValue | undefined,
  id: string,
  numeric: JsonValue | undefined,
  length: number,
): ModelLogKey | undefined {
  if (
    !dispatchKind(kind) ||
    typeof numeric !== 'string' ||
    length !== 3 ||
    !/^[1-9][0-9]*e(?:0|[1-9][0-9]*)$/u.test(numeric)
  )
    return undefined
  return { kind, call: id, dispatch: new LosslessNumber(numeric) }
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
