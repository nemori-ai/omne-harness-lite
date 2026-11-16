import { expect, it } from 'vitest'

it('exports exactly the declared root runtime surface', async () => {
  const root = (await import('@omne-harness/session-observation')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'DEFAULT_LOCATE_PAGES',
    'DEFAULT_OBSERVATION_REFRESH_POLICY',
    'INTERVAL_FLOOR',
    'createSessionObservation',
  ])
})
