let textOf: (duration: Duration) => string

/** A signed length in SI seconds, kept as the exact digits it was written with. */
class Duration {
  readonly #negative: boolean
  readonly #seconds: string
  readonly #fraction: string

  constructor(negative: boolean, seconds: string, fraction: string) {
    this.#negative = negative
    this.#seconds = seconds
    this.#fraction = fraction
  }

  toJSON(): never {
    throw new TypeError('A Duration has no JSON form; write encodeDuration(duration) instead')
  }

  static {
    textOf = duration => {
      const fraction = duration.#fraction === '' ? '' : `.${duration.#fraction}`
      return `${duration.#negative ? '-' : ''}PT${duration.#seconds}${fraction}S`
    }
  }
}

export type { Duration }

export type DurationFailure = { readonly kind: 'syntax' | 'calendar-unit' }

export type DurationParse =
  | { readonly ok: true; readonly value: Duration }
  | { readonly ok: false; readonly failure: DurationFailure }

const SI_SECONDS = /^(-?)PT(\d+)(?:\.(\d+))?S$/u
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
  const match = SI_SECONDS.exec(text)
  if (match === null) {
    const calendarUnit = ISO_DURATION.test(text) && CALENDAR_OR_CLOCK_UNIT.test(text)
    return { ok: false, failure: { kind: calendarUnit ? 'calendar-unit' : 'syntax' } }
  }
  const [, sign, seconds = '', fraction = ''] = match
  return { ok: true, value: new Duration(sign === '-', seconds, fraction) }
}

/** Writes the text the duration was parsed from, digits unchanged. */
export function encodeDuration(duration: Duration): string {
  return textOf(duration)
}
