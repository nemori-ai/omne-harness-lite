type BudgetEntry =
  | { kind: 'value'; value: unknown; depth: number }
  | { kind: 'exit'; value: object }

function queueObject(value: object, depth: number, pending: BudgetEntry[]): number | undefined {
  if (
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) !== Object.prototype &&
    Object.getPrototypeOf(value) !== null
  )
    return undefined
  let textUnits = 0
  const descriptors = Object.getOwnPropertyDescriptors(value)
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (Array.isArray(value) && key === 'length') continue
    if (!('value' in descriptor)) return undefined
    textUnits += key.length
    pending.push({ kind: 'value', value: descriptor.value, depth: depth + 1 })
  }
  return textUnits
}

function queueValue(
  value: unknown,
  depth: number,
  pending: BudgetEntry[],
  seen: WeakSet<object>,
): number | undefined {
  if (typeof value === 'string') return value.length
  if (typeof value === 'number') return Number.isFinite(value) ? 0 : undefined
  if (value === null || typeof value === 'boolean') return 0
  if (typeof value !== 'object') return undefined
  if (seen.has(value)) return undefined
  seen.add(value)
  pending.push({ kind: 'exit', value })
  return queueObject(value, depth, pending)
}

export function withinSettingsBudget(input: unknown): boolean {
  const pending: BudgetEntry[] = [{ kind: 'value', value: input, depth: 0 }]
  const seen = new WeakSet<object>()
  let nodes = 0
  let textUnits = 0
  while (pending.length > 0) {
    const next = pending.pop()!
    if (next.kind === 'exit') {
      seen.delete(next.value)
      continue
    }
    if (++nodes > 100000 || next.depth > 32) return false
    const added = queueValue(next.value, next.depth, pending, seen)
    if (added === undefined) return false
    textUnits += added
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
