import { expect, it } from 'vitest'

it('exports the contribution of calendar/v1', async () => {
  const root = (await import('@omne-harness/calendar-access')) as Record<string, unknown>
  expect(Object.keys(root)).toEqual(['createCalendarContribution'])
})
