import { expect, it } from 'vitest'

it('exports the local plugin factory', async () => {
  const cordis = (await import('@omne-harness/schedule-local/cordis')) as Record<string, unknown>
  expect(Object.keys(cordis)).toEqual(['createScheduleLocalPlugin'])
})
