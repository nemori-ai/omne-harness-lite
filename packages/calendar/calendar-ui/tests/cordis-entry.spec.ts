import { expect, it } from 'vitest'

it('the cordis entry gives the module, its page placement and its parts only', async () => {
  const cordis = (await import('@omne-harness/calendar-ui/cordis')) as Record<string, unknown>
  expect(Object.keys(cordis).sort()).toEqual([
    'CALENDAR_PAGE_ID',
    'CALENDAR_PAGE_ORDER',
    'calendarParts',
    'calendarUiModule',
  ])
  expect(cordis['calendarUiModule']).toMatchObject({ name: 'calendar-ui' })
})
