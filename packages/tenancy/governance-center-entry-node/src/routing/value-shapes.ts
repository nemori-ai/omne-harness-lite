export function record(value: unknown): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('expected an object')
  }
  return value as Readonly<Record<string, unknown>>
}

export function list(value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) throw new TypeError('expected an array')
  return value
}
