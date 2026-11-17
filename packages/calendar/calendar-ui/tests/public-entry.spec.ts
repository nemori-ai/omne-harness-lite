import { expect, it } from 'vitest'

it('the public entry exports the calendar page only', async () => {
  const root = (await import('@omne-harness/calendar-ui')) as Record<string, unknown>
  expect(Object.keys(root)).toEqual(['CalendarPage'])
})
