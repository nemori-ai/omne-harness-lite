import { expect, it } from 'vitest'

it('the root entry exports the processor and its name', async () => {
  const root = (await import('@omne-harness/media-adapters')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual(['REFERENCES_PROCESSOR', 'createReferencesProcessor'])
})
