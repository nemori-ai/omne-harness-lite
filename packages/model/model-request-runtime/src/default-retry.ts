import { copyJsonValue, isJsonNumber, type JsonNumber } from '@omne-harness-lite/content-blocks'
import {
  judgeValue,
  type AfterModelCallFailureSubject,
  type ExtensionInput,
  type ExtensionOutput,
} from '@omne-harness-lite/loop-extension'
import type { Duration } from '@omne-harness-lite/tool-definition'
import { decideRetry } from './decide-retry.ts'
import { retryDelay } from './retry-delay.ts'
import type { RetryBackoffPolicy } from './retry-delay-types.ts'

export const DEFAULT_RETRY_BUILTIN = 'omne-official:default-retry'

export type DefaultRetryResult =
  | { readonly kind: 'output'; readonly value: ExtensionOutput }
  | { readonly kind: 'notStartedUnavailable' }
  | { readonly kind: 'errored'; readonly error: string }

export interface DefaultRetryConfiguration {
  readonly policy: RetryBackoffPolicy
  /** The source may become unavailable before a decision begins. */
  readonly sample: () => JsonNumber | { readonly unavailable: true }
}

function object(value: unknown): value is Readonly<Record<string, unknown>> {
  return (
    value !== null && typeof value === 'object' && !Array.isArray(value) && !isJsonNumber(value)
  )
}

function failureInput(value: ExtensionInput): value is ExtensionInput & {
  readonly position: 'after_model_call'
  readonly dimension: { readonly ending: 'failure' }
  readonly subject: AfterModelCallFailureSubject
} {
  return value.position === 'after_model_call' && value.dimension.ending === 'failure'
}

function ownedPolicy(value: RetryBackoffPolicy): RetryBackoffPolicy {
  const copied = copyJsonValue(value)
  if ('failed' in copied || !object(copied.ok)) throw new TypeError('Invalid default retry policy')
  const policy = copied.ok
  if (
    Object.keys(policy).length !== 5 ||
    (policy.kind !== 'constant' && policy.kind !== 'linear' && policy.kind !== 'exponential') ||
    typeof policy.base !== 'string' ||
    !isJsonNumber(policy.factor) ||
    typeof policy.max !== 'string' ||
    (policy.jitter !== 'none' &&
      policy.jitter !== 'full' &&
      policy.jitter !== 'half' &&
      policy.jitter !== 'decorrelated')
  )
    throw new TypeError('Invalid default retry policy')
  const owned: RetryBackoffPolicy = {
    kind: policy.kind,
    base: policy.base,
    factor: policy.factor,
    max: policy.max,
    jitter: policy.jitter,
  }
  const checked =
    owned.jitter === 'decorrelated'
      ? retryDelay({
          policy: { ...owned, jitter: 'decorrelated' },
          n: 1,
          uniformSample: 0,
          previousDelay: owned.base,
        })
      : retryDelay({ policy: { ...owned, jitter: owned.jitter }, n: 1, uniformSample: 0 })
  if ('invalidInput' in checked) throw new TypeError('Invalid default retry policy')
  return Object.freeze(owned)
}

/** An independent P-5 contribution. Scheduling, registration and durable conclusions belong to its consumers. */
export function createDefaultRetryImplementation(
  config: DefaultRetryConfiguration,
): (input: ExtensionInput, signal: AbortSignal) => Promise<DefaultRetryResult> {
  if (config === null || typeof config !== 'object' || typeof config.sample !== 'function')
    throw new TypeError('Default retry policy and sample are required')
  const policy = ownedPolicy(config.policy)
  const sample = config.sample
  return async (input, signal) => {
    if (signal.aborted) return { kind: 'notStartedUnavailable' }
    if ('rejected' in judgeValue('ExtensionInput', input) || !failureInput(input))
      return { kind: 'errored', error: 'invalid_default_retry_input' }
    let uniformSample: JsonNumber | { readonly unavailable: true }
    try {
      uniformSample = sample()
    } catch {
      return { kind: 'notStartedUnavailable' }
    }
    if (
      typeof uniformSample === 'object' &&
      uniformSample !== null &&
      'unavailable' in uniformSample &&
      uniformSample.unavailable === true
    )
      return { kind: 'notStartedUnavailable' }
    if (!isJsonNumber(uniformSample) || signal.aborted)
      return { kind: 'errored', error: 'default_retry_sample_invalid_or_cancelled' }
    const subject = input.subject
    const last = [...subject.retryConclusions]
      .reverse()
      .find(conclusion => conclusion.extension === DEFAULT_RETRY_BUILTIN)
    let result
    if (policy.jitter === 'decorrelated') {
      const previousDelay: Duration | undefined =
        last === undefined ? policy.base : last.output.plan.after
      if (previousDelay === undefined)
        return { kind: 'errored', error: 'default_retry_previous_delay_missing' }
      result = decideRetry({
        subject: { known: subject },
        policy: { ...policy, jitter: 'decorrelated' },
        uniformSample,
        previousDelay,
      })
    } else {
      result = decideRetry({
        subject: { known: subject },
        policy: { ...policy, jitter: policy.jitter },
        uniformSample,
      })
    }
    if ('rejected' in result) return { kind: 'errored', error: `default_retry_${result.rejected}` }
    return { kind: 'output', value: result }
  }
}
