// A Streamable HTTP peer of the 2025 revisions with sessions: the SDK's
// `NodeStreamableHTTPServerTransport` with a session id generator, one `McpServer` per session,
// `DELETE` ending the session as the 2025 revisions say. The B layer for the legacy session (T3)
// and its end (T8 S07).
import { randomUUID } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { NodeStreamableHTTPServerTransport } from '@modelcontextprotocol/node'
import { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import { isConnectionTarget, type ConnectionTarget } from '@omne-harness/mcp-contract'
import { listenFree } from '../scripted/http.ts'

export type LegacyHttpServer = Readonly<{
  target: ConnectionTarget
  /** The sessions open now. */
  sessions(): readonly string[]
  close(): Promise<void>
}>

export async function legacyHttpServer(): Promise<LegacyHttpServer> {
  const transports = new Map<string, NodeStreamableHTTPServerTransport>()
  const server: Server = createServer(async (request, response) => {
    response.setHeader('connection', 'close')
    const session = request.headers['mcp-session-id']
    const known = typeof session === 'string' ? transports.get(session) : undefined
    if (known !== undefined) {
      await known.handleRequest(request, response)
      return
    }
    if (request.method === 'POST' && session === undefined) {
      const transport = new NodeStreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: id => {
          transports.set(id, transport)
        },
      })
      transport.onclose = () => {
        if (transport.sessionId !== undefined) transports.delete(transport.sessionId)
      }
      const peer = new McpServer(
        { name: 'legacy-http', version: '1' },
        { capabilities: { tools: {} } },
      )
      peer.registerTool(
        'echo',
        { description: 'Echoes the text', inputSchema: z.object({ text: z.string() }) },
        async ({ text }) => ({ content: [{ type: 'text', text }] }),
      )
      await peer.connect(transport)
      await transport.handleRequest(request, response)
      return
    }
    response.writeHead(404, { 'content-type': 'application/json' }).end(
      JSON.stringify({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32001, message: 'Session not found' },
      }),
    )
  })
  const port = await listenFree(server)
  const target = `http://127.0.0.1:${port}/mcp`
  if (!isConnectionTarget(target)) throw new Error(`not a connection target: ${target}`)
  return {
    target,
    sessions: () => [...transports.keys()],
    async close() {
      for (const transport of transports.values()) await transport.close()
      server.closeAllConnections()
      await new Promise<void>(resolve => server.close(() => resolve()))
    },
  }
}
