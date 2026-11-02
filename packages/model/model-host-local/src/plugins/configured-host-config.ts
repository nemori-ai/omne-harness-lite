import type { ModelConfiguration } from '@omne-harness/model'
import { fieldOf, isRecord } from '../fields.ts'
import { modelHostConfigSchema, type ModelHostSettings } from './config.ts'
import type { ResultPushLimits } from './runtime.ts'

export type ConfiguredModelHostSettings = Readonly<{
  host: ModelHostSettings
  runtime: ModelConfiguration
  results: ResultPushLimits
}>

type Parsed<T> = Readonly<{ value: T }> | Readonly<{ issues: { message: string }[] }>
type Bound = Readonly<{ minimum: number; safe: boolean }>

// Match model's runtime configuration and the result push's checkedLimits. Runtime counts
// other than the observer interval accept finite integers, including integers outside safe range.
const RUNTIME_BOUNDS = {
  outputBatchBytes: { minimum: 1, safe: false },
  outputBatchDelayMs: { minimum: 0, safe: false },
  observerBufferBytes: { minimum: 1, safe: false },
  observerCheckIntervalMs: { minimum: 1, safe: true },
  readIdleMs: { minimum: 1, safe: false },
  resultPageTargetBytes: { minimum: 1, safe: false },
  retryBackoffMs: { minimum: 0, safe: false },
  cleanupRetryMs: { minimum: 0, safe: false },
} satisfies Record<keyof ModelConfiguration, Bound>
const RESULT_BOUNDS = {
  maxConcurrentCalls: { minimum: 1, safe: true },
  maxRedeliveries: { minimum: 0, safe: true },
  maxCleanupSteps: { minimum: 1, safe: true },
  maxPendingAccountsPerTenant: { minimum: 1, safe: true },
  maxPendingAccounts: { minimum: 1, safe: true },
} satisfies Record<keyof ResultPushLimits, Bound>

function parseNumbers<K extends string>(
  value: unknown,
  group: string,
  bounds: Record<K, Bound>,
): Parsed<Readonly<Record<K, number>>> {
  if (!isRecord(value)) return { issues: [{ message: `${group} must be an object` }] }
  const numbers: Partial<Record<K, number>> = {}
  for (const name in bounds) {
    const input = fieldOf(value, name)
    const bound = bounds[name]
    if (
      typeof input !== 'number' ||
      !Number.isFinite(input) ||
      !(bound.safe ? Number.isSafeInteger(input) : Number.isInteger(input)) ||
      input < bound.minimum
    )
      return {
        issues: [
          {
            message: `${group}.${name} must be an integer of at least ${bound.minimum}${bound.safe ? ' within the safe range' : ''}`,
          },
        ],
      }
    numbers[name] = input
  }
  // Every key in bounds was checked and copied above.
  return { value: numbers as Readonly<Record<K, number>> }
}

function parseConfig(value: unknown): Parsed<ConfiguredModelHostSettings> {
  const host = modelHostConfigSchema['~standard'].validate(fieldOf(value, 'host'))
  if ('issues' in host) return host
  const runtime = parseNumbers(fieldOf(value, 'runtime'), 'runtime', RUNTIME_BOUNDS)
  if ('issues' in runtime) return runtime
  const results = parseNumbers(fieldOf(value, 'results'), 'results', RESULT_BOUNDS)
  if ('issues' in results) return results
  return { value: { host: host.value, runtime: runtime.value, results: results.value } }
}

export const configuredModelHostConfigSchema = {
  '~standard': { version: 1 as const, vendor: 'model-host-local', validate: parseConfig },
}
