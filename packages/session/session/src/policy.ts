// The scheduling policy of the factory configuration (SPEC SchedulingPolicy, SR-3). Every interval,
// limit and backoff lives here; the defaults are configuration seeds, not contract promises.

export type SchedulingPolicy = Readonly<{
  command: Readonly<{ retriesOnChanged: number }>
  advance: Readonly<{ retryDelaysMs: readonly number[] }>
  idle: Readonly<{ checkIntervalMs: number; clockToleranceMs: number }>
  recoveryScan: Readonly<{
    periodMs: number
    pageSize: number
    sessionBackoff: Readonly<{ initialMs: number; multiplier: number; maxMs: number }>
  }>
  pendingResolution: Readonly<{ retryIntervalMs: number; maxAttempts: number }>
  controlReplay: Readonly<{ intervalMs: number; maxReplays: number }>
  cascade: Readonly<{ intervalMs: number; maxDrives: number }>
  /** prewarm stays false until the Agent host instance-creation entry exists (contract P-7). */
  preEvaluation: Readonly<{ concurrency: number; prewarm: false }>
  boundedRecovery: Readonly<{ maxInspectAttempts: number; retryIntervalMs: number }>
  cache: Readonly<{ entryBudgetBytes: number; snapshotSessions: number }>
}>

export type SessionConfiguration = Readonly<{ policy: SchedulingPolicy }>

/** Initial values from SPEC SchedulingPolicy. They are configuration seeds, not contract promises. */
export const defaultSchedulingPolicy: SchedulingPolicy = Object.freeze({
  command: Object.freeze({ retriesOnChanged: 3 }),
  advance: Object.freeze({ retryDelaysMs: Object.freeze([1000, 5000, 30000]) }),
  idle: Object.freeze({ checkIntervalMs: 60000, clockToleranceMs: 5000 }),
  recoveryScan: Object.freeze({
    periodMs: 30000,
    pageSize: 100,
    sessionBackoff: Object.freeze({ initialMs: 5000, multiplier: 2, maxMs: 300000 }),
  }),
  pendingResolution: Object.freeze({ retryIntervalMs: 5000, maxAttempts: 60 }),
  controlReplay: Object.freeze({ intervalMs: 10000, maxReplays: 30 }),
  cascade: Object.freeze({ intervalMs: 10000, maxDrives: 30 }),
  preEvaluation: Object.freeze({ concurrency: 2, prewarm: false as const }),
  boundedRecovery: Object.freeze({ maxInspectAttempts: 10, retryIntervalMs: 30000 }),
  cache: Object.freeze({ entryBudgetBytes: 67108864, snapshotSessions: 1024 }),
})

/** A configuration the factory refuses. `field` is the path of the first offending field. */
export class SessionConfigurationError extends Error {
  readonly field: string
  constructor(field: string, reason: string) {
    super(`invalid session configuration at ${field}: ${reason}`)
    this.name = 'SessionConfigurationError'
    this.field = field
  }
}

type Rule = 'count' | 'interval' | 'delay'

/** The rule of every numeric field, by path. A count and an interval must be positive; a delay may be zero. */
const NUMERIC_FIELDS: readonly (readonly [string, Rule])[] = [
  ['command.retriesOnChanged', 'count'],
  ['idle.checkIntervalMs', 'interval'],
  ['idle.clockToleranceMs', 'delay'],
  ['recoveryScan.periodMs', 'interval'],
  ['recoveryScan.pageSize', 'count'],
  ['recoveryScan.sessionBackoff.initialMs', 'interval'],
  ['recoveryScan.sessionBackoff.multiplier', 'interval'],
  ['recoveryScan.sessionBackoff.maxMs', 'interval'],
  ['pendingResolution.retryIntervalMs', 'interval'],
  ['pendingResolution.maxAttempts', 'count'],
  ['controlReplay.intervalMs', 'interval'],
  ['controlReplay.maxReplays', 'count'],
  ['cascade.intervalMs', 'interval'],
  ['cascade.maxDrives', 'count'],
  ['preEvaluation.concurrency', 'count'],
  ['boundedRecovery.maxInspectAttempts', 'count'],
  ['boundedRecovery.retryIntervalMs', 'interval'],
  ['cache.entryBudgetBytes', 'count'],
  ['cache.snapshotSessions', 'count'],
]

function at(root: unknown, path: string): unknown {
  let value = root
  for (const key of path.split('.')) {
    if (typeof value !== 'object' || value === null) return undefined
    value = (value as Readonly<Record<string, unknown>>)[key]
  }
  return value
}

function refusal(value: unknown, rule: Rule): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'not a finite number'
  if (value < 0) return 'negative'
  if (rule === 'count' && !Number.isSafeInteger(value)) return 'not an integer'
  if (rule !== 'delay' && value === 0) return 'zero'
  return null
}

/**
 * Checks a configuration given by the assembly. It throws `SessionConfigurationError` naming the
 * first offending field: a negative value, a zero limit or interval, an empty backoff sequence, a
 * non-finite number, or a prewarm switch that P-7 does not allow yet.
 */
export function checkSessionConfiguration(configuration: unknown): SessionConfiguration {
  const policy = at(configuration, 'policy')
  if (typeof policy !== 'object' || policy === null)
    throw new SessionConfigurationError('policy', 'missing')
  for (const [path, rule] of NUMERIC_FIELDS) {
    const reason = refusal(at(policy, path), rule)
    if (reason !== null) throw new SessionConfigurationError(`policy.${path}`, reason)
  }
  const delays = at(policy, 'advance.retryDelaysMs')
  if (!Array.isArray(delays) || delays.length === 0)
    throw new SessionConfigurationError('policy.advance.retryDelaysMs', 'empty or not a sequence')
  delays.forEach((delay: unknown, index) => {
    const reason = refusal(delay, 'delay')
    if (reason !== null)
      throw new SessionConfigurationError(`policy.advance.retryDelaysMs.${String(index)}`, reason)
  })
  if (at(policy, 'preEvaluation.prewarm') !== false)
    throw new SessionConfigurationError(
      'policy.preEvaluation.prewarm',
      'must stay false until the Agent host instance-creation entry exists',
    )
  // Every field was checked above against the shape of SchedulingPolicy.
  return configuration as SessionConfiguration
}
