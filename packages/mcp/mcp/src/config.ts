import type { McpConfig } from '@omne-harness/mcp-contract'

const BOUNDS = ['maxListingPages', 'maxActions', 'instructionsByteLimit'] as const

function isPositiveSafeInteger(value: unknown): boolean {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1
}

function member(object: object, key: string): unknown {
  return key in object ? Reflect.get(object, key) : undefined
}

function isTaskWatch(value: unknown): boolean {
  if (value === undefined) return true
  if (typeof value !== 'object' || value === null) return false
  return ['pollFloorMs', 'backoffCapMs'].every(bound => isPositiveSafeInteger(member(value, bound)))
}

function isEvents(value: unknown): boolean {
  if (value === undefined) return true
  if (typeof value !== 'object' || value === null) return false
  const bounds = ['maxEvents', 'maxAgeMs', 'pollFloorMs', 'backoffCapMs']
  return bounds.every(bound => isPositiveSafeInteger(member(value, bound)))
}

function isOAuth(value: unknown): boolean {
  if (value === undefined) return true
  if (typeof value !== 'object' || value === null) return false
  const document = member(value, 'metadataDocument')
  if (document !== undefined && typeof document !== 'string') return false
  return ['pendingMs', 'requestMs'].every(bound => isPositiveSafeInteger(member(value, bound)))
}

function isMcpConfig<P>(value: unknown): value is McpConfig<P> {
  if (typeof value !== 'object' || value === null) return false
  if (typeof member(value, 'principalKey') !== 'function') return false
  if (!isTaskWatch(member(value, 'taskWatch'))) return false
  if (!isOAuth(member(value, 'oauth'))) return false
  if (!isEvents(member(value, 'events'))) return false
  return BOUNDS.every(bound => isPositiveSafeInteger(member(value, bound)))
}

export function validateConfig<P>(config: unknown): McpConfig<P> {
  if (!isMcpConfig<P>(config))
    throw new RangeError(
      'McpConfig needs principalKey (a function) and positive safe integers for ' +
        `${BOUNDS.join(', ')}, for pollFloorMs and backoffCapMs of a taskWatch, pendingMs and requestMs of an oauth, and maxEvents, maxAgeMs, pollFloorMs and backoffCapMs of the events it gives`,
    )
  return config
}
