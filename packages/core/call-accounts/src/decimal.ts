import {
  LosslessNumber,
  jsonNumberSource,
  type JsonNumber,
} from '@omne-harness-lite/content-blocks'

/** Exact value of a JSON decimal literal; original input spelling survives serialization. */
export class ExactDecimal {
  readonly #coefficient: bigint
  readonly #exponent: bigint
  readonly #source: string

  private constructor(coefficient: bigint, exponent: bigint, source: string) {
    while (coefficient !== 0n && coefficient % 10n === 0n) {
      coefficient /= 10n
      exponent += 1n
    }
    this.#coefficient = coefficient
    this.#exponent = coefficient === 0n ? 0n : exponent
    this.#source = source
    Object.freeze(this)
  }

  static from(value: JsonNumber): ExactDecimal {
    const source = jsonNumberSource(value)
    const match = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(source)
    if (match === null) throw new TypeError('not a finite JSON number')
    const integer = match[2]
    if (integer === undefined) throw new Error('decimal grammar lost integer')
    const fraction = match[3] ?? ''
    const coefficient = BigInt(`${match[1] ?? ''}${integer}${fraction}`)
    const exponent = BigInt(match[4] ?? '0') - BigInt(fraction.length)
    return new ExactDecimal(coefficient, exponent, source)
  }

  add(other: ExactDecimal): ExactDecimal {
    if (this.#coefficient === 0n) return other
    if (other.#coefficient === 0n) return this
    const exponent = this.#exponent < other.#exponent ? this.#exponent : other.#exponent
    const coefficient =
      this.#coefficient * 10n ** (this.#exponent - exponent) +
      other.#coefficient * 10n ** (other.#exponent - exponent)
    return new ExactDecimal(coefficient, exponent, render(coefficient, exponent))
  }

  compare(other: ExactDecimal): -1 | 0 | 1 {
    if (this.#coefficient === other.#coefficient && this.#exponent === other.#exponent) return 0
    const leftSign = sign(this.#coefficient)
    const rightSign = sign(other.#coefficient)
    if (leftSign !== rightSign) return leftSign < rightSign ? -1 : 1
    const leftDigits = absolute(this.#coefficient).toString()
    const rightDigits = absolute(other.#coefficient).toString()
    const leftOrder = BigInt(leftDigits.length) + this.#exponent
    const rightOrder = BigInt(rightDigits.length) + other.#exponent
    if (leftOrder !== rightOrder) return leftOrder < rightOrder ? negate(leftSign) : leftSign
    const width = Math.max(leftDigits.length, rightDigits.length)
    const left = leftDigits.padEnd(width, '0')
    const right = rightDigits.padEnd(width, '0')
    return left === right ? 0 : left < right ? negate(leftSign) : leftSign
  }

  get isInteger(): boolean {
    return this.#coefficient === 0n || this.#exponent >= 0n
  }

  toString(): string {
    return this.#source
  }

  toJsonNumber(): LosslessNumber {
    return new LosslessNumber(this.#source)
  }
}

function absolute(value: bigint): bigint {
  return value < 0n ? -value : value
}
function sign(value: bigint): -1 | 0 | 1 {
  return value < 0n ? -1 : value > 0n ? 1 : 0
}
function negate(value: -1 | 0 | 1): -1 | 0 | 1 {
  return value === -1 ? 1 : value === 1 ? -1 : 0
}
function render(coefficient: bigint, exponent: bigint): string {
  if (coefficient === 0n) return '0'
  while (coefficient % 10n === 0n) {
    coefficient /= 10n
    exponent += 1n
  }
  // Scientific spelling avoids allocating huge runs of zeroes. It changes no significant digit.
  if (exponent >= 0n) return exponent === 0n ? `${coefficient}` : `${coefficient}e${exponent}`
  const digits = absolute(coefficient).toString()
  const point = BigInt(digits.length) + exponent
  if (point > 0n) {
    const divisor = 10n ** -exponent
    const magnitude = absolute(coefficient)
    const fraction = (magnitude % divisor).toString().padStart(divisor.toString().length - 1, '0')
    return `${coefficient < 0n ? '-' : ''}${magnitude / divisor}.${fraction}`
  }
  if (point === 0n) return `${coefficient < 0n ? '-' : ''}0.${digits}`
  return `${coefficient}e${exponent}`
}
