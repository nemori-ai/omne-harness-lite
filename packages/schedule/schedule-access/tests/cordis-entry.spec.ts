import { expect, it } from 'vitest'

it('exports the access plugin factory', async () => {
  const cordis = (await import('@omne-harness/schedule-access/cordis')) as Record<string, unknown>
  expect(Object.keys(cordis)).toEqual(['createScheduleAccessPlugin'])
})
