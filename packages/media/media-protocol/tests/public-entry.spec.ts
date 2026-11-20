import { expect, it } from 'vitest'

it('the root entry exports only the media/v1 contract', async () => {
  const root = (await import('@omne-harness/media-protocol')) as Record<string, unknown>
  expect(Object.keys(root)).toEqual(['mediaProtocol'])
})
