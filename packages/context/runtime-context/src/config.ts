/**
 * Bounds of one mechanism instance. Every field is optional; an omitted field takes its initial
 * value from {@link RUNTIME_CONTEXT_DEFAULTS}. The initial values are configuration starting
 * points, not product numbers.
 */
export type RuntimeContextConfig = Readonly<{
  /** View revisions a cursor may fall behind before `changes` invalidates it. */
  retention?: number
  /** Upper bound of one recovery material: registrations, checkpoint blocks and the end. */
  replayCapacity?: number
  /** Milliseconds one source or supply callback may take before it reads as unknown. */
  supplyBoundMs?: number
  /** Milliseconds a handle withdrawal or `close` waits for operations in flight. */
  settleBoundMs?: number
  /** Entries of the read cache; 0 turns the cache off. */
  readCacheEntries?: number
  /** Restored-supply source calls in flight at one time, across scopes. At least 1. */
  refreshConcurrency?: number
  /** Milliseconds after a failed restored supply before a read calls the source again. */
  refreshRetryMs?: number
}>

export type ResolvedRuntimeContextConfig = Required<RuntimeContextConfig>

export const RUNTIME_CONTEXT_DEFAULTS: ResolvedRuntimeContextConfig = Object.freeze({
  retention: 64,
  replayCapacity: 10000,
  supplyBoundMs: 30000,
  settleBoundMs: 1000,
  readCacheEntries: 256,
  refreshConcurrency: 16,
  refreshRetryMs: 0,
})

/** The largest delay a Node timer keeps; a larger one fires at once. */
const MAX_TIMER_MS = 2_147_483_647

type Bound = Readonly<{ minimum: number; maximum: number }>

const BOUNDS: Readonly<Record<keyof ResolvedRuntimeContextConfig, Bound>> = {
  retention: { minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
  replayCapacity: { minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
  supplyBoundMs: { minimum: 0, maximum: MAX_TIMER_MS },
  settleBoundMs: { minimum: 0, maximum: MAX_TIMER_MS },
  readCacheEntries: { minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
  refreshConcurrency: { minimum: 1, maximum: Number.MAX_SAFE_INTEGER },
  refreshRetryMs: { minimum: 0, maximum: MAX_TIMER_MS },
}

const FIELDS = [
  'retention',
  'replayCapacity',
  'supplyBoundMs',
  'settleBoundMs',
  'readCacheEntries',
  'refreshConcurrency',
  'refreshRetryMs',
] as const satisfies readonly (keyof ResolvedRuntimeContextConfig)[]

/**
 * Applies the initial values and checks every bound. An illegal value throws `RangeError` naming
 * the field. This is the one place the bounds are decided; the Cordis configuration schema calls it.
 */
export function resolveRuntimeContextConfig(
  config: RuntimeContextConfig = {},
): ResolvedRuntimeContextConfig {
  const resolved: { -readonly [F in keyof ResolvedRuntimeContextConfig]: number } = {
    ...RUNTIME_CONTEXT_DEFAULTS,
  }
  for (const field of FIELDS) {
    const value = config[field] ?? RUNTIME_CONTEXT_DEFAULTS[field]
    const { minimum, maximum } = BOUNDS[field]
    if (!Number.isSafeInteger(value) || value < minimum || value > maximum)
      throw new RangeError(`${field} must be an integer from ${minimum} to ${maximum}`)
    resolved[field] = value
  }
  return Object.freeze(resolved)
}
