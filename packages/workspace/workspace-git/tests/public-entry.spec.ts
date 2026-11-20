import { expect, it } from 'vitest'

it('the public entry exports the Git type and the one function that reads a working copy', async () => {
  const root = (await import('@omne-harness/workspace-git')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual(['GitType', 'readWorkingCopy'])
})
