import { expect, it } from 'vitest'

it('the root entry gives the reads of the canvas and the script of a look', async () => {
  const root = (await import('@omne-harness/canvas')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual(['arrangementOf', 'createCanvas'])
})

it('the testing entry gives the memory store, the fakes and the conformance cases', async () => {
  const testing = (await import('@omne-harness/canvas/testing')) as Record<string, unknown>
  expect(Object.keys(testing).sort()).toEqual([
    'context',
    'createMemoryStore',
    'fakeAuthority',
    'fakeKinds',
    'fakeMovers',
    'storeConformanceCases',
    'tenantOf',
  ])
})
