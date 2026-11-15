import { parseInstant } from '@omne-harness/utc-instant'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { formatMoment } from '../src/view/moment.ts'

const Original = Intl.DateTimeFormat
let zone: string | undefined

beforeEach(() => {
  zone = process.env['TZ']
  process.env['TZ'] = 'UTC'
  vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(function (
    locales?: Intl.LocalesArgument,
    options?: Intl.DateTimeFormatOptions,
  ) {
    return new Original(locales ?? 'en-US', options)
  } as typeof Intl.DateTimeFormat)
})

afterEach(() => {
  vi.restoreAllMocks()
  if (zone === undefined) delete process.env['TZ']
  else process.env['TZ'] = zone
})

it('区域是 en-US 的环境里，时刻也是中文的写法，二十四小时制', () => {
  const at = parseInstant('2026-11-13T19:05:00Z')
  if (!at.ok) throw new Error('fixture instant')
  expect(new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().locale).toBe(
    'en-US',
  )
  expect(formatMoment(at.value)).toBe('2026年11月13日星期五 19:05')
})
