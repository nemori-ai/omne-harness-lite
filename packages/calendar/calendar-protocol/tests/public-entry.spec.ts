import { expect, it } from 'vitest'

it('exports the calendar/v1 protocol contract', async () => {
  const root = (await import('@omne-harness/calendar-protocol')) as Record<string, unknown>
  expect(Object.keys(root)).toEqual(['calendarProtocol'])
})
