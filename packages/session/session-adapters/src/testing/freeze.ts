const frozen = new WeakSet<object>()
export function freezeValue<T>(value: T): T {
  if (value === null || typeof value !== 'object' || frozen.has(value)) return value
  frozen.add(value)
  for (const child of Object.values(value)) freezeValue(child)
  Object.freeze(value)
  return value
}
