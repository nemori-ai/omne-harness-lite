import { expect, it } from 'vitest'

it('the root entry exports the contribution factory only', async () => {
  const root = (await import('@omne-harness/media-access')) as Record<string, unknown>
  expect(Object.keys(root)).toEqual(['createMediaContribution'])
})
