import { randomUUID } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { NodeStreamableHTTPServerTransport, toNodeHandler } from '@modelcontextprotocol/node'
import {
  acceptedContent,
  createMcpHandler,
  inputRequired,
  McpServer,
  ProtocolError,
  ProtocolErrorCode,
} from '@modelcontextprotocol/server'
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

export type BearerVerdict = 'ok' | 'unauthorized' | 'insufficient-scope'

/** A peer given a bearer answers 401 to every request that does not carry it; given an OAuth check it publishes its resource metadata and asks the check. */
export type PeerOptions = Readonly<{
  bearer?: string
  oauth?: Readonly<{
    authorizationServer: string
    check: (authorization: string | undefined) => BearerVerdict
  }>
}>

export type TestPeer = Readonly<{
  target: string
  calls: readonly PeerCall[]
  /** Each request it was sent under an OAuth check, with its authorization header, in order. */
  authorizations: readonly Readonly<{ request: string; header: string | null }>[]
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

  const authorizations: { request: string; header: string | null }[] = []
  let target = ''
  const server: Server = createServer(async (request, response) => {
    response.setHeader('connection', 'close')
    if (options.oauth !== undefined && (await oauthAnswered(request, response))) return
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
  async function oauthAnswered(request: IncomingMessage, response: ServerResponse) {
    const oauth = options.oauth
    if (oauth === undefined) return false
    const metadata = `${new URL(target).origin}/.well-known/oauth-protected-resource/mcp`
    if (request.url === new URL(metadata).pathname) {
      response.writeHead(200, { 'content-type': 'application/json' }).end(
        JSON.stringify({
          resource: target,
          authorization_servers: [oauth.authorizationServer],
          scopes_supported: ['read'],
        }),
      )
      return true
    }
    authorizations.push({
      request: `${request.method ?? ''} ${request.url ?? ''}`,
      header: request.headers.authorization ?? null,
    })
    const verdict = oauth.check(request.headers.authorization)
    if (verdict === 'ok') return false
    const challenge =
      verdict === 'unauthorized'
        ? `Bearer resource_metadata="${metadata}"`
        : 'Bearer error="insufficient_scope", scope="write"'
    response
      .writeHead(verdict === 'unauthorized' ? 401 : 403, { 'www-authenticate': challenge })
      .end()
    return true
  }

  const port = await listenFree(server)
  target = `http://127.0.0.1:${String(port)}/mcp`
  return {
    target,
    calls,
    authorizations,
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
  /** The answers of a person that came back to `book`, in order. */
  answers: readonly unknown[]
  /** Offers these actions from now on and tells every open listen. */
  offer(actions: readonly PeerAction[]): void
  /** The tasks `report` made, and what moves them on. */
  tasks: PeerTasks
  /** The events the peer gives to polls and streams, and what it does with the streams open. */
  log: PeerEventLog
  close(): Promise<void>
}>

export type PeerEventLog = Readonly<{
  /** Something happened: every open stream of its kind hears it, and polls find it. */
  emit(name: string, data: Readonly<Record<string, unknown>>): string
  /** Sends every event of the kind again from the start, whatever position is asked, as a peer that replays may. */
  replay(on: boolean): void
  /** The identifiers of the events the streams sent, in order. */
  sent(): readonly string[]
  /** Ends every open stream with this error code. */
  terminate(code: number): void
  /** How many streams are open now. */
  open(): number
}>

export type PeerTask = {
  readonly taskId: string
  readonly topic: string
  status: 'working' | 'input_required' | 'completed' | 'cancelled'
  readonly updates: unknown[]
}

export type PeerTasks = Readonly<{
  list(): readonly PeerTask[]
  finish(): void
  ask(): void
}>

const WHEN = z.object({ date: z.string() })
const TASKS_EXTENSION = 'io.modelcontextprotocol/tasks'
const FORMAT_ASK = {
  format: {
    method: 'elicitation/create',
    params: {
      mode: 'form',
      message: 'Which format should the report have?',
      requestedSchema: {
        type: 'object',
        properties: { format: { type: 'string' } },
        required: ['format'],
      },
    },
  },
}

function describeTask(task: PeerTask) {
  const update = task.updates.at(-1) as { format?: { content?: { format?: string } } } | undefined
  const format = update?.format?.content?.format
  return {
    taskId: task.taskId,
    status: task.status,
    createdAt: '2026-11-27T12:00:00.000Z',
    lastUpdatedAt: '2026-11-27T12:00:00.000Z',
    ttlMs: 3_600_000,
    pollIntervalMs: 50,
    ...(task.status === 'input_required' ? { inputRequests: FORMAT_ASK } : {}),
    ...(task.status === 'completed'
      ? {
          result: {
            content: [
              {
                type: 'text',
                text: `report on ${task.topic}${format === undefined ? '' : ` as ${format}`}`,
              },
            ],
          },
        }
      : {}),
  }
}

function serveTasks(server: McpServer, tasks: Map<string, PeerTask>): void {
  const find = (taskId: string) => {
    const task = tasks.get(taskId)
    if (task === undefined) throw new ProtocolError(ProtocolErrorCode.InvalidParams, 'Unknown task')
    return task
  }
  server.registerTool(
    'report',
    { description: 'Builds a report as a task.', inputSchema: z.object({ text: z.string() }) },
    async ({ text }, ctx) => {
      const envelope = (ctx.mcpReq.envelope as Record<string, unknown> | undefined)?.[
        'io.modelcontextprotocol/clientCapabilities'
      ] as { extensions?: Record<string, unknown> } | undefined
      if (envelope?.extensions?.[TASKS_EXTENSION] === undefined)
        return { content: [{ type: 'text' as const, text: `report on ${text} at once` }] }
      const task: PeerTask = { taskId: randomUUID(), topic: text, status: 'working', updates: [] }
      tasks.set(task.taskId, task)
      return { content: [], resultType: 'task', ...describeTask(task) } as never
    },
  )
  const id = z.looseObject({ taskId: z.string() })
  server.server.setRequestHandler(
    'tasks/get',
    { params: id, result: z.looseObject({}) },
    async ({ taskId }) => describeTask(find(taskId)),
  )
  server.server.setRequestHandler(
    'tasks/update',
    { params: id, result: z.object({}) },
    async (params, ctx) => {
      const task = find(params.taskId)
      task.updates.push(ctx.mcpReq.inputResponses)
      task.status = 'working'
      return {}
    },
  )
  server.server.setRequestHandler(
    'tasks/cancel',
    { params: id, result: z.object({}) },
    async ({ taskId }) => {
      const task = find(taskId)
      if (task.status === 'working' || task.status === 'input_required') task.status = 'cancelled'
      return {}
    },
  )
}

/** A kind of event the modern peer offers, as `events/list` writes it. */
export type PeerEventType = Readonly<{
  name: string
  description: string
  delivery: readonly string[]
  inputSchema: Readonly<Record<string, unknown>>
  payloadSchema: Readonly<Record<string, unknown>>
}>

const EVENTS_EXTENSION = 'io.modelcontextprotocol/events'

type Happened = Readonly<{
  eventId: string
  name: string
  timestamp: string
  data: Readonly<Record<string, unknown>>
  cursor: string
}>

type EventBook = {
  readonly happened: Happened[]
  readonly streams: Set<(event: Happened | Readonly<{ terminated: number }>) => void>
  readonly sent: string[]
  replay: boolean
}

const EVENT_PARAMS = z
  .object({ name: z.string(), cursor: z.string().nullable().optional() })
  .passthrough()

// A position is the count of events before it; a replaying peer starts from the first.
function after(book: EventBook, name: string, cursor: string | null | undefined): Happened[] {
  const from = book.replay ? 0 : Number(cursor ?? book.happened.length)
  return book.happened.slice(from).filter(event => event.name === name)
}

function serveEvents(server: McpServer, book: EventBook): void {
  server.server.setRequestHandler(
    'events/poll',
    { params: EVENT_PARAMS, result: z.object({}).passthrough() },
    async ({ name, cursor }) => ({
      events: after(book, name, cursor),
      cursor: String(book.happened.length),
      truncated: false,
      hasMore: false,
      nextPollMs: 100,
    }),
  )
  server.server.setRequestHandler(
    'events/stream',
    { params: EVENT_PARAMS, result: z.object({}).passthrough() },
    async ({ name, cursor }, ctx) => {
      const { notify, signal, id } = ctx.mcpReq
      // Every message of a stream names the request it belongs to, as the extension says it must.
      const meta = { 'io.modelcontextprotocol/subscriptionId': id }
      const send = (method: string, params: Record<string, unknown>) =>
        notify({ method, params: { ...params, _meta: meta } } as never).catch(() => undefined)
      await send('notifications/events/active', {
        cursor: String(book.happened.length),
        truncated: false,
        heartbeatMs: 1000,
      })
      for (const event of after(book, name, cursor)) {
        book.sent.push(event.eventId)
        await send('notifications/events/event', event)
      }
      await new Promise<void>(resolve => {
        const heartbeat = setInterval(() => {
          void send('notifications/events/heartbeat', { cursor: String(book.happened.length) })
        }, 1000)
        const hear = (event: Happened | Readonly<{ terminated: number }>) => {
          if ('terminated' in event) {
            void send('notifications/events/terminated', {
              error: { code: event.terminated, message: 'the peer ended it' },
            }).then(done)
            return
          }
          if (event.name !== name) return
          book.sent.push(event.eventId)
          void send('notifications/events/event', event)
        }
        const done = () => {
          clearInterval(heartbeat)
          book.streams.delete(hear)
          resolve()
        }
        book.streams.add(hear)
        signal.addEventListener('abort', done, { once: true })
      })
      return {}
    },
  )
}

function serveEventTypes(server: McpServer, events: readonly PeerEventType[]): void {
  server.server.setRequestHandler(
    'events/list',
    {
      params: z.object({ cursor: z.string().optional() }).passthrough(),
      result: z.object({ events: z.array(z.unknown()) }),
    },
    async () => ({ events: [...events] }),
  )
}

export async function modernPeer(
  initial: readonly PeerAction[],
  options: Readonly<{ events?: readonly PeerEventType[] }> = {},
): Promise<ModernPeer> {
  let offered = initial
  const asked = new Map<string, number>()
  const answers: unknown[] = []
  const tasks = new Map<string, PeerTask>()
  const book: EventBook = { happened: [], streams: new Set(), sent: [], replay: false }
  const handler = createMcpHandler(() => {
    const server = new McpServer(
      { name: 'modern-peer', version: '1' },
      {
        capabilities: {
          tools: { listChanged: true },
          extensions: {
            [TASKS_EXTENSION]: {},
            ...(options.events === undefined ? {} : { [EVENTS_EXTENSION]: {} }),
          },
        },
      },
    )
    serveTasks(server, tasks)
    if (options.events !== undefined) {
      serveEventTypes(server, options.events)
      serveEvents(server, book)
    }
    for (const action of offered)
      server.registerTool(
        action.name,
        { description: action.description, inputSchema: z.object({ text: z.string() }) },
        async ({ text }) => ({
          content: [{ type: 'text' as const, text: `${action.name} answered ${text}` }],
        }),
      )
    // `book` asks a person which day, and books on the day the answer brings back.
    server.registerTool(
      'book',
      { description: 'Books a room; asks which day.', inputSchema: z.object({ text: z.string() }) },
      async ({ text }, ctx) => {
        const response = ctx.mcpReq.inputResponses?.['when']
        if (response === undefined)
          return inputRequired({
            inputRequests: {
              when: inputRequired.elicit({
                message: `Which day for room ${text}?`,
                requestedSchema: WHEN,
              }),
            },
          })
        answers.push(response)
        const accepted = acceptedContent(ctx.mcpReq.inputResponses, 'when', WHEN)
        return {
          content: [
            {
              type: 'text' as const,
              text:
                accepted === undefined
                  ? `room ${text} not booked`
                  : `booked room ${text} on ${accepted.date}`,
            },
          ],
        }
      },
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
    answers,
    offer(actions) {
      offered = actions
      handler.notify.toolsChanged()
    },
    tasks: {
      list: () => [...tasks.values()],
      finish: () => {
        for (const task of tasks.values()) if (task.status === 'working') task.status = 'completed'
      },
      ask: () => {
        for (const task of tasks.values())
          if (task.status === 'working') task.status = 'input_required'
      },
    },
    log: {
      emit(name, data) {
        const eventId = `ev-${String(book.happened.length + 1)}`
        const cursor = String(book.happened.length + 1)
        const event = { eventId, name, timestamp: new Date(0).toISOString(), data, cursor }
        book.happened.push(event)
        for (const hear of book.streams) hear(event)
        return eventId
      },
      replay(on) {
        book.replay = on
      },
      terminate(code) {
        for (const hear of book.streams) hear({ terminated: code })
      },
      open: () => book.streams.size,
      sent: () => [...book.sent],
    },
    async close() {
      server.closeAllConnections()
      await new Promise<void>(resolve => server.close(() => resolve()))
    },
  }
}
