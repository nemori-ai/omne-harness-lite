import { expect, it } from 'vitest'

it('the root entry exports the media/v1 contract and how a reference is written as text', async () => {
  const root = (await import('@omne-harness/media-protocol')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual(['mediaProtocol', 'readReferenceText', 'referenceText'])
})
