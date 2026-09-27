import {
  copyJsonValue,
  isJsonNumber,
  readJsonStrict,
  type JsonObject,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'

export function object(value: unknown): value is JsonObject {
  return (
    value !== null && typeof value === 'object' && !Array.isArray(value) && !isJsonNumber(value)
  )
}
export function ownedObject(value: unknown): JsonObject | undefined {
  const copied = copyJsonValue(value)
  return 'ok' in copied && object(copied.ok) ? copied.ok : undefined
}
export function strictObject(text: string): JsonObject | undefined {
  const result = readJsonStrict(text)
  return 'ok' in result && object(result.ok) ? result.ok : undefined
}
/** Reserve unchanged keys first; redacted names must not overwrite any retained fact. */
export function redactedEntries<Value>(
  entries: readonly (readonly [string, Value])[],
  redact: (text: string) => string,
): readonly (readonly [string, Value])[] {
  const named = entries.map(([key, value]) => ({ key, name: redact(key), value }))
  const used = new Set(named.filter(entry => entry.name === entry.key).map(entry => entry.key))
  return named.map(({ key, name, value }): [string, Value] => {
    if (name !== key) {
      while (used.has(name)) name += '█'
      used.add(name)
    }
    return [name, value]
  })
}
/** Redact decoded strings, preserving exact numeric values and ordinary members. */
export function redactObject(value: JsonObject, redact: (text: string) => string): JsonObject {
  function visit(item: JsonValue): JsonValue {
    if (typeof item === 'string') return redact(item)
    if (Array.isArray(item)) return item.map(visit)
    return object(item) ? redactObject(item, redact) : item
  }
  return Object.fromEntries(
    redactedEntries(Object.entries(value), redact).map(([key, item]): [string, JsonValue] => [
      key,
      visit(item),
    ]),
  )
}
export function member(value: JsonValue | undefined, key: string): JsonValue | undefined {
  return object(value) ? value[key] : undefined
}
