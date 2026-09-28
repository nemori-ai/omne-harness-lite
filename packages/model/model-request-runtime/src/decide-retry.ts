import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import { isJsonNumber, type JsonNumber } from '@omne-harness-lite/content-blocks'
import { judgeValue } from '@omne-harness-lite/loop-extension'
import { retryDelay } from './retry-delay.ts'
import type { RetryBackoffPolicy, RetryDelayResult } from './retry-delay-types.ts'
import type { DecideRetryInput, DecideRetryResult } from './decide-retry-types.ts'

function object(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function members(value: Readonly<Record<string, unknown>>, names: readonly string[]): boolean {
  const keys = Object.keys(value)
  return keys.length === names.length && keys.every(key => names.includes(key))
}

function policyShape(value: unknown): value is RetryBackoffPolicy {
  return (
    object(value) &&
    members(value, ['kind', 'base', 'factor', 'max', 'jitter']) &&
    (value.kind === 'constant' || value.kind === 'linear' || value.kind === 'exponential') &&
    typeof value.base === 'string' &&
    isJsonNumber(value.factor) &&
    typeof value.max === 'string' &&
    (value.jitter === 'none' ||
      value.jitter === 'full' ||
      value.jitter === 'half' ||
      value.jitter === 'decorrelated')
  )
}

function delay(
  policy: RetryBackoffPolicy,
  n: number,
  uniformSample: JsonNumber,
  previousDelay: unknown,
  hasPreviousDelay: boolean,
): RetryDelayResult {
  if (policy.jitter === 'decorrelated') {
    if (typeof previousDelay !== 'string' || !hasPreviousDelay)
      return { invalidInput: { reason: 'malformed' } }
    return retryDelay({
      policy: { ...policy, jitter: 'decorrelated' },
      n,
      uniformSample,
      previousDelay,
    })
  }
  if (hasPreviousDelay) return { invalidInput: { reason: 'malformed' } }
  return retryDelay({
    policy: { ...policy, jitter: policy.jitter },
    n,
    uniformSample,
  })
}

const invalid: DecideRetryResult = Object.freeze({ rejected: 'invalidInput' })
const unavailable: DecideRetryResult = Object.freeze({ rejected: 'unavailable' })
const observed: DecideRetryResult = Object.freeze({ kind: 'observed' })

/**
 * S-35/S-60 finite pure decision. It does not read the current profile, schedule,
 * send, or authorize dispatchAgain. The caller still applies the S-30 guard.
 */
export function decideRetry(value: DecideRetryInput): DecideRetryResult {
  if (
    !object(value) ||
    !members(
      value,
      Object.hasOwn(value, 'previousDelay')
        ? ['subject', 'policy', 'uniformSample', 'previousDelay']
        : ['subject', 'policy', 'uniformSample'],
    ) ||
    !policyShape(value.policy) ||
    !isJsonNumber(value.uniformSample) ||
    !object(value.subject)
  )
    return invalid
  const policy = value.policy
  const sample = value.uniformSample
  const previousDelay = value.previousDelay
  const hasPreviousDelay = Object.hasOwn(value, 'previousDelay')
  // Check all explicit policy facts even when no retry is possible. At n=2 the
  // decorrelated previous delay may legitimately differ from base.
  if ('invalidInput' in delay(policy, 2, sample, previousDelay, hasPreviousDelay)) return invalid
  const subjectFact = value.subject
  if ('unknown' in subjectFact) {
    if (members(subjectFact, ['unknown']) && subjectFact.unknown === true) return unavailable
    return invalid
  }
  if (!members(subjectFact, ['known'])) return invalid
  const judged = judgeValue('AfterModelCallFailureSubject', subjectFact.known)
  if ('rejected' in judged || !object(judged.ok)) return invalid
  const subject = judged.ok
  if (!object(subject.profile) || !Array.isArray(subject.dispatches)) return invalid
  const profile = subject.profile
  const providers = profile.providers
  const dispatches = subject.dispatches
  if (
    !Array.isArray(providers) ||
    providers.length === 0 ||
    !providers.every(
      provider =>
        typeof provider === 'string' && provider.trim() === provider && provider.length > 0,
    ) ||
    new Set(providers).size !== providers.length ||
    typeof profile.allowFallback !== 'boolean' ||
    dispatches.length === 0
  )
    return invalid
  const used = new Set<string>()
  let call: string | undefined
  for (const [index, dispatch] of dispatches.entries()) {
    if (
      !object(dispatch) ||
      typeof dispatch.provider !== 'string' ||
      typeof dispatch.call !== 'string' ||
      !isJsonNumber(dispatch.dispatch) ||
      !providers.includes(dispatch.provider) ||
      ExactDecimal.from(dispatch.dispatch).compare(ExactDecimal.from(index + 1)) !== 0
    )
      return invalid
    if (call !== undefined && dispatch.call !== call) return invalid
    call = dispatch.call
    used.add(dispatch.provider)
  }
  if (subject.failure !== 'upstream_unavailable' && subject.failure !== 'unrecognized')
    return observed
  const latest = dispatches.at(-1)
  if (!object(latest) || typeof latest.provider !== 'string') return invalid
  let next: string | undefined
  let n: number
  if (profile.allowFallback) {
    const latestIndex = providers.indexOf(latest.provider)
    const immediate = providers[latestIndex + 1]
    if (typeof immediate !== 'string' || used.has(immediate)) return observed
    next = immediate
    n = used.size
  } else {
    const first = providers[0]
    if (typeof first !== 'string' || latest.provider !== first || used.size !== 1) return invalid
    // [A,A] may be a default retry or an S-33 runtime_lost continuation.
    // LC4's failure subject omits that distinction, so neither a second
    // retry nor exhaustion can be asserted from these facts alone.
    if (dispatches.length > 1) return unavailable
    next = first
    n = 1
  }
  if (next === undefined) return invalid
  const after = delay(policy, n, sample, previousDelay, hasPreviousDelay)
  if ('invalidInput' in after) return invalid
  return Object.freeze({ kind: 'retry', plan: Object.freeze({ provider: next, after: after.ok }) })
}
