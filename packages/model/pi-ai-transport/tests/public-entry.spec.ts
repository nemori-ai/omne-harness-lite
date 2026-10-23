import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

const groupArchitecture = new URL('../../docs/architecture.md', import.meta.url)
const familySource = new URL('../src/family.ts', import.meta.url)

/** Drops comments and every layout difference that the formatter may introduce. */
function shapeTokens(source: string): string {
  return source
    .replace(/\/\/[^\n]*/g, '')
    .replace(/[\s,;]/g, '')
    .replaceAll('=|', '=')
}

function acceptedCodeBlock(markdown: string): string {
  const section = markdown.split('## pi 家族贡献的取得协议')[1]
  const block = section?.match(/```ts\n([\s\S]*?)```/)?.[1]
  if (block === undefined) throw new Error('the accepted pi family code block is missing')
  return block
}

it('the root entry exports the family table, the network resources factory and the transport factory as its only runtime values', async () => {
  const root: object = await import('@omne-harness/pi-ai-transport')
  expect(Object.keys(root).toSorted()).toEqual([
    'composeFamilies',
    'createNetworkResources',
    'createPiTransport',
    'defineFamily',
    'recordAdoption',
    'replayFormatsOf',
  ])
})

it('the subpath entry chat-completions exports the binding entry, the shared calibrated arithmetic and the shared measurement rules as its runtime values', async () => {
  const engine: object = await import('@omne-harness/pi-ai-transport/chat-completions')
  expect(Object.keys(engine).toSorted()).toEqual([
    'ANCHORED_METHOD',
    'NO_CALIBRATION',
    'bindChatCompletions',
    'calibratedAmount',
    'calibratedDigest',
    'calibratedMethod',
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

it('the family types keep the shape of the accepted group architecture code block', () => {
  const accepted = acceptedCodeBlock(readFileSync(groupArchitecture, 'utf8'))
  expect(shapeTokens(readFileSync(familySource, 'utf8'))).toBe(shapeTokens(accepted))
})
