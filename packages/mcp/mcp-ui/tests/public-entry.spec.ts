import { expect, it } from 'vitest'

it('the public entry exports the MCP page only', async () => {
  const root = (await import('@omne-harness/mcp-ui')) as Record<string, unknown>
  expect(Object.keys(root)).toEqual(['McpPage'])
})
