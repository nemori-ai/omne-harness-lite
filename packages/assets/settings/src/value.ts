/** Bounds recursive decoders before they traverse untrusted in-process input. */
export function withinSettingsBudget(input: unknown): boolean {
  const pending: { value: unknown; depth: number; exit?: boolean }[] = [{ value: input, depth: 0 }]
  const seen = new WeakSet<object>()
  let nodes = 0
  let textUnits = 0
  while (pending.length > 0) {
    const next = pending.pop()!
    if (next.exit) {
      seen.delete(next.value as object)
      continue
    }
    if (++nodes > 100000 || next.depth > 32) return false
    const value = next.value
    if (typeof value === 'string') textUnits += value.length
    else if (typeof value === 'number') {
      if (!Number.isFinite(value)) return false
    } else if (value !== null && typeof value === 'object') {
      if (seen.has(value)) return false
      seen.add(value)
      pending.push({ value, depth: next.depth, exit: true })
      if (
        !Array.isArray(value) &&
        Object.getPrototypeOf(value) !== Object.prototype &&
        Object.getPrototypeOf(value) !== null
      )
        return false
      const descriptors = Object.getOwnPropertyDescriptors(value)
      for (const [key, descriptor] of Object.entries(descriptors)) {
        if (Array.isArray(value) && key === 'length') continue
        if (!('value' in descriptor)) return false
        textUnits += key.length
        pending.push({ value: descriptor.value, depth: next.depth + 1 })
      }
    } else if (value !== null && typeof value !== 'boolean') return false
    if (textUnits > 1024 * 1024) return false
  }
  return true
}

export function immutable<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) immutable(child)
    Object.freeze(value)
  }
  return value
}
