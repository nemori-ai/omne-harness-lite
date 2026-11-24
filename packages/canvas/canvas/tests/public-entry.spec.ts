import { expect, it } from 'vitest'

it('the root entry gives the canvas, the reads and the scripts every store runs', async () => {
  const root = (await import('@omne-harness/canvas')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'arrangeBatch',
    'arrangementOf',
    'awayOf',
    'createCanvas',
    'lockItems',
    'pileItems',
    'placeReference',
    'placingOf',
    'scatterPile',
    'takeItems',
  ])
})

it('the testing entry gives the memory store, the fakes and the conformance cases', async () => {
  const testing = (await import('@omne-harness/canvas/testing')) as Record<string, unknown>
  expect(Object.keys(testing).sort()).toEqual([
    'PROPERTY_CONFIG',
    'context',
    'createMemoryStore',
    'fakeAuthority',
    'fakeClock',
    'fakeKinds',
    'fakeMovers',
    'runCanvasProperties',
    'storeConformanceCases',
    'tenantOf',
  ])
})
