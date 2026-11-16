export type RuntimeContextConfig = Readonly<{
  retention?: number
  replayCapacity?: number
  supplyBoundMs?: number
  settleBoundMs?: number
  readCacheEntries?: number
  refreshConcurrency?: number
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
