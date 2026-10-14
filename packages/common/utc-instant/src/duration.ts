let textOf: (duration: Duration) => string

// Only this module holds the token, so `new value.constructor(...)` from outside cannot mint.
const MINT = Symbol('utc-instant mint')

/** A signed length in SI seconds, kept as the exact text it was accepted from. */
class Duration {
  readonly #text: string

  constructor(mint: symbol, text: string) {
    if (mint !== MINT) throw new TypeError('Only parseDuration can make a Duration')
    this.#text = text
  }

  toJSON(): never {
    throw new TypeError('A Duration has no JSON form; write encodeDuration(duration) instead')
  }

  toString(): never {
    throw new TypeError('A Duration has no string form; write encodeDuration(duration) instead')
  }

  static {
    textOf = duration => duration.#text
  }
}

export type { Duration }

export type DurationFailure = { readonly kind: 'syntax' | 'calendar-unit' }

export type DurationParse =
  | { readonly ok: true; readonly value: Duration }
  | { readonly ok: false; readonly failure: DurationFailure }

const SI_SECONDS = /^-?PT\d+(?:\.\d+)?S$/u
const ISO_DURATION = /^-?P(?=.)(?:\d+(?:\.\d+)?[YMWD])*(?:T(?:\d+(?:\.\d+)?[HMS])+)?$/u
const CALENDAR_OR_CLOCK_UNIT = /[YMWDH]/u

/**
 * Reads `PT<digits>[.<digits>]S` or the same with a leading `-`. This is the only way to obtain
 * a Duration. Any other ISO 8601 designator (years, months, weeks, days, hours, minutes) fails
 * as `calendar-unit`, because those lengths belong to calendars and schedules, not SI seconds.
 * An ISO duration made of seconds alone that is still not SI-second text, such as `PT5S5S`,
 * fails as `syntax`.
 */
export function parseDuration(text: string): DurationParse {
  if (SI_SECONDS.test(text)) return { ok: true, value: new Duration(MINT, text) }
  const calendarUnit = ISO_DURATION.test(text) && CALENDAR_OR_CLOCK_UNIT.test(text)
  return { ok: false, failure: { kind: calendarUnit ? 'calendar-unit' : 'syntax' } }
}

/** Writes the text the duration was parsed from, digits unchanged. */
export function encodeDuration(duration: Duration): string {
  return textOf(duration)
}
