import { expect, it } from 'vitest'

it('the root entry gives the contribution and nothing else at run time', async () => {
  const root = (await import('@omne-harness/assets-access')) as Record<string, unknown>
  expect(Object.keys(root)).toEqual(['createAssetsContribution'])
})
