import { expect, it } from 'vitest'

it('the root entry exports the loader, the putting of members and the following of the source', async () => {
  const root = (await import('@omne-harness/plugin-ui')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'createLoader',
    'followWanted',
    'installOn',
    'listedOf',
  ])
})
