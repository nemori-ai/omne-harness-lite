import { expect, it } from 'vitest'

it('exports the independent calculation worker factory', async () => {
  const root = (await import('@omne-harness/schedule-local')) as Record<string, unknown>
  expect(typeof root['createScheduleCalculationWorker']).toBe('function')
})
