// `McpConfig` validation at the construction of the services (SPEC S3). Every field is required,
// nothing is defaulted, and an unlawful configuration is a `RangeError`.
import type { McpConfig } from '@omne-harness/mcp-contract'

const BOUNDS = ['maxListingPages', 'maxActions', 'instructionsByteLimit'] as const

function isPositiveSafeInteger(value: unknown): boolean {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1
}

/** The member `key` of an object, read without a type assertion. */
function member(object: object, key: string): unknown {
  return key in object ? Reflect.get(object, key) : undefined
}

/**
 * True when `value` has the shape of `McpConfig`. The principal type `P` cannot be checked: a
 * function is accepted as the key of any principal, which is what the type says.
 */
function isMcpConfig<P>(value: unknown): value is McpConfig<P> {
  if (typeof value !== 'object' || value === null) return false
  if (typeof member(value, 'principalKey') !== 'function') return false
  return BOUNDS.every(bound => isPositiveSafeInteger(member(value, bound)))
}

/** The configuration as given, or `RangeError` naming what a lawful configuration needs. */
export function validateConfig<P>(config: unknown): McpConfig<P> {
  if (!isMcpConfig<P>(config))
    throw new RangeError(
      'McpConfig needs principalKey (a function) and positive safe integers for ' +
        BOUNDS.join(', '),
    )
  return config
}
