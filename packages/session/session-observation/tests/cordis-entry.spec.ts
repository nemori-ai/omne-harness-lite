import { expect, it } from 'vitest'

it('exports the Service, its key and the plugin from ./cordis', async () => {
  const cordis = (await import('@omne-harness/session-observation/cordis')) as Record<
    string,
    unknown
  >
  expect(Object.keys(cordis).sort()).toEqual([
    'SessionObservationService',
    'createSessionObservationPlugin',
    'sessionObservationKey',
  ])
  expect(cordis['sessionObservationKey']).toBe('sessionObservation')
})
