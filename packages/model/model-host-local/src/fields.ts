// Reading values that arrive untyped: a decoded snapshot, or a plugin configuration literal.

/** A non-null object that is not an array: the shape of a JSON object or a configuration literal. */
export function isRecord(value: unknown): value is object {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The property `key` of `value` when `value` is a record, else `undefined`. */
export function fieldOf(value: unknown, key: string): unknown {
  return isRecord(value) ? Reflect.get(value, key) : undefined
}

/** A safe integer no smaller than `minimum`: the shape of every count and duration option. */
export function isIntegerAtLeast(value: unknown, minimum: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum
}
