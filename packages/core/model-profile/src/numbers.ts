import { isJsonNumber, jsonNumberSource, type JsonNumber } from '@omne-harness-lite/content-blocks'

interface Decimal {
  readonly sign: -1 | 0 | 1
  readonly digits: string
  readonly exponent: bigint
}

// Compare source digits without expanding an exponent into a potentially huge string.
function decimal(value: JsonNumber): Decimal {
  const source = jsonNumberSource(value)
  const [mantissa = '', exponent = '0'] = source.split(/[eE]/u)
  const fractionLength = mantissa.split('.')[1]?.length ?? 0
  const allDigits = mantissa.replace(/[-.]/gu, '').replace(/^0+/u, '')
  if (allDigits.length === 0) return { sign: 0, digits: '0', exponent: 0n }
  const digits = allDigits.replace(/0+$/u, '')
  return {
    sign: source.startsWith('-') ? -1 : 1,
    digits,
    exponent: BigInt(exponent) - BigInt(fractionLength) + BigInt(allDigits.length - digits.length),
  }
}

export function isJsonInteger(value: unknown): value is JsonNumber {
  if (!isJsonNumber(value)) return false
  const parsed = decimal(value)
  return parsed.sign === 0 || parsed.exponent >= 0n
}

export function compareNumbers(left: JsonNumber, right: JsonNumber): -1 | 0 | 1 {
  const a = decimal(left)
  const b = decimal(right)
  if (a.sign !== b.sign) return a.sign < b.sign ? -1 : 1
  if (a.sign === 0) return 0
  const aLength = BigInt(a.digits.length) + a.exponent
  const bLength = BigInt(b.digits.length) + b.exponent
  let comparison: -1 | 0 | 1
  if (aLength !== bLength) comparison = aLength < bLength ? -1 : 1
  else {
    const width = Math.max(a.digits.length, b.digits.length)
    const aDigits = a.digits.padEnd(width, '0')
    const bDigits = b.digits.padEnd(width, '0')
    comparison = aDigits === bDigits ? 0 : aDigits < bDigits ? -1 : 1
  }
  return a.sign === -1 ? (comparison === 0 ? 0 : comparison === -1 ? 1 : -1) : comparison
}

export function isPositiveInteger(value: unknown): value is JsonNumber {
  return isJsonInteger(value) && compareNumbers(value, 1) >= 0
}

export function inRange(
  value: unknown,
  minimum: number,
  maximum: number,
  openMinimum = false,
): boolean {
  return (
    isJsonNumber(value) &&
    compareNumbers(value, minimum) >= (openMinimum ? 1 : 0) &&
    compareNumbers(value, maximum) <= 0
  )
}
