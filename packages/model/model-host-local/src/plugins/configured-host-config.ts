import type { ModelConfiguration, ReplayResend } from '@omne-harness/model'
import type { Adoption } from '@omne-harness/model-contract'
import { parseRetryPolicy, type RetryPolicy } from '@omne-harness/retry'
import { fieldOf, isRecord } from '../fields.ts'
import { modelHostConfigSchema, type ModelHostSettings } from './config.ts'
import { isDelayTable } from './push-values.ts'
import type { ResultPushLimits } from './runtime.ts'

export type ConfiguredModelHostSettings = Readonly<{
  host: ModelHostSettings
  runtime: ModelConfiguration
  results: ResultPushLimits
  retry: Readonly<{ adoption: Adoption; policy: RetryPolicy; replayResend: ReplayResend }>
}>

type Parsed<T> = Readonly<{ value: T }> | Readonly<{ issues: { message: string }[] }>
type Bound = Readonly<{ minimum: number; safe: boolean }>

const RUNTIME_BOUNDS = {
  outputBatchBytes: { minimum: 1, safe: false },
  outputBatchDelayMs: { minimum: 0, safe: false },
  observerBufferBytes: { minimum: 1, safe: false },
  observerCheckIntervalMs: { minimum: 1, safe: true },
  readIdleMs: { minimum: 1, safe: false },
  resultPageTargetBytes: { minimum: 1, safe: false },
} satisfies Record<Exclude<keyof ModelConfiguration, 'cleanupRetryMs'>, Bound>
const RESULT_BOUNDS = {
  maxConcurrentCalls: { minimum: 1, safe: true },
  maxRedeliveries: { minimum: 0, safe: true },
  maxCleanupSteps: { minimum: 1, safe: true },
  maxPendingAccountsPerTenant: { minimum: 1, safe: true },
  maxPendingAccounts: { minimum: 1, safe: true },
} satisfies Record<Exclude<keyof ResultPushLimits, 'delaysMs'>, Bound>
const REPLAY_RESEND_BOUNDS = { max: { minimum: 0, safe: true } } satisfies Record<
  keyof ReplayResend,
  Bound
>

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
  return { value: numbers as Readonly<Record<K, number>> }
}

const named = (value: unknown): value is string => typeof value === 'string' && value !== ''

function parseDelays(value: unknown, group: string): Parsed<readonly number[]> {
  return isDelayTable(value)
    ? { value: [...value] }
    : { issues: [{ message: `${group} must list integers of at least 1` }] }
}

function parseRetry(value: unknown): Parsed<ConfiguredModelHostSettings['retry']> {
  const adoption = fieldOf(value, 'adoption')
  const owner = fieldOf(adoption, 'owner')
  const name = fieldOf(adoption, 'name')
  const revision = fieldOf(adoption, 'revision')
  const digest = fieldOf(adoption, 'digest')
  if (!named(owner) || !named(name) || !named(revision) || !named(digest))
    return { issues: [{ message: 'retry.adoption must name owner, name, revision and digest' }] }
  const replayResend = parseNumbers(
    fieldOf(value, 'replayResend'),
    'retry.replayResend',
    REPLAY_RESEND_BOUNDS,
  )
  if ('issues' in replayResend) return replayResend
  try {
    const policy = parseRetryPolicy(fieldOf(value, 'policy'))
    return {
      value: {
        adoption: { owner, name, revision, digest },
        policy,
        replayResend: replayResend.value,
      },
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'not a retry policy'
    return { issues: [{ message: `retry.policy: ${reason}` }] }
  }
}

function parseConfig(value: unknown): Parsed<ConfiguredModelHostSettings> {
  const host = modelHostConfigSchema['~standard'].validate(fieldOf(value, 'host'))
  if ('issues' in host) return host
  const runtime = parseNumbers(fieldOf(value, 'runtime'), 'runtime', RUNTIME_BOUNDS)
  if ('issues' in runtime) return runtime
  const results = parseNumbers(fieldOf(value, 'results'), 'results', RESULT_BOUNDS)
  if ('issues' in results) return results
  const delays = parseDelays(fieldOf(fieldOf(value, 'results'), 'delaysMs'), 'results.delaysMs')
  if ('issues' in delays) return delays
  const retry = parseRetry(fieldOf(value, 'retry'))
  if ('issues' in retry) return retry
  return {
    value: {
      host: host.value,
      runtime: runtime.value,
      results: { ...results.value, delaysMs: delays.value },
      retry: retry.value,
    },
  }
}

export const configuredModelHostConfigSchema = {
  '~standard': { version: 1 as const, vendor: 'model-host-local', validate: parseConfig },
}
