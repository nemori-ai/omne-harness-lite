/** Copies legal typed value trees without minting identities or freezing caller values. */
export function copyObservationValue<T>(value: T): T {
  if (typeof value !== 'object' || value === null) return value
  const fields = { ...value }
  const copy = Array.isArray(value)
    ? Object.assign(Array.of<unknown>(), fields, { length: value.length })
    : fields
  for (const key in value) {
    if (Object.hasOwn(value, key)) copy[key] = copyObservationValue(value[key])
  }
  return Object.freeze(copy)
}

function canonicalJson(value: unknown): string | undefined {
  if (value === undefined) return undefined
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value))
    return `[${Array.from(value, item => canonicalJson(item) ?? 'null').join(',')}]`
  const fields = Object.keys(value)
    .sort()
    .flatMap(key => {
      const encoded = canonicalJson(Reflect.get(value, key))
      return encoded === undefined ? [] : [`${JSON.stringify(key)}:${encoded}`]
    })
  return `{${fields.join(',')}}`
}

/** Normative UTF-8 bytes, not a JavaScript heap measurement. */
export function observationBytes(value: unknown): number {
  const text = canonicalJson(value)
  if (text === undefined) throw new TypeError('A frame must have a JSON representation')
  return new TextEncoder().encode(text).byteLength
}
