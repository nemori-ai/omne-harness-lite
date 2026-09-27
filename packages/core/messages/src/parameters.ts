import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import { isJsonNumber, type JsonObject, type JsonValue } from '@omne-harness-lite/content-blocks'
import { validate } from '@omne-harness-lite/model-profile'
import { isObject } from './json.ts'

/** S-49: check requested/sent against their original exact JSON values without modifying input. */
export function dispatchedParametersValid(record: JsonObject): boolean {
  if (!isObject(record.parameters)) return false
  const parameters = record.parameters
  const sent: Record<string, JsonValue> = { ...parameters }
  const extra = isObject(parameters.extra) ? { ...parameters.extra } : undefined
  const handled = new Set<string>()
  function member(
    name: string,
  ): { readonly inExtra: boolean; readonly value: JsonValue } | undefined {
    if (name !== 'extra' && Object.hasOwn(parameters, name) && parameters[name] !== undefined)
      return { inExtra: false, value: parameters[name] }
    if (extra !== undefined && Object.hasOwn(extra, name) && extra[name] !== undefined)
      return { inExtra: true, value: extra[name] }
    return undefined
  }
  if (Array.isArray(record.parameterAdjustments)) {
    for (const adjustment of record.parameterAdjustments) {
      if (
        !isObject(adjustment) ||
        typeof adjustment.name !== 'string' ||
        adjustment.requested === undefined ||
        adjustment.sent === undefined
      )
        return false
      const item = member(adjustment.name)
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
  }
  if (Array.isArray(record.droppedParameters)) {
    for (const name of record.droppedParameters) {
      if (typeof name !== 'string' || handled.has(name)) return false
      const item = member(name)
      if (item === undefined) return false
      handled.add(name)
      if (item.inExtra && extra !== undefined) delete extra[name]
      else delete sent[name]
    }
  }
  if (extra !== undefined) {
    if (Object.keys(extra).length === 0) delete sent.extra
    else sent.extra = extra
  }
  return validate('ModelRequestParameters', sent).valid
}
export function jsonEqual(a: JsonValue, b: JsonValue): boolean {
  if (isJsonNumber(a) && isJsonNumber(b))
    return ExactDecimal.from(a).compare(ExactDecimal.from(b)) === 0
  if (Array.isArray(a) && Array.isArray(b))
    return (
      a.length === b.length &&
      a.every((item, i) => {
        const other = b[i]
        return other !== undefined && jsonEqual(item, other)
      })
    )
  if (isObject(a) && isObject(b)) {
    const keys = Object.keys(a)
    return (
      keys.length === Object.keys(b).length &&
      keys.every(key => {
        const one = a[key],
          two = b[key]
        return (
          one !== undefined && two !== undefined && Object.hasOwn(b, key) && jsonEqual(one, two)
        )
      })
    )
  }
  return a === b
}
