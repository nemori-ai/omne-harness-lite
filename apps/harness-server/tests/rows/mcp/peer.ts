import { randomUUID } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { NodeStreamableHTTPServerTransport, toNodeHandler } from '@modelcontextprotocol/node'
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'

export type PeerAction = Readonly<{
  name: string
  description: string
  /**
   * What the action answers; `hang` never answers, so the caller sees the connection break. `length`
   * declares an output schema and answers structured content: the length of the text.
   */
  answer: 'echo' | 'error' | 'hang' | 'length'
  /** What the action takes: a text by default, or a count. */
  input?: 'text' | 'count'
}>

export type PeerCall = Readonly<{ action: string; text: string }>

/** A peer given a bearer answers 401 to every request that does not carry it. */
export type PeerOptions = Readonly<{ bearer?: string }>

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
export async function testPeer(
  initial: readonly PeerAction[],
  options: PeerOptions = {},
): Promise<TestPeer> {
  let offered = initial
  const calls: PeerCall[] = []
  const transports = new Map<string, NodeStreamableHTTPServerTransport>()
  const sessions = new Set<Readonly<{ peer: McpServer; tools: Map<string, Registered> }>>()

  function register(peer: McpServer, action: PeerAction): Registered {
    const answered = async (text: string) => {
      calls.push({ action: action.name, text })
      if (action.answer === 'hang') await new Promise<never>(() => undefined)
      return action.answer === 'error'
        ? {
            isError: true,
            content: [{ type: 'text' as const, text: `${action.name} refused ${text}` }],
          }
        : { content: [{ type: 'text' as const, text: `${action.name} answered ${text}` }] }
    }
    const facts = { description: action.description }
    if (action.answer === 'length')
      return peer.registerTool(
        action.name,
        {
          ...facts,
          inputSchema: z.object({ text: z.string() }),
          outputSchema: z.object({ length: z.number() }),
        },
        async ({ text }) => {
          calls.push({ action: action.name, text })
          const structuredContent = { length: text.length }
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(structuredContent) }],
            structuredContent,
          }
        },
      )
    return action.input === 'count'
      ? peer.registerTool(
          action.name,
          { ...facts, inputSchema: z.object({ count: z.number() }) },
          async ({ count }) => answered(String(count)),
        )
      : peer.registerTool(
          action.name,
          { ...facts, inputSchema: z.object({ text: z.string() }) },
          async ({ text }) => answered(text),
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
    if (
      options.bearer !== undefined &&
      request.headers.authorization !== `Bearer ${options.bearer}`
    ) {
      response
        .writeHead(401, { 'content-type': 'application/json' })
        .end('{"error":"unauthorized"}')
      return
    }
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
      const offeredBefore = offered
      offered = actions
      for (const { peer, tools } of sessions) {
        for (const [name, tool] of tools)
          if (!actions.some(action => action.name === name)) {
            tool.remove()
            tools.delete(name)
          }
        for (const action of actions) {
          const tool = tools.get(action.name)
          const was = offeredBefore.find(before => before.name === action.name)
          if (tool !== undefined && (was?.input ?? 'text') !== (action.input ?? 'text')) {
            tool.remove()
            tools.set(action.name, register(peer, action))
          } else if (tool === undefined) tools.set(action.name, register(peer, action))
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

/** A 2026-07-28 peer that says when its tools change; it holds no session, each request builds the server anew. */
export type ModernPeer = Readonly<{
  target: string
  /** How often each method was asked. */
  asked: ReadonlyMap<string, number>
  /** Offers these actions from now on and tells every open listen. */
  offer(actions: readonly PeerAction[]): void
  close(): Promise<void>
}>

export async function modernPeer(initial: readonly PeerAction[]): Promise<ModernPeer> {
  let offered = initial
  const asked = new Map<string, number>()
  const handler = createMcpHandler(() => {
    const server = new McpServer(
      { name: 'modern-peer', version: '1' },
      { capabilities: { tools: { listChanged: true } } },
    )
    for (const action of offered)
      server.registerTool(
        action.name,
        { description: action.description, inputSchema: z.object({ text: z.string() }) },
        async ({ text }) => ({
          content: [{ type: 'text' as const, text: `${action.name} answered ${text}` }],
        }),
      )
    return server
  })
  const serve = toNodeHandler(handler)
  const server: Server = createServer((request, response) => {
    const chunks: Buffer[] = []
    request.on('data', chunk => chunks.push(chunk as Buffer))
    request.on('end', () => {
      const body = Buffer.concat(chunks)
      try {
        const method = (JSON.parse(body.toString('utf8')) as { method?: unknown }).method
        if (typeof method === 'string') asked.set(method, (asked.get(method) ?? 0) + 1)
      } catch {}
      void serve(
        {
          method: request.method ?? 'GET',
          url: request.url ?? '/',
          headers: request.headers,
          [Symbol.asyncIterator]: async function* () {
            yield body
          },
        },
        response,
      )
    })
  })
  const port = await listenFree(server)
  return {
    target: `http://127.0.0.1:${String(port)}/mcp`,
    asked,
    offer(actions) {
      offered = actions
      handler.notify.toolsChanged()
    },
    async close() {
      server.closeAllConnections()
      await new Promise<void>(resolve => server.close(() => resolve()))
    },
  }
}
