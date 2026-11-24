import { expect, it } from 'vitest'

it('the root entry exports only the mcp/v1 contract', async () => {
  const root = (await import('@omne-harness/mcp-protocol')) as Record<string, unknown>
  expect(Object.keys(root)).toEqual(['mcpProtocol'])
})
