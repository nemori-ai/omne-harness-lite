import { leapSecondsList } from './leap-seconds.generated.ts'
import { readLeapSecondsList, type LeapSecondsListFailure } from './leap-seconds.ts'

let civilOf: (instant: Instant) => string
let fractionOf: (instant: Instant) => string
let inserts: (table: LeapSecondData, day: string) => boolean
let deletes: (table: LeapSecondData, day: string) => boolean

// Only this module holds the token, so `new value.constructor(...)` from outside cannot mint.
const MINT = Symbol('utc-instant mint')

/** A UTC instant: calendar fields to the second plus the exact fraction digits it was written with. */
class Instant {
  readonly #civil: string
  readonly #fraction: string

  constructor(mint: symbol, civil: string, fraction: string) {
    if (mint !== MINT) throw new TypeError('Only parseInstant can make an Instant')
    this.#civil = civil
    this.#fraction = fraction
  }

  toJSON(): never {
    throw new TypeError('An Instant has no JSON form; write encodeInstant(instant) instead')
  }

  toString(): never {
    throw new TypeError('An Instant has no string form; write encodeInstant(instant) instead')
  }

  static {
    civilOf = instant => instant.#civil
    fractionOf = instant => instant.#fraction
  }
}

/** A read leap-second table: where it came from, its version and expiry, and the days it lists. */
class LeapSecondData {
  readonly #source: string
  readonly #version: Instant
  readonly #expires: Instant
  readonly #insertions: ReadonlySet<string>
  readonly #deletions: ReadonlySet<string>

  constructor(
    mint: symbol,
    source: string,
    version: Instant,
    expires: Instant,
    insertions: readonly string[],
    deletions: readonly string[],
  ) {
    if (mint !== MINT) throw new TypeError('Only readLeapSecondData can make a LeapSecondData')
    this.#source = source
    this.#version = version
    this.#expires = expires
    this.#insertions = new Set(insertions)
    this.#deletions = new Set(deletions)
  }

  get source(): string {
    return this.#source
  }

  get version(): Instant {
    return this.#version
  }

  get expires(): Instant {
    return this.#expires
  }

  toJSON(): never {
    throw new TypeError('LeapSecondData has no JSON form; keep the leap-seconds.list text instead')
  }

  toString(): never {
    throw new TypeError('LeapSecondData has no string form; keep the leap-seconds.list text instead')
  }

  static {
    inserts = (table, day) => table.#insertions.has(day)
    deletes = (table, day) => table.#deletions.has(day)
  }
}

export type { Instant, LeapSecondData }

export type LeapSecondDataRead =
  | { readonly ok: true; readonly value: LeapSecondData }
  | { readonly ok: false; readonly failure: LeapSecondsListFailure }

/**
 * Reads the text of an IERS `leap-seconds.list`, or the IANA copy of it. `source` names where the
 * text came from. A malformed line or a missing `#$` or `#@` line fails as `syntax`; rows out of
 * order, off midnight, or changing TAI-UTC by anything but one second fail as `step`.
 */
export function readLeapSecondData(text: string, source: string): LeapSecondDataRead {
  const list = readLeapSecondsList(text)
  if (!list.ok) return list
  const { version, expires, insertions, deletions } = list.value
  return {
    ok: true,
    value: new LeapSecondData(
      MINT,
      source,
      new Instant(MINT, version, ''),
      new Instant(MINT, expires, ''),
      insertions,
      deletions,
    ),
  }
}

const bundled = readLeapSecondData(
  leapSecondsList,
  'https://hpiers.obspm.fr/iers/bul/bulc/ntp/leap-seconds.list',
)
if (!bundled.ok) throw new Error(`The bundled leap-seconds.list failed as ${bundled.failure.kind}`)

/**
 * The IERS leap-seconds.list bundled with this package, downloaded from
 * https://hpiers.obspm.fr/iers/bul/bulc/ntp/leap-seconds.list (byte-identical to the IANA copy).
 * Read `version` and `expires` from the value; `resources/leap-seconds.list` is the file itself.
 */
export const leapSecondData: LeapSecondData = bundled.value

export type InstantFailure =
  | { readonly kind: 'syntax' | 'offset' | 'range' | 'leap-data-expired' }
  | { readonly kind: 'leap-second'; readonly detail: 'not-inserted' | 'deleted' }

export type InstantParse =
  | { readonly ok: true; readonly value: Instant }
  | { readonly ok: false; readonly failure: InstantFailure }

const INSTANT_TEXT = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})$/u

/**
 * Reads `YYYY-MM-DDTHH:MM:SS[.digits]Z`. This is the only way to obtain an Instant.
 * A numeric offset fails as `offset`; impossible calendar fields fail as `range`.
 *
 * Second 60 exists only on a day `table` lists as an insertion, even after the table expires.
 * An unlisted second 60 fails as `leap-second` before the table expiry and as
 * `leap-data-expired` from the expiry on, because the table cannot know about later insertions.
 * Second 59 on a day `table` lists as a deletion fails as `leap-second`.
 */
export function parseInstant(text: string, table: LeapSecondData = leapSecondData): InstantParse {
  const match = INSTANT_TEXT.exec(text)
  if (match === null) return { ok: false, failure: { kind: 'syntax' } }
  const [, civil = '', fraction = '', zone] = match
  if (zone !== 'Z') return { ok: false, failure: { kind: 'offset' } }
  if (!inRange(civil)) return { ok: false, failure: { kind: 'range' } }
  const value = new Instant(MINT, civil, fraction)
  const day = civil.slice(0, 10)
  const time = civil.slice(11)
  if (time === '23:59:59' && deletes(table, day))
    return { ok: false, failure: { kind: 'leap-second', detail: 'deleted' } }
  if (time === '23:59:60' && !inserts(table, day))
    return compareInstants(value, table.expires) < 0
      ? { ok: false, failure: { kind: 'leap-second', detail: 'not-inserted' } }
      : { ok: false, failure: { kind: 'leap-data-expired' } }
  return { ok: true, value }
}

function inRange(civil: string): boolean {
  const year = civil.slice(0, 4)
  const month = civil.slice(5, 7)
  const day = civil.slice(8, 10)
  const time = civil.slice(11)
  return (
    month >= '01' &&
    month <= '12' &&
    day >= '01' &&
    day <= lastDayOfMonth(year, month) &&
    time.slice(0, 2) <= '23' &&
    time.slice(3, 5) <= '59' &&
    (time.slice(6) <= '59' || time === '23:59:60')
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
