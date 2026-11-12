// A modern stdio peer: the SDK's `serveStdio` with a factory that registers `echo`, `slow` (waits
// for its argument in milliseconds; a cancel target) and `crash` (exits the process while the
// call is in flight).
import { McpServer } from '@modelcontextprotocol/server'
import { serveStdio } from '@modelcontextprotocol/server/stdio'
import { z } from 'zod'

serveStdio(() => {
  const server = new McpServer(
    { name: 'modern-stdio', version: '1' },
    { capabilities: { tools: {} } },
  )
  server.registerTool(
    'echo',
    { description: 'Echoes the text', inputSchema: z.object({ text: z.string() }) },
    async ({ text }) => ({ content: [{ type: 'text', text }] }),
  )
  server.registerTool(
    'slow',
    { description: 'Answers after a while', inputSchema: z.object({ ms: z.number() }) },
    async ({ ms }) => {
      await new Promise(resolve => setTimeout(resolve, ms))
      return { content: [{ type: 'text', text: 'late' }] }
    },
  )
  server.registerTool('crash', { description: 'Exits the process' }, async () => {
    process.exit(7)
  })
  return server
})
