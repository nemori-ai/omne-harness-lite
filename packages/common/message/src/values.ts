export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/** True when a getter, a setter, or a non-enumerable key would hide what a read does. */
export function hasUnreadableOwn(value: object): boolean {
  return Object.getOwnPropertyNames(value).some(key => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    return descriptor === undefined || descriptor.enumerable !== true || !('value' in descriptor)
  })
}

export function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

const ARRAY_INDEX = /^(0|[1-9]\d*)$/u

/**
 * True when the own keys of an array are `length` and its indices, and each index is an
 * enumerable data property. An accessor, a symbol key, or any other own key makes it false.
 * A hole is not a key, so a sparse array passes and the hole reads as `undefined`.
 */
/**
 * Reads an array whose own keys are only data items and `length`, and maps each item; any item
 * that maps to `undefined`, or any other array shape, is `undefined`. A hole reads as `undefined`
 * and no accessor is called.
 */
export function readDataItems<T>(
  raw: unknown,
  item: (value: unknown) => T | undefined,
): T[] | undefined {
  if (!Array.isArray(raw) || !hasOnlyDataItems(raw)) return undefined
  const items: readonly unknown[] = raw
  const out: T[] = []
  for (let index = 0; index < items.length; index += 1) {
    const value = item(items[index])
    if (value === undefined) return undefined
    out.push(value)
  }
  return out
}

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
