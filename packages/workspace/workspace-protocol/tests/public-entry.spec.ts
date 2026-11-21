import { expect, it } from 'vitest'

it('the public entry exports the protocol', async () => {
  const root = (await import('@omne-harness/workspace-protocol')) as Record<string, unknown>
  expect(Object.keys(root)).toEqual(['workspaceProtocol'])
})
