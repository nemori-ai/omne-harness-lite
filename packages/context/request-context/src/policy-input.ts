// Strategy parameters are checked once, at construction, against the contract schemas. A value
// that does not fit is refused with a TypeError; nothing is corrected or replaced by a default.
import type { standardSchema } from '@omne-harness/request-context-contract'

export function decodeParameters<T>(
  schema: ReturnType<typeof standardSchema<T>>,
  value: unknown,
  what: string,
): T {
  const checked = schema['~standard'].validate(value)
  if (checked instanceof Promise) throw new TypeError(`${what}: the schema must be synchronous`)
  if (checked.issues !== undefined) {
    const where = checked.issues.map(issue => issue.message).join('; ')
    throw new TypeError(`${what} does not fit its schema: ${where}`)
  }
  return checked.value
}
export function decodeByteCount(value: string, what: string): bigint {
  if (!/^[1-9][0-9]*$/u.test(value)) throw new TypeError(`${what} must be a positive integer`)
  return BigInt(value)
}
