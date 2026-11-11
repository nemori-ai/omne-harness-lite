import { expect, it } from 'vitest'

it('the root entry exports the factory, the default scheduling policy, the telemetry facade and its two event definitions, and nothing else at runtime', async () => {
  const root = (await import('@omne-harness/session')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'createSessionInstance',
    'createSessionTelemetry',
    'defaultSchedulingPolicy',
    'sessionDiagnosticEvent',
    'sessionRoundCompleteEvent',
  ])
  expect(typeof root.createSessionInstance).toBe('function')
  expect(typeof root.createSessionTelemetry).toBe('function')
})
