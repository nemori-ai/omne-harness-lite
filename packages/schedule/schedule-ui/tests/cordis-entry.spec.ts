import { expect, it } from 'vitest'

it('the cordis entry gives the module factory and its placements only; the module waits for the schedule client', async () => {
  const cordis = (await import('@omne-harness/schedule-ui/cordis')) as Record<string, unknown>
  expect(Object.keys(cordis).sort()).toEqual([
    'ACTIVATION_DETAIL_ID',
    'SCHEDULE_PAGE_ID',
    'SCHEDULE_PAGE_ORDER',
    'createScheduleUiModule',
  ])
  const create = cordis['createScheduleUiModule'] as () => unknown
  expect(create()).toMatchObject({
    name: 'schedule-ui',
    inject: ['shell', 'protocol:schedule/v2'],
  })
})
