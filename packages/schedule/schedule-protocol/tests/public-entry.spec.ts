import { expect, it } from 'vitest'

it('exports the schedule/v1 protocol contract', async () => {
  const root = (await import('@omne-harness/schedule-protocol')) as Record<string, unknown>
  expect(Object.keys(root)).toEqual(['scheduleProtocol'])
})
