import { expect, it } from 'vitest'

it('exports the contribution of schedule/v1', async () => {
  const root = (await import('@omne-harness/schedule-access')) as Record<string, unknown>
  expect(Object.keys(root)).toEqual(['createScheduleContribution'])
})
