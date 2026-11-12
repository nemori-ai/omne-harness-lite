// A peer that speaks only the 2025 revisions: an SDK `McpServer` connected to a
// `StdioServerTransport` by hand. It answers `server/discover` with -32601 (method not found),
// so a transport must fall back to `initialize`.
import { McpServer } from '@modelcontextprotocol/server'
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio'
import { z } from 'zod'

const server = new McpServer(
  { name: 'legacy-stdio', version: '1' },
  { capabilities: { tools: {} } },
)
server.registerTool(
  'echo',
  { description: 'Echoes the text', inputSchema: z.object({ text: z.string() }) },
  async ({ text }) => ({ content: [{ type: 'text', text }] }),
)
await server.connect(new StdioServerTransport())
