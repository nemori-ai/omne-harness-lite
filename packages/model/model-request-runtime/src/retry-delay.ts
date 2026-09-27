import {
  copyJsonValue,
  isJsonNumber,
  type JsonObject,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import { validate, type Duration } from '@omne-harness-lite/tool-definition'
import {
  add,
  clippedExponential,
  clippedProduct,
  compare,
  duration,
  half,
  minimum,
  multiply,
  number,
  one,
  seconds,
  subtract,
  zero,
} from './retry-delay-decimal.ts'
import type { RetryDelayInput, RetryDelayResult } from './retry-delay-types.ts'

function object(value: JsonValue | undefined): value is JsonObject {
  return (
    value !== null && typeof value === 'object' && !Array.isArray(value) && !isJsonNumber(value)
  )
}

function members(value: JsonObject, expected: readonly string[]): boolean {
  return (
    Object.keys(value).length === expected.length &&
    expected.every(key => Object.hasOwn(value, key))
  )
}

function isDuration(value: JsonValue | undefined): value is Duration {
  return typeof value === 'string' && validate('Duration', value).valid
}

const malformed: RetryDelayResult = Object.freeze({
  invalidInput: Object.freeze({ reason: 'malformed' }),
})

/** S-60 pure exact delay. This neither authorizes a retry nor schedules a wait. */
export function retryDelay(input: RetryDelayInput): RetryDelayResult {
  const owned = copyJsonValue(input)
  if (!('ok' in owned) || !object(owned.ok)) return malformed
  const facts = owned.ok
  const policy = facts.policy
  if (!object(policy) || !members(policy, ['kind', 'base', 'factor', 'max', 'jitter']))
    return malformed
  if (policy.kind !== 'constant' && policy.kind !== 'linear' && policy.kind !== 'exponential')
    return malformed
  if (
    policy.jitter !== 'none' &&
    policy.jitter !== 'full' &&
    policy.jitter !== 'half' &&
    policy.jitter !== 'decorrelated'
  )
    return malformed
  const decorrelated = policy.jitter === 'decorrelated'
  if (
    !members(
      facts,
      decorrelated
        ? ['policy', 'n', 'uniformSample', 'previousDelay']
        : ['policy', 'n', 'uniformSample'],
    )
  )
    return malformed
  if (
    !isDuration(policy.base) ||
    !isDuration(policy.max) ||
    !isJsonNumber(policy.factor) ||
    !isJsonNumber(facts.n) ||
    !isJsonNumber(facts.uniformSample)
  )
    return malformed
  const nExact = ExactDecimal.from(facts.n)
  const factorExact = ExactDecimal.from(policy.factor)
  const sampleExact = ExactDecimal.from(facts.uniformSample)
  if (
    !nExact.isInteger ||
    nExact.compare(ExactDecimal.from(0)) <= 0 ||
    factorExact.compare(ExactDecimal.from(1)) < 0 ||
    sampleExact.compare(ExactDecimal.from(0)) < 0 ||
    sampleExact.compare(ExactDecimal.from(1)) >= 0
  )
    return malformed
  const base = seconds(policy.base)
  const max = seconds(policy.max)
  const factor = number(policy.factor)
  const n = number(facts.n)
  const sample = number(facts.uniformSample)
  let result
  if (decorrelated) {
    if (!isDuration(facts.previousDelay)) return malformed
    const previous = seconds(facts.previousDelay)
    if (compare(n, one) === 0 && compare(previous, base) !== 0) return malformed
    const lo = minimum(base, max)
    const grown = clippedProduct(previous, factor, max)
    const hi = compare(grown, lo) < 0 ? lo : grown
    result = add(lo, multiply(sample, subtract(hi, lo)))
  } else {
    // Full jitter at its lower endpoint is zero regardless of a huge exponent.
    if (policy.jitter === 'full' && compare(sample, zero) === 0) result = zero
    else {
      const delay =
        policy.kind === 'constant'
          ? minimum(base, max)
          : policy.kind === 'linear'
            ? clippedProduct(base, n, max)
            : clippedExponential(base, factor, n, max)
      result =
        policy.jitter === 'none'
          ? delay
          : policy.jitter === 'full'
            ? multiply(sample, delay)
            : multiply(add(one, sample), multiply(delay, half))
    }
  }
  return Object.freeze({ ok: duration(result) })
}
