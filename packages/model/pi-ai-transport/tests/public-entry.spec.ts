import { expect, it } from 'vitest'

it('the root entry exports the family table, the network resources factory and the transport factory as its only runtime values', async () => {
  const root: object = await import('@omne-harness/pi-ai-transport')
  expect(Object.keys(root).toSorted()).toEqual([
    'composeFamilies',
    'createNetworkResources',
    'createPiTransport',
    'defineFamily',
    'recordAdoption',
    'recordProvider',
    'replayFormatsOf',
  ])
})

it('the subpath entry chat-completions exports the binding entry, the shared calibrated arithmetic, the shared meter, the shared measurement rules and the OpenRouter provider body and accounting as its runtime values', async () => {
  const engine: object = await import('@omne-harness/pi-ai-transport/chat-completions')
  expect(Object.keys(engine).toSorted()).toEqual([
    'ANCHORED_METHOD',
    'NO_CALIBRATION',
    'OPENROUTER_ACCOUNTING',
    'OPENROUTER_PROVIDER_BODY_TEXT',
    'bindChatCompletions',
    'calibratedAmount',
    'calibratedDigest',
    'calibratedMethod',
    'createCalibratedMeter',
    'unitExtras',
  ])
})

it('the subpath entry testing exports the fixture check and the adoption fingerprint helpers', async () => {
  const testing: object = await import('@omne-harness/pi-ai-transport/testing')
  expect(Object.keys(testing).toSorted()).toEqual([
    'FIXTURE_FILES',
    'GATEWAY_END_MARKER',
    'appendAdoptionFingerprints',
    'checkAdoptionFingerprints',
    'checkChatCompletionsFixtures',
    'fixtureDirectory',
    'renderFingerprints',
  ])
})

it('the engine internals are not reachable through the package exports', async () => {
  const internal = '@omne-harness/pi-ai-transport/chat-completions/request'
  await expect(import(internal)).rejects.toThrow()
})

it('the network resources handle shows only its close at run time', async () => {
  const { createNetworkResources } = await import('@omne-harness/pi-ai-transport')
  const network = createNetworkResources({ maxConnections: 1, idleConnectionTimeoutMs: 1_000 })
  try {
    expect(Object.keys(network)).toEqual(['close'])
    expect(Object.isFrozen(network)).toBe(true)
  } finally {
    await network.close()
  }
})
