/**
 * A canonical text of a data value: object members in key order, arrays in order, byte views as
 * their bytes. Two values are the same input when their texts are equal.
 */
export function canonical(value: unknown): string {
  if (value === undefined) return 'undefined'
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (ArrayBuffer.isView(value)) {
    return `bytes(${[...new Uint8Array(value.buffer, value.byteOffset, value.byteLength)].join(',')})`
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value instanceof Set) return `set(${[...value].map(canonical).sort().join(',')})`
  const members = Object.entries(value)
    .filter(([, member]) => member !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
  return `{${members.map(([key, member]) => `${JSON.stringify(key)}:${canonical(member)}`).join(',')}}`
}
