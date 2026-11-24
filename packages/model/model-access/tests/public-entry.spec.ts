import { expect, it } from 'vitest'

it('the root entry exports the contribution factory and nothing else at run time', async () => {
  const root = (await import('@omne-harness/model-access')) as Record<string, unknown>
  expect(Object.keys(root)).toEqual(['createModelAccessContribution'])
})
