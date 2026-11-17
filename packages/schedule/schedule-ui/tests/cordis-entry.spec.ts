import { expect, it } from 'vitest'

it('the cordis entry gives the module and its page placement only; the module waits for the schedule client', async () => {
  const cordis = (await import('@omne-harness/schedule-ui/cordis')) as Record<string, unknown>
  expect(Object.keys(cordis).sort()).toEqual([
    'SCHEDULE_PAGE_ID',
    'SCHEDULE_PAGE_ORDER',
    'scheduleUiModule',
  ])
  expect(cordis['scheduleUiModule']).toMatchObject({
    name: 'schedule-ui',
    inject: ['shell', 'protocol:schedule/v1'],
  })
})
