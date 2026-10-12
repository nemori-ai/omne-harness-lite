import {
  copyJsonValue,
  isJsonNumber,
  type JsonObject,
  type JsonNumber,
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
  type Decimal,
} from './retry-delay-decimal.ts'
import type { RetryBackoffPolicy, RetryDelayInput, RetryDelayResult } from './retry-delay-types.ts'
import { policyKind, policyJitter } from './retry-policy-shape.ts'

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

function recognizedPolicy(
  value: JsonValue | undefined,
): value is JsonObject & Pick<RetryBackoffPolicy, 'kind' | 'jitter'> {
  return (
    object(value) &&
    members(value, ['kind', 'base', 'factor', 'max', 'jitter']) &&
    policyKind(value.kind) &&
    policyJitter(value.jitter)
  )
}

function delayNumbers(facts: JsonObject, policy: JsonObject) {
  if (
    !isDuration(policy.base) ||
    !isDuration(policy.max) ||
    !isJsonNumber(policy.factor) ||
    !isJsonNumber(facts.n) ||
    !isJsonNumber(facts.uniformSample)
  )
    return undefined
  return {
    base: policy.base,
    max: policy.max,
    factor: policy.factor,
    n: facts.n,
    sample: facts.uniformSample,
  }
}

function validFactors(n: JsonNumber, factor: JsonNumber, sample: JsonNumber): boolean {
  const nExact = ExactDecimal.from(n)
  const factorExact = ExactDecimal.from(factor)
  const sampleExact = ExactDecimal.from(sample)
  return !(
    !nExact.isInteger ||
    nExact.compare(ExactDecimal.from(0)) <= 0 ||
    factorExact.compare(ExactDecimal.from(1)) < 0 ||
    sampleExact.compare(ExactDecimal.from(0)) < 0 ||
    sampleExact.compare(ExactDecimal.from(1)) >= 0
  )
}

interface DelayOperands {
  readonly base: Decimal
  readonly max: Decimal
  readonly factor: Decimal
  readonly n: Decimal
  readonly sample: Decimal
}

function ordinaryDelay(
  policy: Pick<RetryBackoffPolicy, 'kind' | 'jitter'>,
  { base, max, factor, n, sample }: DelayOperands,
): Decimal {
  // Full jitter at its lower endpoint is zero regardless of a huge exponent.
  if (policy.jitter === 'full' && compare(sample, zero) === 0) return zero
  const delay =
    policy.kind === 'constant'
      ? minimum(base, max)
      : policy.kind === 'linear'
        ? clippedProduct(base, n, max)
        : clippedExponential(base, factor, n, max)
  return policy.jitter === 'none'
    ? delay
    : policy.jitter === 'full'
      ? multiply(sample, delay)
      : multiply(add(one, sample), multiply(delay, half))
}

function decorrelatedDelay(previous: Decimal, { base, max, factor, sample }: DelayOperands) {
  const lo = minimum(base, max)
  const grown = clippedProduct(previous, factor, max)
  const hi = compare(grown, lo) < 0 ? lo : grown
  return add(lo, multiply(sample, subtract(hi, lo)))
}

/** S-60 pure exact delay. This neither authorizes a retry nor schedules a wait. */
export function retryDelay(input: RetryDelayInput): RetryDelayResult {
  const owned = copyJsonValue(input)
  if (!('ok' in owned) || !object(owned.ok)) return malformed
  const facts = owned.ok
  const policy = facts.policy
  if (!recognizedPolicy(policy)) return malformed
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
  const values = delayNumbers(facts, policy)
  if (values === undefined || !validFactors(values.n, values.factor, values.sample))
    return malformed
  const base = seconds(values.base)
  const max = seconds(values.max)
  const factor = number(values.factor)
  const n = number(values.n)
  const sample = number(values.sample)
  const operands = { base, max, factor, n, sample }
  let result
  if (decorrelated) {
    if (!isDuration(facts.previousDelay)) return malformed
    const previous = seconds(facts.previousDelay)
    if (compare(n, one) === 0 && compare(previous, base) !== 0) return malformed
    result = decorrelatedDelay(previous, operands)
  } else {
    result = ordinaryDelay(policy, operands)
  }
  return Object.freeze({ ok: duration(result) })
}
