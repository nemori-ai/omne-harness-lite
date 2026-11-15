import type { McpConfig } from '@omne-harness/mcp-contract'

const BOUNDS = ['maxListingPages', 'maxActions', 'instructionsByteLimit'] as const

function isPositiveSafeInteger(value: unknown): boolean {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1
}

function member(object: object, key: string): unknown {
  return key in object ? Reflect.get(object, key) : undefined
}

function isMcpConfig<P>(value: unknown): value is McpConfig<P> {
  if (typeof value !== 'object' || value === null) return false
  if (typeof member(value, 'principalKey') !== 'function') return false
  return BOUNDS.every(bound => isPositiveSafeInteger(member(value, bound)))
}

export function validateConfig<P>(config: unknown): McpConfig<P> {
  if (!isMcpConfig<P>(config))
    throw new RangeError(
      'McpConfig needs principalKey (a function) and positive safe integers for ' +
        BOUNDS.join(', '),
    )
  return config
}
