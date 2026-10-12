import { type Parsed, invalidInput, ok } from '@omne-harness-lite/identity-values'

interface Rfc3339OrderParts {
  readonly text: string
  readonly utcMinute: number
  readonly second: number
  readonly fractionStart: number
  readonly fractionEnd: number
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31
}

function invalidCalendar(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
): boolean {
  return (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth(year, month) ||
    hour > 23 ||
    minute > 59 ||
    second > 60
  )
}

function readOffsetStart(value: string): number | undefined {
  let offsetStart = 19
  if (value.charAt(offsetStart) === '.') {
    offsetStart++
    const firstDigit = offsetStart
    while (offsetStart < value.length) {
      const digit = value.charCodeAt(offsetStart)
      if (digit < 48 || digit > 57) break
      offsetStart++
    }
    if (offsetStart === firstDigit) return undefined
  }
  return offsetStart
}

function readOffsetMinutes(offset: string): number | undefined {
  let signedOffsetMinutes = 0
  if (offset !== 'Z' && offset !== 'z') {
    // Length check closes the final-newline exception of a regex '$' anchor.
    if (offset.length !== 6 || !/^[+-][0-9]{2}:[0-9]{2}$/.test(offset)) return undefined
    const offsetHour = Number(offset.slice(1, 3))
    const offsetMinute = Number(offset.slice(4, 6))
    if (offsetHour > 23 || offsetMinute > 59) return undefined
    signedOffsetMinutes = (offsetHour * 60 + offsetMinute) * (offset.charAt(0) === '+' ? 1 : -1)
  }

  return signedOffsetMinutes
}

function ordinalDay(year: number, month: number, day: number): number {
  let dayOrdinal =
    365 * year +
    Math.floor((year + 3) / 4) -
    Math.floor((year + 99) / 100) +
    Math.floor((year + 399) / 400) +
    day -
    1
  for (let precedingMonth = 1; precedingMonth < month; precedingMonth++)
    dayOrdinal += daysInMonth(year, precedingMonth)
  return dayOrdinal
}

function validLeapPosition(
  utcMinute: number,
  dayOrdinal: number,
  year: number,
  month: number,
  day: number,
): boolean {
  const utcDay = Math.floor(utcMinute / 1440)
  if (utcMinute - utcDay * 1440 !== 1439) return false
  const dayShift = utcDay - dayOrdinal
  // Offsets cross at most one day. The day before a local first day is
  // always the previous month's last day, including internal UTC year -1.
  return (dayShift === -1 && day === 1) || day + dayShift === daysInMonth(year, month)
}

function readParts(value: unknown): Rfc3339OrderParts | undefined {
  if (
    typeof value !== 'string' ||
    !/^[0-9]{4}-[0-9]{2}-[0-9]{2}[Tt][0-9]{2}:[0-9]{2}:[0-9]{2}/.test(value)
  )
    return undefined

  const year = Number(value.slice(0, 4))
  const month = Number(value.slice(5, 7))
  const day = Number(value.slice(8, 10))
  const hour = Number(value.slice(11, 13))
  const minute = Number(value.slice(14, 16))
  const second = Number(value.slice(17, 19))
  if (invalidCalendar(year, month, day, hour, minute, second)) return undefined
  const offsetStart = readOffsetStart(value)
  if (offsetStart === undefined) return undefined
  const fractionStart = value.charAt(19) === '.' ? 20 : 19
  const fractionEnd = offsetStart
  const signedOffsetMinutes = readOffsetMinutes(value.slice(offsetStart))
  if (signedOffsetMinutes === undefined) return undefined
  const dayOrdinal = ordinalDay(year, month, day)
  const utcMinute = dayOrdinal * 1440 + hour * 60 + minute - signedOffsetMinutes
  if (second === 60 && !validLeapPosition(utcMinute, dayOrdinal, year, month, day)) return undefined
  return { text: value, utcMinute, second, fractionStart, fractionEnd }
}

function order(left: number, right: number): -1 | 0 | 1 {
  return left < right ? -1 : left > right ? 1 : 0
}

/**
 * Exact ordering conditional on both inputs being legal RFC 3339 instants.
 * Checks static representation/calendar/offset rules; ok does not authenticate
 * actual positive or negative leap-second announcements. Inputs are not rewritten.
 */
export function compareRfc3339Instants(left: unknown, right: unknown): Parsed<-1 | 0 | 1> {
  const a = readParts(left)
  const b = readParts(right)
  if (a === undefined || b === undefined)
    return invalidInput('invalid RFC 3339 instant representation')
  const minuteOrder = order(a.utcMinute, b.utcMinute)
  if (minuteOrder !== 0) return ok(minuteOrder)
  const secondOrder = order(a.second, b.second)
  if (secondOrder !== 0) return ok(secondOrder)
  const length = Math.max(a.fractionEnd - a.fractionStart, b.fractionEnd - b.fractionStart)
  for (let index = 0; index < length; index++) {
    const leftDigit =
      a.fractionStart + index < a.fractionEnd ? a.text.charCodeAt(a.fractionStart + index) : 48
    const rightDigit =
      b.fractionStart + index < b.fractionEnd ? b.text.charCodeAt(b.fractionStart + index) : 48
    const digitOrder = order(leftDigit, rightDigit)
    if (digitOrder !== 0) return ok(digitOrder)
  }
  return ok(0)
}
