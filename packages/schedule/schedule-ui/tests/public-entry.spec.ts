import { expect, it } from 'vitest'

it('the public entry exports the schedule page only', async () => {
  const root = (await import('@omne-harness/schedule-ui')) as Record<string, unknown>
  expect(Object.keys(root)).toEqual(['SchedulePage'])
})
