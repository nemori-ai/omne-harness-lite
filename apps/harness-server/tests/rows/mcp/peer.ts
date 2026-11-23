import { randomUUID } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { NodeStreamableHTTPServerTransport } from '@modelcontextprotocol/node'
import { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'

export type PeerAction = Readonly<{
  name: string
  description: string
  /** What the action answers; `hang` never answers, so the caller sees the connection break. */
  answer: 'echo' | 'error' | 'hang'
}>

export type PeerCall = Readonly<{ action: string; text: string }>

export type TestPeer = Readonly<{
  target: string
  calls: readonly PeerCall[]
  /** The actions the peer offers from now on, on the sessions it has and on new ones. */
  offer(actions: readonly PeerAction[]): void
  /** Cuts every open connection without answering. */
  drop(): void
  close(): Promise<void>
}>

type Registered = ReturnType<McpServer['registerTool']>

// `fetch` refuses the WHATWG "bad ports", so the port is taken above them; one in use is tried again.
async function listenFree(server: Server): Promise<number> {
  for (;;) {
    const port = 20_000 + Math.floor(Math.random() * 40_000)
    const listening = await new Promise<boolean>(resolve => {
      const onError = () => resolve(false)
      server.once('error', onError)
      server.listen(port, '127.0.0.1', () => {
        server.off('error', onError)
        resolve(true)
      })
    })
    if (listening) return port
  }
}

/** A real MCP peer on this machine: its actions can be changed, and it counts what it was asked. */
export async function testPeer(initial: readonly PeerAction[]): Promise<TestPeer> {
  let offered = initial
  const calls: PeerCall[] = []
  const transports = new Map<string, NodeStreamableHTTPServerTransport>()
  const sessions = new Set<Readonly<{ peer: McpServer; tools: Map<string, Registered> }>>()

  function register(peer: McpServer, action: PeerAction): Registered {
    return peer.registerTool(
      action.name,
      { description: action.description, inputSchema: z.object({ text: z.string() }) },
      async ({ text }) => {
        calls.push({ action: action.name, text })
        if (action.answer === 'hang') await new Promise<never>(() => undefined)
        return action.answer === 'error'
          ? { isError: true, content: [{ type: 'text', text: `${action.name} refused ${text}` }] }
          : { content: [{ type: 'text', text: `${action.name} answered ${text}` }] }
      },
    )
  }

  function sessionOf(): McpServer {
    const peer = new McpServer({ name: 'test-peer', version: '1' }, { capabilities: { tools: {} } })
    const tools = new Map(offered.map(action => [action.name, register(peer, action)]))
    sessions.add({ peer, tools })
    return peer
  }

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
      await sessionOf().connect(transport)
      await transport.handleRequest(request, response)
      return
    }
    response.writeHead(404, { 'content-type': 'application/json' }).end(
      JSON.stringify({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32001, message: 'no session' },
      }),
    )
  })
  const port = await listenFree(server)
  return {
    target: `http://127.0.0.1:${String(port)}/mcp`,
    calls,
    offer(actions) {
      offered = actions
      for (const { peer, tools } of sessions) {
        for (const [name, tool] of tools)
          if (!actions.some(action => action.name === name)) {
            tool.remove()
            tools.delete(name)
          }
        for (const action of actions) {
          const tool = tools.get(action.name)
          if (tool === undefined) tools.set(action.name, register(peer, action))
          else tool.update({ description: action.description })
        }
      }
    },
    drop() {
      server.closeAllConnections()
    },
    async close() {
      server.closeAllConnections()
      await new Promise<void>(resolve => server.close(() => resolve()))
    },
  }
}
