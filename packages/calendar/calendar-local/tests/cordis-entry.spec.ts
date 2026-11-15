import { expect, it } from 'vitest'
import {
  CalendarQueryService,
  CalendarSupplyService,
} from '@omne-harness/calendar-cordis-contract/cordis'

it('exports local providers inheriting the unique calendar service definitions', async () => {
  const cordis = await import('@omne-harness/calendar-local/cordis')
  expect(Object.keys(cordis).sort()).toEqual([
    'CalendarLocalQueryProvider',
    'CalendarLocalSupplyProvider',
  ])
  expect(Object.getPrototypeOf(cordis.CalendarLocalQueryProvider)).toBe(CalendarQueryService)
  expect(Object.getPrototypeOf(cordis.CalendarLocalSupplyProvider)).toBe(CalendarSupplyService)
})
