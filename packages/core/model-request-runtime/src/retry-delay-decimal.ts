import {
  LosslessNumber,
  jsonNumberSource,
  type JsonNumber,
} from '@omne-harness-lite/content-blocks'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import type { Duration } from '@omne-harness-lite/tool-definition'

/** Private arithmetic projection of accepted values, not another shared number type. */
export interface Decimal {
  readonly coefficient: bigint
  readonly exponent: bigint
}

export const zero: Decimal = { coefficient: 0n, exponent: 0n }
export const one: Decimal = { coefficient: 1n, exponent: 0n }
export const half: Decimal = { coefficient: 5n, exponent: -1n }

function decimal(coefficient: bigint, exponent: bigint): Decimal {
  if (coefficient === 0n) return zero
  const digits = coefficient.toString()
  const trimmed = digits.replace(/0+$/u, '')
  return {
    coefficient: BigInt(trimmed),
    exponent: exponent + BigInt(digits.length - trimmed.length),
  }
}

export function number(value: JsonNumber): Decimal {
  const match = /^(-?\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/u.exec(jsonNumberSource(value))
  const integer = match?.[1]
  if (integer === undefined) throw new Error('accepted JSON number lost its grammar')
  const fraction = match?.[2] ?? ''
  return decimal(
    BigInt(`${integer}${fraction}`),
    BigInt(match?.[3] ?? '0') - BigInt(fraction.length),
  )
}

function exact(value: Decimal): ExactDecimal {
  return ExactDecimal.from(new LosslessNumber(`${value.coefficient}e${value.exponent}`))
}

export function compare(left: Decimal, right: Decimal): -1 | 0 | 1 {
  return exact(left).compare(exact(right))
}

export function add(left: Decimal, right: Decimal): Decimal {
  return number(exact(left).add(exact(right)).toJsonNumber())
}

export function subtract(left: Decimal, right: Decimal): Decimal {
  return add(left, { coefficient: -right.coefficient, exponent: right.exponent })
}

export function multiply(left: Decimal, right: Decimal): Decimal {
  return decimal(left.coefficient * right.coefficient, left.exponent + right.exponent)
}

export function minimum(left: Decimal, right: Decimal): Decimal {
  return compare(left, right) <= 0 ? left : right
}

/** Operands here are nonnegative. Orders can prove clipping before a large product. */
export function clippedProduct(left: Decimal, right: Decimal, cap: Decimal): Decimal {
  if (left.coefficient === 0n || right.coefficient === 0n) return zero
  if (cap.coefficient === 0n) return cap
  const minimumProductOrder =
    BigInt(left.coefficient.toString().length + right.coefficient.toString().length - 1) +
    left.exponent +
    right.exponent
  const capOrder = BigInt(cap.coefficient.toString().length) + cap.exponent
  if (minimumProductOrder > capOrder) return cap
  return minimum(multiply(left, right), cap)
}

/** n is an accepted positive integer, kept compressed even for e.g. 1e1000000. */
export function clippedExponential(
  base: Decimal,
  factor: Decimal,
  n: Decimal,
  cap: Decimal,
): Decimal {
  let result = minimum(base, cap)
  if (result.coefficient === 0n || compare(result, cap) === 0 || compare(factor, one) === 0)
    return result
  let successor = n
  let power = factor
  // The remaining exponent is successor - 1. Keeping its successor avoids
  // expanding an enormous decimal integer just to subtract one from it.
  while (compare(successor, one) > 0) {
    const candidate = clippedProduct(result, power, cap)
    // Remaining exponent >= 1 and factor >= 1, even when its low bit is zero.
    if (compare(candidate, cap) === 0) return cap
    const even = successor.exponent > 0n || successor.coefficient % 2n === 0n
    if (even) result = candidate
    successor =
      successor.exponent > 0n
        ? decimal(successor.coefficient * 5n, successor.exponent - 1n)
        : decimal((successor.coefficient + 1n) / 2n, 0n)
    if (compare(successor, one) > 0) {
      // Prove clipping with the next squared power before constructing it.
      const next = clippedProduct(clippedProduct(result, power, cap), power, cap)
      if (compare(next, cap) === 0) return cap
      power = multiply(power, power)
    }
  }
  return result
}

/** Called only after the authoritative TD3 Duration validator accepted the string. */
export function seconds(value: Duration): Decimal {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)(?:\.(\d+))?S)?$/u.exec(value)
  if (match === null) throw new Error('accepted Duration lost its grammar')
  const hours = BigInt(match[1] ?? '0') * 3600n
  const minutes = BigInt(match[2] ?? '0') * 60n
  const fraction = match[4] ?? ''
  return add(
    decimal(hours + minutes, 0n),
    decimal(BigInt(`${match[3] ?? '0'}${fraction}`), -BigInt(fraction.length)),
  )
}

function zeroes(count: bigint): string {
  let result = ''
  let block = '0'
  while (count > 0n) {
    if (count % 2n === 1n) result += block
    count /= 2n
    if (count > 0n) block += block
  }
  return result
}

/** Exact plain seconds spelling; TD3 has no exponential seconds syntax. */
export function duration(value: Decimal): Duration {
  const digits = value.coefficient.toString()
  if (value.exponent >= 0n) return `PT${digits}${zeroes(value.exponent)}S`
  const point = BigInt(digits.length) + value.exponent
  if (point <= 0n) return `PT0.${zeroes(-point)}${digits}S`
  // This is a string index bounded by an already allocated string's length,
  // not a conversion of a duration or a retry count to floating point.
  const index = Number(point)
  return `PT${digits.slice(0, index)}.${digits.slice(index)}S`
}
