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
