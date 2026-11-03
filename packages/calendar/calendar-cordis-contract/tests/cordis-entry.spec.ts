import { expect, it } from 'vitest'
import {
  CalendarQueryService,
  calendarQueryKey,
} from '@omne-harness/calendar-cordis-contract/cordis'
it('publishes the query service key from its owning definition', () => {
  expect(CalendarQueryService.provide).toBe('calendarQuery')
  expect(calendarQueryKey).toBe(CalendarQueryService.provide)
})
