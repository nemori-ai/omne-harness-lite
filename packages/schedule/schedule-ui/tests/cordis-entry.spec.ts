import { expect, it } from 'vitest'

it('the cordis entry gives the module factory and its placements only', async () => {
  const cordis = (await import('@omne-harness/schedule-ui/cordis')) as Record<string, unknown>
  expect(Object.keys(cordis).sort()).toEqual([
    'SCHEDULE_PAGE_ID',
    'SCHEDULE_PAGE_ORDER',
    'createScheduleUiModule',
    'scheduleJobTarget',
    'scheduleParts',
  ])
  const create = cordis['createScheduleUiModule'] as () => unknown
  expect(create()).toMatchObject({ name: 'schedule-ui' })
})
