/**
 * Structural limits of the contract. They bound the shape of definitions and bindings. They are
 * initial values of the contract, not run-time budgets: budgets are provider configuration.
 */
export const TELEMETRY_LIMITS = Object.freeze({
  componentMaxLength: 64,
  nameMaxLength: 128,
  ownerMaxLength: 128,
  refMaxBytes: 256,
  maxLinks: 8,
  maxAdopted: 8,
  maxFields: 32,
  maxEnumValues: 64,
  enumValueMaxLength: 64,
  maxHistogramBoundaries: 32,
} as const)

/** The answer of the pure validators. They never throw. */
export type ValidationResult =
  | { readonly kind: 'ok' }
  | {
      readonly kind: 'invalid'
      readonly reason:
        | 'not-object'
        | 'undeclared-key'
        | 'missing-key'
        | 'type'
        | 'not-finite'
        | 'out-of-range'
        | 'not-in-enum'
        | 'ref'
        | 'definition'
        | 'scope'
        | 'component'
        | 'owned-ref'
        | 'adopted'
        | 'links'
        | 'malformed'
    }

export type InvalidReason = Extract<ValidationResult, { kind: 'invalid' }>['reason']

export const OK: ValidationResult = Object.freeze({ kind: 'ok' })

export function invalid(reason: InvalidReason): ValidationResult {
  return Object.freeze({ kind: 'invalid', reason })
}

// Printable ASCII without space: no whitespace, no control character, one byte per character.
const TOKEN = /^[\x21-\x7e]+$/

/** A non-empty printable ASCII text without whitespace, at most `maxLength` characters (and bytes). */
export function isToken(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.length <= maxLength && TOKEN.test(value)
}

/** The own members of a plain object, read without calling any accessor. */
export type DataMembers =
  | { readonly kind: 'members'; readonly members: ReadonlyMap<PropertyKey, unknown> }
  | { readonly kind: 'not-object' }
  | { readonly kind: 'accessor' }

const NOT_OBJECT: DataMembers = Object.freeze({ kind: 'not-object' })
const ACCESSOR: DataMembers = Object.freeze({ kind: 'accessor' })

/**
 * Reads the own members of a plain object (prototype `Object.prototype` or `null`). Arrays, class
 * instances and `Error` objects are `not-object`. A member with a getter or setter is `accessor`.
 * A proxy may still throw; callers catch.
 */
export function dataMembers(value: unknown): DataMembers {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return NOT_OBJECT
  const prototype: unknown = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) return NOT_OBJECT
  const members = new Map<PropertyKey, unknown>()
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (descriptor === undefined || !('value' in descriptor)) return ACCESSOR
    members.set(key, descriptor.value)
  }
  return { kind: 'members', members }
}
