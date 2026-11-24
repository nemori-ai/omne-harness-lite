import { expect, it } from 'vitest'

it('the root entry exports nothing at run time: the service definitions are on the cordis entry', async () => {
  const root = (await import('@omne-harness/loop-extension-cordis-contract')) as Record<
    string,
    unknown
  >
  expect(Object.keys(root)).toEqual([])
})
