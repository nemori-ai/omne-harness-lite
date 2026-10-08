import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import { isJsonNumber, type JsonObject, type JsonValue } from '@omne-harness-lite/content-blocks'
import { validate } from '@omne-harness-lite/model-profile'
import { isObject } from './json.ts'

interface ParameterChanges {
  readonly parameters: JsonObject
  readonly sent: Record<string, JsonValue>
  readonly extra: Record<string, JsonValue> | undefined
  readonly handled: Set<string>
}
function requestedMember(
  name: string,
  changes: ParameterChanges,
): { readonly inExtra: boolean; readonly value: JsonValue } | undefined {
  const { parameters, extra } = changes
  if (name !== 'extra' && Object.hasOwn(parameters, name) && parameters[name] !== undefined)
    return { inExtra: false, value: parameters[name] }
  if (extra !== undefined && Object.hasOwn(extra, name) && extra[name] !== undefined)
    return { inExtra: true, value: extra[name] }
  return undefined
}
function isAdjustment(value: JsonValue): value is JsonObject & {
  readonly name: string
  readonly requested: JsonValue
  readonly sent: JsonValue
} {
  return (
    isObject(value) &&
    typeof value.name === 'string' &&
    value.requested !== undefined &&
    value.sent !== undefined
  )
}
function applyAdjustments(record: JsonObject, changes: ParameterChanges): boolean {
  if (!Array.isArray(record.parameterAdjustments)) return true
  const { extra, sent, handled } = changes
  for (const adjustment of record.parameterAdjustments) {
    if (!isAdjustment(adjustment)) return false
    const item = requestedMember(adjustment.name, changes)
    if (
      item === undefined ||
      handled.has(adjustment.name) ||
      !jsonEqual(item.value, adjustment.requested) ||
      jsonEqual(adjustment.requested, adjustment.sent)
    )
      return false
    handled.add(adjustment.name)
    if (item.inExtra && extra !== undefined) extra[adjustment.name] = adjustment.sent
    else sent[adjustment.name] = adjustment.sent
  }
  return true
}
function applyDropped(record: JsonObject, changes: ParameterChanges): boolean {
  if (!Array.isArray(record.droppedParameters)) return true
  const { extra, sent, handled } = changes
  for (const name of record.droppedParameters) {
    if (typeof name !== 'string' || handled.has(name)) return false
    const item = requestedMember(name, changes)
    if (item === undefined) return false
    handled.add(name)
    if (item.inExtra && extra !== undefined) delete extra[name]
    else delete sent[name]
  }
  return true
}
/** S-49: check requested/sent against their original exact JSON values without modifying input. */
export function dispatchedParametersValid(record: JsonObject): boolean {
  if (!isObject(record.parameters)) return false
  const parameters = record.parameters
  const sent: Record<string, JsonValue> = { ...parameters }
  const extra = isObject(parameters.extra) ? { ...parameters.extra } : undefined
  const changes: ParameterChanges = { parameters, sent, extra, handled: new Set() }
  if (!applyAdjustments(record, changes) || !applyDropped(record, changes)) return false
  if (extra !== undefined) {
    if (Object.keys(extra).length === 0) delete sent.extra
    else sent.extra = extra
  }
  return validate('ModelRequestParameters', sent).valid
}
function arraysEqual(a: readonly JsonValue[], b: readonly JsonValue[]): boolean {
  return (
    a.length === b.length &&
    a.every((item, i) => {
      const other = b[i]
      return other !== undefined && jsonEqual(item, other)
    })
  )
}

function objectsEqual(a: JsonObject, b: JsonObject): boolean {
  const keys = Object.keys(a)
  return (
    keys.length === Object.keys(b).length &&
    keys.every(key => {
      const one = a[key],
        two = b[key]
      return one !== undefined && two !== undefined && Object.hasOwn(b, key) && jsonEqual(one, two)
    })
  )
}

export function jsonEqual(a: JsonValue, b: JsonValue): boolean {
  if (isJsonNumber(a) && isJsonNumber(b))
    return ExactDecimal.from(a).compare(ExactDecimal.from(b)) === 0
  if (Array.isArray(a) && Array.isArray(b)) return arraysEqual(a, b)
  if (isObject(a) && isObject(b)) return objectsEqual(a, b)
  return a === b
}
