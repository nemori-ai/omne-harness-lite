import { expect, it } from 'vitest'

it('exports the registry, the scripts, the identities and the helpers of the ports on the root', async () => {
  const root = (await import('@omne-harness/dispatch')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'acceptDispatch',
    'applyEvent',
    'ask',
    'confirmStop',
    'createDispatching',
    'dispatchIdOf',
    'isUnfinished',
    'messageInputOf',
    'recordDelivery',
    'reportInputOf',
  ])
})

it('exports the fakes, the memory store and the conformance cases on the testing entry', async () => {
  const testing = (await import('@omne-harness/dispatch/testing')) as Record<string, unknown>
  expect(Object.keys(testing).sort()).toEqual([
    'acceptedDispatch',
    'createMemoryDispatchStore',
    'fakeAuthority',
    'fakeClock',
    'fakeCopies',
    'fakeDefinitions',
    'fakeSessions',
    'fakeWaits',
    'matches',
    'memoryTxn',
    'sessionNamed',
    'storeConformanceCases',
    'tenantOf',
  ])
})
