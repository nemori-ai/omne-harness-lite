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

const keptForms = new WeakMap<object, string>()

// A value that is kept and never changed in place has one canonical form: it is computed once.
export function canonicalOfKept(value: object): string {
  let form = keptForms.get(value)
  if (form === undefined) {
    form = canonical(value)
    keptForms.set(value, form)
  }
  return form
}
