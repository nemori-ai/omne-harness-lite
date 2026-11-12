import { expect, it } from 'vitest'
import { calendarToolArgumentsSchema, createCalendarToolModule } from '@omne-harness/calendar-tools'

it('rejects model supplied identity and requires explicit selection and version', () => {
  expect(calendarToolArgumentsSchema.safeParse({ action: 'list', input: {} }).success).toBe(true)
  for (const key of ['actor', 'tenant', 'authContext', 'supply']) {
    expect(
      calendarToolArgumentsSchema.safeParse({ action: 'list', input: {}, [key]: 'forged' }).success,
    ).toBe(false)
    expect(
      calendarToolArgumentsSchema.safeParse({ action: 'list', input: { [key]: 'forged' } }).success,
    ).toBe(false)
  }
  expect(
    calendarToolArgumentsSchema.safeParse({
      action: 'resolve',
      input: { query: { kind: 'day', date: '2026-01-01' } },
    }).success,
  ).toBe(false)
  expect(createCalendarToolModule).toBeTypeOf('function')
})
