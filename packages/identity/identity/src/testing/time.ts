// Deadline arithmetic of the reference double: an instant plus a signed SI-second duration, exact
// to every fraction digit. It counts each UTC day as 86400 seconds and ignores leap seconds, so a
// lifetime that spans an inserted second ends one second early; SPEC ID-17 lists that limit.
import {
  encodeDuration,
  encodeInstant,
  parseInstant,
  type Duration,
  type Instant,
} from '@omne-harness/utc-instant'

const INSTANT_TEXT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?Z$/u
const DURATION_TEXT = /^(-?)PT(\d+)(?:\.(\d+))?S$/u

/** A count of `10^-scale` seconds since 1970-01-01T00:00:00Z. */
type Scaled = Readonly<{ units: bigint; scale: number }>

// Days from the civil date (proleptic Gregorian), after Howard Hinnant's `days_from_civil`.
function daysFromCivil(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year
  const era = Math.floor(y / 400)
  const yearOfEra = y - era * 400
  const dayOfYear = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1
  const dayOfEra =
    yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear
  return era * 146097 + dayOfEra - 719468
}

function civilFromDays(days: number): readonly [number, number, number] {
  const shifted = days + 719468
  const era = Math.floor(shifted / 146097)
  const dayOfEra = shifted - era * 146097
  const yearOfEra = Math.floor(
    (dayOfEra -
      Math.floor(dayOfEra / 1460) +
      Math.floor(dayOfEra / 36524) -
      Math.floor(dayOfEra / 146096)) /
      365,
  )
  const dayOfYear =
    dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100))
  const monthIndex = Math.floor((5 * dayOfYear + 2) / 153)
  const day = dayOfYear - Math.floor((153 * monthIndex + 2) / 5) + 1
  const month = monthIndex < 10 ? monthIndex + 3 : monthIndex - 9
  return [month <= 2 ? yearOfEra + era * 400 + 1 : yearOfEra + era * 400, month, day]
}

function digits(text: string | undefined): string {
  return text ?? ''
}

function scaleTo(value: Scaled, scale: number): bigint {
  return value.units * 10n ** BigInt(scale - value.scale)
}

function scaledInstant(instant: Instant): Scaled {
  const match = INSTANT_TEXT.exec(encodeInstant(instant))
  if (match === null) throw new TypeError('an encoded instant did not match its own grammar')
  const [, year, month, day, hour, minute, second, fraction] = match
  const days = daysFromCivil(Number(year), Number(month), Number(day))
  const seconds =
    BigInt(days) * 86400n + BigInt(Number(hour) * 3600 + Number(minute) * 60 + Number(second))
  const scale = digits(fraction).length
  return { units: seconds * 10n ** BigInt(scale) + BigInt(digits(fraction) || '0'), scale }
}

function scaledDuration(duration: Duration): Scaled {
  const match = DURATION_TEXT.exec(encodeDuration(duration))
  if (match === null) throw new TypeError('an encoded duration did not match its own grammar')
  const [, sign, whole, fraction] = match
  const scale = digits(fraction).length
  const units = BigInt(digits(whole)) * 10n ** BigInt(scale) + BigInt(digits(fraction) || '0')
  return { units: sign === '-' ? -units : units, scale }
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0')
}

function instantOf(value: Scaled): Instant | undefined {
  const unit = 10n ** BigInt(value.scale)
  const floorSeconds = value.units >= 0n ? value.units / unit : -((-value.units + unit - 1n) / unit)
  const fraction = value.units - floorSeconds * unit
  const days = Number(
    floorSeconds >= 0n ? floorSeconds / 86400n : -((-floorSeconds + 86399n) / 86400n),
  )
  const secondOfDay = Number(floorSeconds - BigInt(days) * 86400n)
  const [year, month, day] = civilFromDays(days)
  if (year < 0 || year > 9999) return undefined
  const civil = `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}T${pad(Math.floor(secondOfDay / 3600), 2)}:${pad(Math.floor((secondOfDay % 3600) / 60), 2)}:${pad(secondOfDay % 60, 2)}`
  const fractionText = value.scale === 0 ? '' : `.${fraction.toString().padStart(value.scale, '0')}`
  const parsed = parseInstant(`${civil}${fractionText}Z`)
  return parsed.ok ? parsed.value : undefined
}

/** `instant` plus `duration`, or `undefined` when the sum falls outside years 0000 to 9999. */
export function addDuration(instant: Instant, duration: Duration): Instant | undefined {
  const left = scaledInstant(instant)
  const right = scaledDuration(duration)
  const scale = Math.max(left.scale, right.scale)
  return instantOf({ units: scaleTo(left, scale) + scaleTo(right, scale), scale })
}

/** True when the duration is longer than zero seconds. */
export function isPositive(duration: Duration): boolean {
  return scaledDuration(duration).units > 0n
}

/**
 * An instant a little earlier than `instant`: one unit three fraction digits finer than the text
 * it was written with. The contract suite uses it to look just before a deadline.
 */
export function justBefore(instant: Instant): Instant | undefined {
  const value = scaledInstant(instant)
  const scale = value.scale + 3
  return instantOf({ units: scaleTo(value, scale) - 1n, scale })
}
