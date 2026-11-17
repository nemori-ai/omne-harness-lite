import { expect, it } from 'vitest'
import {
  CalendarQueryService,
  calendarQueryKey,
} from '@omne-harness/calendar-cordis-contract/cordis'
it('publishes the query service key from its owning definition', () => {
  expect(CalendarQueryService.provide).toBe('calendarQuery')
  expect(calendarQueryKey).toBe(CalendarQueryService.provide)
})

it('publishes the calculator service key from its owning definition', async () => {
  const { CalendarCalculatorService, calendarCalculatorKey } =
    await import('@omne-harness/calendar-cordis-contract/cordis')
  expect(CalendarCalculatorService.provide).toBe('calendarCalculator')
  expect(calendarCalculatorKey).toBe(CalendarCalculatorService.provide)
})
