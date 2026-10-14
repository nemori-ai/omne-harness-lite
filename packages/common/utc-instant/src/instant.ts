let civilOf: (instant: Instant) => string
let fractionOf: (instant: Instant) => string

/** A UTC instant: calendar fields to the second plus the exact fraction digits it was written with. */
class Instant {
  readonly #civil: string
  readonly #fraction: string

  constructor(civil: string, fraction: string) {
    this.#civil = civil
    this.#fraction = fraction
  }

  toJSON(): never {
    throw new TypeError('An Instant has no JSON form; write encodeInstant(instant) instead')
  }

  static {
    civilOf = instant => instant.#civil
    fractionOf = instant => instant.#fraction
  }
}

export type { Instant }

export type InstantFailure = { readonly kind: 'syntax' | 'offset' | 'range' }

export type InstantParse =
  | { readonly ok: true; readonly value: Instant }
  | { readonly ok: false; readonly failure: InstantFailure }

const INSTANT_TEXT = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})$/u

/**
 * Reads `YYYY-MM-DDTHH:MM:SS[.digits]Z`. This is the only way to obtain an Instant.
 * A numeric offset fails as `offset`; impossible calendar fields fail as `range`.
 */
export function parseInstant(text: string): InstantParse {
  const match = INSTANT_TEXT.exec(text)
  if (match === null) return { ok: false, failure: { kind: 'syntax' } }
  const [, civil = '', fraction = '', zone] = match
  if (zone !== 'Z') return { ok: false, failure: { kind: 'offset' } }
  if (!inRange(civil)) return { ok: false, failure: { kind: 'range' } }
  return { ok: true, value: new Instant(civil, fraction) }
}

function inRange(civil: string): boolean {
  const year = civil.slice(0, 4)
  const month = civil.slice(5, 7)
  const day = civil.slice(8, 10)
  return (
    month >= '01' &&
    month <= '12' &&
    day >= '01' &&
    day <= lastDayOfMonth(year, month) &&
    civil.slice(11, 13) <= '23' &&
    civil.slice(14, 16) <= '59' &&
    civil.slice(17) <= '59'
  )
}

function lastDayOfMonth(year: string, month: string): string {
  if (month === '02') {
    const value = decimal(year)
    return value % 4 === 0 && (value % 100 !== 0 || value % 400 === 0) ? '29' : '28'
  }
  return month === '04' || month === '06' || month === '09' || month === '11' ? '30' : '31'
}

function decimal(digits: string): number {
  let value = 0
  for (const digit of digits) value = value * 10 + digit.charCodeAt(0) - 48
  return value
}

/** Writes the text the instant was parsed from, fraction digits unchanged. */
export function encodeInstant(instant: Instant): string {
  const fraction = fractionOf(instant)
  return `${civilOf(instant)}${fraction === '' ? '' : `.${fraction}`}Z`
}

/**
 * Orders two instants by calendar fields, then by fraction digits with the shorter fraction
 * read as padded with trailing zeros. `0.5` and `0.500` compare equal.
 */
export function compareInstants(a: Instant, b: Instant): -1 | 0 | 1 {
  const civilA = civilOf(a)
  const civilB = civilOf(b)
  if (civilA !== civilB) return civilA < civilB ? -1 : 1
  const fractionA = fractionOf(a)
  const fractionB = fractionOf(b)
  for (let index = 0; index < fractionA.length || index < fractionB.length; index++) {
    const digitA = fractionA[index] ?? '0'
    const digitB = fractionB[index] ?? '0'
    if (digitA !== digitB) return digitA < digitB ? -1 : 1
  }
  return 0
}
