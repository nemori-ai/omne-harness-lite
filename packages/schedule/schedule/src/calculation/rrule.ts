// oxlint-disable-next-line import/default -- rrule 2.8.1 is CommonJS; Node ESM exposes its exports through the default binding.
import rrule from 'rrule'
import type { Options } from 'rrule'
import type { ScheduleCivil } from '@omne-harness/schedule-contract'
import { fakeUtc } from './civil.ts'

const { RRule } = rrule
const integerRanges: Record<string, readonly [number, number, boolean]> = {
  INTERVAL: [1, Number.MAX_SAFE_INTEGER, false],
  BYMONTH: [1, 12, false],
  BYWEEKNO: [-53, 53, true],
  BYYEARDAY: [-366, 366, true],
  BYMONTHDAY: [-31, 31, true],
  BYHOUR: [0, 23, false],
  BYMINUTE: [0, 59, false],
  BYSECOND: [0, 59, false],
  BYSETPOS: [-366, 366, true],
  BYEASTER: [-Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, false],
}
export type ParsedRrule = { options: Partial<Options>; easter: number[] | null }
export function parseRrule(text: string, begin: ScheduleCivil): ParsedRrule {
  const normalized = text.toUpperCase().replace(/^RRULE:/, '')
  const fields = new Map(
    normalized.split(';').map(part => {
      const [key = '', value = ''] = part.split('=')
      return [key, value]
    }),
  )
  if (!/^(YEARLY|MONTHLY|WEEKLY|DAILY|HOURLY|MINUTELY|SECONDLY)$/.test(fields.get('FREQ') ?? ''))
    throw new Error('Expected a recurrence frequency')
  for (const [key, value] of fields) {
    if (key === 'FREQ') continue
    if (key === 'WKST' && /^(MO|TU|WE|TH|FR|SA|SU)$/.test(value)) continue
    if (
      key === 'BYDAY' &&
      value
        .split(',')
        .every(
          day =>
            /^(?:[+-]?[1-9]\d*)?(MO|TU|WE|TH|FR|SA|SU)$/.test(day) &&
            Math.abs(Number(day.slice(0, -2) || 1)) <= 53,
        )
    )
      continue
    const range = integerRanges[key]
    if (!range || (key === 'INTERVAL' && value.includes(',')))
      throw new Error(`Invalid RRULE parameter ${key}`)
    if (
      !value
        .split(',')
        .every(
          item =>
            /^[+-]?\d+$/.test(item) &&
            Number.isSafeInteger(Number(item)) &&
            Number(item) >= range[0] &&
            Number(item) <= range[1] &&
            (!range[2] || Number(item) !== 0),
        )
    )
      throw new Error(`Invalid RRULE value ${key}`)
  }
  const easterText = fields.get('BYEASTER')
  const easter = easterText === undefined ? null : [...new Set(easterText.split(',').map(Number))]
  const canonical = [...fields]
    .map(
      ([key, value]) =>
        `${key}=${integerRanges[key] ? [...new Set(value.split(',').map(Number))].sort((a, b) => a - b).join(',') : value}`,
    )
    .join(';')
  const options = RRule.parseString(canonical.replace(/BYEASTER=[^;]+/, 'BYEASTER=0'))
  options.dtstart = fakeUtc(begin)
  options.wkst ??= RRule.MO
  if (easter !== null) options.freq = RRule.YEARLY
  new RRule(options, true)
  return { options, easter }
}

export function rruleBetween(
  options: Partial<Options>,
  from: Date,
  through: Date,
  collect: (date: Date) => boolean,
): void {
  new RRule({ ...options, until: through }, true).between(from, through, true, collect)
}
