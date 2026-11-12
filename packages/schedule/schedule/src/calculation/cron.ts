import { CronExpressionParser } from 'cron-parser'
import type { CronExpression } from 'cron-parser'
import { Temporal } from '@js-temporal/polyfill'

const domains: readonly (readonly [number, number])[] = [
  [0, 59],
  [0, 23],
  [1, 31],
  [1, 12],
  [0, 6],
]
const months = 'JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC'.split(' ')
const weekdays = 'SUN MON TUE WED THU FRI SAT'.split(' ')
export type CronBranch = { expression: string; nearest: number | null }
export type ParsedCron = { branches: CronBranch[] }

function fieldValues(text: string, field: number): number[] {
  const domain = domains[field]
  if (!domain) throw new Error('Unknown cron field')
  const [lo, hi] = domain
  const aliases = field === 3 ? months : field === 4 ? weekdays : []
  const replaced = text.replace(/[A-Z]+/g, name => {
    const index = aliases.indexOf(name)
    if (index < 0) throw new Error('Unknown cron name')
    return String(index + (field === 3 ? 1 : 0))
  })
  const values = new Set<number>()
  for (const item of replaced.split(',')) {
    const match = /^(\*|\d+)(?:-(\d+))?(?:\/(\d+))?$/.exec(item)
    if (!match) throw new Error('Invalid cron field')
    const [, first = '', last, stepText] = match
    const step = Number(stepText ?? 1)
    if (!Number.isSafeInteger(step) || step < 1) throw new Error('Invalid cron step')
    const number = (value: string) => {
      const n = Number(value)
      if (n < lo || n > (field === 4 ? 7 : hi)) throw new Error('Cron field is out of range')
      return field === 4 && n === 7 ? 0 : n
    }
    const start = first === '*' ? lo : number(first)
    const end =
      last === undefined ? (first === '*' || stepText !== undefined ? hi : start) : number(last)
    if (first === '*' && last !== undefined) throw new Error('Invalid wildcard range')
    if (last !== undefined && start >= end) {
      if (start === end) {
        for (let n = lo; n <= hi; n += step) values.add(n)
      } else {
        let lastValue = start
        for (let n = start; n <= hi; n += step) {
          values.add(n)
          lastValue = n
        }
        const skip = lastValue + step > hi + 1 ? step - (hi - lastValue) : 0
        for (let n = lo + skip; n <= end; n += step) values.add(n)
      }
    } else for (let n = start; n <= end; n += step) values.add(n)
  }
  return [...values].sort((a, b) => a - b)
}
function normalizedField(text: string, field: number): string {
  if (text === '?' && (field === 2 || field === 4)) return '*'
  if (text === '*') return '*'
  return fieldValues(text, field).join(',')
}
function dayOfWeekVariants(text: string): string[] {
  if (!text.includes('#') && !text.includes('L')) return [normalizedField(text, 4)]
  return [
    ...new Set(
      text.split(',').flatMap(part => {
        const last = /^L([0-7])$/.exec(part)
        if (last) return [`${Number(last[1]) % 7}L`]
        const nth = /^(.+)#([1-5])$/.exec(part)
        if (!nth || nth[1] === '*') throw new Error('Invalid ordinal weekday')
        return fieldValues(nth[1] ?? '', 4).map(day => `${day}#${nth[2]}`)
      }),
    ),
  ]
}
export function parseCron(expression: string): ParsedCron {
  const fields = expression.toUpperCase().trim().split(/\s+/)
  const [minute, hour, dom, month, dow] = fields
  if (fields.length !== 5 || !minute || !hour || !dom || !month || !dow)
    throw new Error('Expected five cron fields')
  const prefix = `${normalizedField(minute, 0)} ${normalizedField(hour, 1)}`
  const monthText = normalizedField(month, 3)
  const dowVariants = dayOfWeekVariants(dow)
  const nearestMatch = /^(?:(\d+)W|W(\d+))$/.exec(dom)
  const nearest = nearestMatch ? Number(nearestMatch[1] ?? nearestMatch[2]) : null
  if (nearest !== null && (!Number.isInteger(nearest) || nearest < 1 || nearest > 31))
    throw new Error('Invalid nearest weekday')
  const domText =
    nearest !== null
      ? '*'
      : dom
          .split(',')
          .map(part => (part === 'L' ? 'L' : normalizedField(part, 2)))
          .join(',')
  const domRestricted = nearest !== null || domText !== '*'
  const dowRestricted = dowVariants.length !== 1 || dowVariants[0] !== '*'
  const branches: CronBranch[] = []
  if (domRestricted || !dowRestricted) {
    if (domText === '*' || monthText === '*')
      branches.push({ expression: `${prefix} ${domText} ${monthText} *`, nearest })
    else {
      const monthValues = fieldValues(monthText, 3)
      for (const selectedMonth of monthValues) {
        const maximum = Temporal.PlainDate.from({
          year: 2000,
          month: selectedMonth,
          day: 1,
        }).daysInMonth
        const days = domText
          .split(',')
          .filter(day => day === 'L' || Number(day) <= maximum)
          .join(',')
        if (days) branches.push({ expression: `${prefix} ${days} ${selectedMonth} *`, nearest })
      }
    }
  }
  if (dowRestricted)
    for (const day of dowVariants)
      branches.push({ expression: `${prefix} * ${monthText} ${day}`, nearest: null })
  for (const branch of branches)
    CronExpressionParser.parse(branch.expression, {
      currentDate: new Date('2000-01-01T00:00:00Z'),
      tz: 'UTC',
    })
  return { branches }
}
export function nearestWeekday(date: Date, target: number): boolean {
  const plain = Temporal.PlainDate.from(date.toISOString().slice(0, 10))
  const day = Math.min(target, plain.daysInMonth)
  const weekday = plain.with({ day }).dayOfWeek
  const nearest =
    weekday < 6
      ? day
      : weekday === 6
        ? day === 1
          ? day + 2
          : day - 1
        : day === plain.daysInMonth
          ? day - 2
          : day + 1
  return plain.day === nearest
}
export function cronIterator(branch: CronBranch, start: Date, end: Date): CronExpression {
  return CronExpressionParser.parse(branch.expression, {
    currentDate: start,
    endDate: end,
    tz: 'UTC',
  })
}
