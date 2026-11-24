import { expect, it } from 'vitest'

it('the root entry exports the family table, the network resources factory, the transport factory, the engine endpoint guard and the record fact names as its only runtime values', async () => {
  const root: object = await import('@omne-harness/pi-ai-transport')
  expect(Object.keys(root).toSorted()).toEqual([
    'RECORD_FACTS',
    'composeFamilies',
    'createNetworkResources',
    'createPiTransport',
    'defineFamily',
    'isEngineEndpoint',
    'isProviderEndpoint',
    'recordAdoption',
    'recordProvider',
    'replayFormatsOf',
  ])
})

it('the chat-completions entry exposes the shared binding, metering, reasoning and OpenRouter accounting APIs', async () => {
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
    'reasoningTextCodec',
    'unitExtras',
    'usageWithCacheWrites',
  ])
})

it('the subpath entry testing exports the fixture check and the adoption fingerprint helpers', async () => {
  const testing: object = await import('@omne-harness/pi-ai-transport/testing')
  expect(Object.keys(testing).toSorted()).toEqual([
    'FIXTURE_FILES',
    'GATEWAY_END_MARKER',
    'appendAdoptionFingerprints',
    'checkAdoptionFingerprints',
    'checkRecordFixtures',
    'fixtureDirectory',
    'renderFingerprints',
    'replayStream',
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
