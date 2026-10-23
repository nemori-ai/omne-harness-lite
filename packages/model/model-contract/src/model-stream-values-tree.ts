/** Compare confirmed value trees; object member order is not part of a projection. */
export function equalStreamValues(left: unknown, right: unknown): boolean {
  if (left === right) return true
  if (typeof left !== 'object' || left === null || typeof right !== 'object' || right === null)
    return false
  if (Array.isArray(left) !== Array.isArray(right)) return false
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  if (leftKeys.length !== rightKeys.length) return false
  return leftKeys.every(
    key =>
      Object.hasOwn(right, key) &&
      equalStreamValues(Reflect.get(left, key), Reflect.get(right, key)),
  )
}

/** Copy each occurrence, including repeated DAG nodes, before freezing it. */
export function copyStreamValue<T>(value: T): T {
  if (typeof value !== 'object' || value === null) return value
  const fields = { ...value }
  const copy = Array.isArray(value)
    ? Object.assign(Array.of<unknown>(), fields, { length: value.length })
    : fields
  for (const key in value) {
    if (Object.hasOwn(value, key)) copy[key] = copyStreamValue(value[key])
  }
  return Object.freeze(copy)
}
