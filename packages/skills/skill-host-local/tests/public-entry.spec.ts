import { expect, it } from 'vitest'

it('the root entry exports createDirectorySource and nothing else at run time', async () => {
  const root: Record<string, unknown> = await import('@omne-harness/skill-host-local')
  expect(Object.keys(root).sort()).toEqual(['createDirectorySource'])
})
