import { expect, it } from 'vitest'

it('the public entry gives the conversion, the outcome mapping and the entry source', async () => {
  const root = (await import('@omne-harness/mcp-bridge')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'MCP_INVOKE_GATE',
    'MCP_SOURCE_PREFIX',
    'PEER_MARK',
    'PEER_TEXT_BEGIN',
    'PEER_TEXT_END',
    'commandOf',
    'commandText',
    'createMcpEntrySource',
    'endpointTool',
    'failureText',
    'mcpActionExecutor',
    'settle',
  ])
})
