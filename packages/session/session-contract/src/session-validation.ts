import type { SessionFailure } from './faces.ts'
import { canonicalText } from './operations.ts'

export class SessionValidationFailure extends Error {
  readonly failure: SessionFailure
  constructor(failure: SessionFailure) {
    super(JSON.stringify(failure))
    this.failure = failure
  }
}
export function invalidAt(field: string, reason: string): never {
  throw new SessionValidationFailure({ kind: 'invalid', field, reason })
}
export function unavailableAt(field: string): never {
  throw new SessionValidationFailure({
    kind: 'unavailable',
    owner: 'session-history',
    diagnostic: `${field}: required original material is missing`,
  })
}
export function inconsistent(field: string): never {
  throw new SessionValidationFailure({ kind: 'quarantined', diagnostic: field })
}
export function nonempty(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) invalidAt(field, 'expected nonempty text')
}
export function decimal(value: unknown, field: string): bigint {
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)$/u.test(value))
    invalidAt(field, 'expected canonical nonnegative decimal')
  return BigInt(value)
}
export function evidenceFields(value: unknown, field: string): void {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    invalidAt(field, 'expected evidence')
  for (const key of ['owner', 'record', 'revision', 'digest']) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (descriptor === undefined || !('value' in descriptor))
      invalidAt(`${field}.${key}`, 'missing evidence member')
    nonempty(descriptor.value, `${field}.${key}`)
  }
}
export const equalValue = (left: unknown, right: unknown): boolean =>
  canonicalText(left) === canonicalText(right)
export function unique<T>(items: readonly T[], key: (item: T) => string, field: string): void {
  if (!Array.isArray(items)) invalidAt(field, 'expected array')
  if (new Set(items.map(key)).size !== items.length) invalidAt(field, 'duplicate member')
}
