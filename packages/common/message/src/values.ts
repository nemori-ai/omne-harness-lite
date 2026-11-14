export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

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
