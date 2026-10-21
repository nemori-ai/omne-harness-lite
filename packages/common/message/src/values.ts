import { hasUnreadableOwn, isPlainRecord } from './parts.ts'

const ARRAY_INDEX = /^(0|[1-9]\d*)$/u

/**
 * True when the own keys of an array are `length` and its indices, and each index is an
 * enumerable data property. An accessor, a symbol key, or any other own key makes it false.
 * A hole is not a key, so a sparse array passes and the hole reads as `undefined`.
 */
export function hasOnlyDataItems(items: readonly unknown[]): boolean {
  const entries = Object.entries(Object.getOwnPropertyDescriptors(items))
  if (entries.length !== Reflect.ownKeys(items).length) return false
  return entries.every(
    ([key, descriptor]) =>
      key === 'length' ||
      (ARRAY_INDEX.test(key) &&
        Number(key) < items.length &&
        descriptor.enumerable === true &&
        'value' in descriptor),
  )
}

export function hasDuplicates<T>(items: readonly T[]): boolean {
  return new Set(items).size !== items.length
}

/**
 * The values of a plain object whose own keys are exactly `keys`, read by name. An accessor is
 * never called: it makes the object unreadable, as does a non-enumerable key. A symbol key
 * also makes it unreadable, which the part judges do not do: SPEC.md, judgeMessage steps 8 and
 * 10, refuses `covers` and `derivation` with one.
 */
export function closedFields(
  value: unknown,
  keys: readonly string[],
): Readonly<Record<string, unknown>> | undefined {
  if (!isPlainRecord(value) || hasUnreadableOwn(value)) return undefined
  if (Reflect.ownKeys(value).length !== keys.length) return undefined
  const fields: Record<string, unknown> = {}
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (descriptor === undefined) return undefined
    fields[key] = descriptor.value
  }
  return fields
}
