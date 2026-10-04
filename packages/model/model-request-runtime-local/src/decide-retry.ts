import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import { isJsonNumber, type JsonNumber } from '@omne-harness-lite/content-blocks'
import { judgeValue } from '@omne-harness-lite/loop-extension'
import { retryDelay } from '@omne-harness-lite/model-request-runtime'
import type { RetryBackoffPolicy, RetryDelayResult } from '@omne-harness-lite/model-request-runtime'
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

function validRequestShape(value: DecideRetryInput): boolean {
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
    return false
  return true
}

function validProviders(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) &&
    value.length !== 0 &&
    value.every(
      provider =>
        typeof provider === 'string' && provider.trim() === provider && provider.length > 0,
    ) &&
    new Set(value).size === value.length
  )
}

function subjectFacts(subjectFact: DecideRetryInput['subject']) {
  if ('unknown' in subjectFact) {
    if (members(subjectFact, ['unknown']) && subjectFact.unknown === true) return unavailable
    return invalid
  }
  if (!members(subjectFact, ['known'])) return invalid
  const judged = judgeValue('AfterModelCallFailureSubject', subjectFact.known)
  if ('rejected' in judged || !object(judged.ok)) return invalid
  const subject = judged.ok
  const parts = subjectParts(subject)
  return parts === undefined ? invalid : { subject, ...parts }
}

function subjectParts(subject: Readonly<Record<string, unknown>>) {
  if (
    !object(subject.profile) ||
    !Array.isArray(subject.dispatches) ||
    !Array.isArray(subject.retryConclusions)
  )
    return undefined
  const profile = subject.profile
  const providers = profile.providers
  const dispatches = subject.dispatches
  if (
    !validProviders(providers) ||
    typeof profile.allowFallback !== 'boolean' ||
    dispatches.length === 0
  )
    return undefined
  return { profile, providers, dispatches, conclusions: subject.retryConclusions }
}

function validDispatch(
  dispatch: unknown,
  providers: readonly string[],
  index: number,
): dispatch is { readonly provider: string; readonly call: string; readonly dispatch: JsonNumber } {
  return (
    object(dispatch) &&
    typeof dispatch.provider === 'string' &&
    typeof dispatch.call === 'string' &&
    isJsonNumber(dispatch.dispatch) &&
    providers.includes(dispatch.provider) &&
    ExactDecimal.from(dispatch.dispatch).compare(ExactDecimal.from(index + 1)) === 0
  )
}

function usedProviders(
  dispatches: readonly unknown[],
  providers: readonly string[],
  conclusions: readonly unknown[],
) {
  const used = new Set<string>()
  let call: string | undefined
  for (const [index, dispatch] of dispatches.entries()) {
    if (!validDispatch(dispatch, providers, index)) return undefined
    if (call !== undefined && dispatch.call !== call) return undefined
    call = dispatch.call
    used.add(dispatch.provider)
  }
  if (
    call === undefined ||
    conclusions.some(conclusion => !object(conclusion) || conclusion.modelCallId !== call)
  )
    return undefined
  return used
}

function nextRetry(
  profile: Readonly<Record<string, unknown>>,
  providers: readonly string[],
  dispatches: readonly unknown[],
  used: ReadonlySet<string>,
  defaultRetryCount: number,
) {
  const latest = dispatches.at(-1)
  if (!object(latest) || typeof latest.provider !== 'string') return invalid
  if (profile.allowFallback) {
    const latestIndex = providers.indexOf(latest.provider)
    const immediate = providers[latestIndex + 1]
    if (typeof immediate !== 'string' || used.has(immediate)) return observed
    return { provider: immediate, n: defaultRetryCount + 1 }
  }
  const first = providers[0]
  if (typeof first !== 'string' || latest.provider !== first || used.size !== 1) return invalid
  // A same-provider continuation does not spend the default extension's retry.
  if (defaultRetryCount >= 1) return observed
  return { provider: first, n: defaultRetryCount + 1 }
}

/**
 * S-35/S-60/S-76 finite pure decision. It does not read the current profile, schedule,
 * send, or authorize dispatchAgain. The caller still applies the S-30 guard.
 */
export function decideRetry(value: DecideRetryInput): DecideRetryResult {
  if (!validRequestShape(value)) return invalid
  const policy = value.policy
  const sample = value.uniformSample
  const previousDelay = value.previousDelay
  const hasPreviousDelay = Object.hasOwn(value, 'previousDelay')
  // Check all explicit policy facts even when no retry is possible. At n=2 the
  // decorrelated previous delay may legitimately differ from base.
  if ('invalidInput' in delay(policy, 2, sample, previousDelay, hasPreviousDelay)) return invalid
  const facts = subjectFacts(value.subject)
  if (!('subject' in facts)) return facts
  const { subject, profile, providers, dispatches, conclusions } = facts
  const used = usedProviders(dispatches, providers, conclusions)
  if (used === undefined) return invalid
  const defaultRetryCount = conclusions.filter(
    conclusion => conclusion.extension === 'omne-official:default-retry',
  ).length
  if (subject.failure !== 'upstream_unavailable' && subject.failure !== 'unrecognized')
    return observed
  const next = nextRetry(profile, providers, dispatches, used, defaultRetryCount)
  if (!('provider' in next)) return next
  const after = delay(policy, next.n, sample, previousDelay, hasPreviousDelay)
  if ('invalidInput' in after) return invalid
  return Object.freeze({
    kind: 'retry',
    plan: Object.freeze({ provider: next.provider, after: after.ok }),
  })
}
