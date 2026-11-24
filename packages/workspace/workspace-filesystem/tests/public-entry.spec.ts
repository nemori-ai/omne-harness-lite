import { expect, it } from 'vitest'

it('the public entry exports the directory type, its basis and the source files', async () => {
  const root = (await import('@omne-harness/workspace-filesystem')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual(['DirectoryType', 'UNPINNED', 'localSourceFiles'])
})
