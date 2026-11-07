// The Streamable HTTP half of the A-layer fixture: a scripted peer on a `node:http` server that
// answers JSON bodies, SSE streams, any status, the well-known metadata, the legacy HTTP+SSE
// transport (`GET` stream + endpoint), and makes itself unreachable where the script says `unsent`.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { isConnectionTarget } from '@omne-harness/mcp-contract'
import type { McpTransportFactory, TransportMaterial } from '@omne-harness/mcp-contract/provider'
import {
  NotApplicable,
  generationOf,
  type PeerNeeds,
  type PeerReceived,
  type PeerReply,
  type PeerRequestHeaders,
  type PeerScript,
  type PlainJson,
  type Replies,
  type ScriptSource,
} from '@omne-harness/mcp-contract/testing'
import {
  createLocalTransportFactory,
  type LocalTransportOptions,
} from '@omne-harness/mcp-host-local'

const METADATA_PATH = '/.well-known/oauth-protected-resource'
const servers = new Set<Server>()

/**
 * Listens on a free port above 10080: `fetch` refuses the WHATWG "bad ports" (1719, 4045, 6665,
 * … up to 10080) with `TypeError: fetch failed` and no cause code, and this host's ephemeral
 * range starts at 1024. A port in use is tried again.
 */
export async function listenFree(server: Server): Promise<number> {
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

/** The ports of the servers still listening. A test fails on a non-empty list and closes them. */
export async function leftoverServers(): Promise<readonly number[]> {
  const ports: number[] = []
  for (const server of servers) {
    const address = server.address()
    if (address !== null && typeof address === 'object') ports.push(address.port)
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
  servers.clear()
  return ports
}

function isList(replies: Replies): replies is readonly PeerReply[] {
  return Array.isArray(replies)
}

function listOf(replies: Replies | undefined): readonly PeerReply[] {
  if (replies === undefined) return []
  return isList(replies) ? replies : [replies]
}

function isRecord(value: PlainJson | undefined): value is Readonly<{ [key: string]: PlainJson }> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The MCP request headers the peer saw, by lower-case name. */
function mcpHeadersOf(request: IncomingMessage): PeerRequestHeaders {
  const headers: { [name: string]: string } = {}
  for (const name of ['mcp-protocol-version', 'mcp-method', 'mcp-name', 'mcp-session-id']) {
    const value = request.headers[name]
    if (typeof value === 'string') headers[name] = value
  }
  return headers
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => chunks.push(chunk))
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    request.on('error', reject)
  })
}

type Picked = Readonly<{ key: string; replies: readonly PeerReply[] }>

/** How the peer answers; the same choice rule as the contract's in-memory scripted peer. */
class Peer {
  readonly log: PeerReceived[] = []
  /** The method and path of every request, in order: what the log does not say about where it went. */
  readonly requestLines: string[] = []
  /** The bytes of the endless metadata document that were written before the client gave up. */
  endlessWritten = 0
  private readonly consumed = new Map<string, number>()
  private peerRequestCount = 0
  /** The open streams of the legacy HTTP+SSE mode, by session. */
  private readonly sseStreams = new Map<string, ServerResponse>()
  private sessionCount = 0

  constructor(
    private readonly script: PeerScript,
    private readonly versions: readonly string[],
    private readonly target: string,
    private readonly unreachable: () => void,
    private readonly options: HttpPeerOptions,
  ) {}

  private get legacySse(): boolean {
    return this.options.legacySse === true
  }

  private get endpointOrigin(): string | undefined {
    return this.options.endpointOrigin
  }

  breakStreams(): void {
    for (const stream of this.sseStreams.values()) stream.destroy()
    this.sseStreams.clear()
  }

  /** The streams stay open; their sessions are forgotten, so the endpoint answers 404. */
  endSessions(): void {
    this.sseStreams.clear()
  }

  private pick(key: string, replies: Replies | undefined, fallback: PeerReply): PeerReply {
    const list = listOf(replies)
    if (list.length === 0) return fallback
    const index = this.consumed.get(key) ?? 0
    this.consumed.set(key, index + 1)
    return list[Math.min(index, list.length - 1)] ?? fallback
  }

  /** The scripted replies in protocol order, with their keys, for the `unsent` plan. */
  private ordered(): readonly Picked[] {
    const script = this.script
    const entries: Picked[] = []
    const add = (key: string, replies: Replies | undefined) => {
      if (replies !== undefined) entries.push({ key, replies: listOf(replies) })
    }
    add('server/discover', script.discover)
    add('initialize', script.initialize)
    for (const [cursor, replies] of Object.entries(script.listing ?? {}))
      add(`tools/list:${cursor}`, replies)
    for (const [tool, replies] of Object.entries(script.calls ?? {}))
      add(`tools/call:${tool}`, replies)
    for (const [taskId, task] of Object.entries(script.tasks ?? {})) {
      add(`tasks/get:${taskId}`, task.get)
      add(`tasks/update:${taskId}`, task.update)
      add(`tasks/cancel:${taskId}`, task.cancel)
    }
    return entries
  }

  /**
   * After a reply (and at the start): when the next request in protocol order would be answered
   * `unsent`, the server goes away, so that the request fails before it leaves (T8 X01). An
   * unconsumed `server/discover` answer does not hold the plan back: a case may never send the
   * probe (the suite scripts a modern answer by default). An `initialize` that is `unsent` waits
   * for a scripted probe answer that leads to the legacy path.
   */
  planUnsent(): void {
    const next = (key: string, replies: readonly PeerReply[]): PeerReply | undefined => {
      const index = this.consumed.get(key) ?? 0
      return index >= replies.length ? undefined : replies[index]
    }
    const entries = this.ordered()
    const probe = entries.find(entry => entry.key === 'server/discover')
    const probeNext = probe === undefined ? undefined : next(probe.key, probe.replies)
    for (const { key, replies } of entries) {
      const reply = next(key, replies)
      if (reply === undefined) continue
      if (reply.kind === 'unsent') {
        if (key === 'initialize' && probeNext !== undefined && probeNext.kind !== 'result') return
        this.unreachable()
        return
      }
      if (key === 'server/discover' || key === 'initialize') continue
      return
    }
  }

  reply(method: string, params: Readonly<{ [key: string]: PlainJson }>): PeerReply {
    const error = (code: number, message: string): PeerReply => ({
      kind: 'error',
      error: { code, message },
    })
    const text = (key: string) => {
      const value = params[key]
      return typeof value === 'string' ? value : ''
    }
    const task = this.script.tasks?.[text('taskId')]
    switch (method) {
      case 'server/discover':
        return this.pick(method, this.script.discover, {
          kind: 'result',
          result: { supportedVersions: [...this.versions], capabilities: { tools: {} } },
        })
      case 'initialize':
        return this.pick(method, this.script.initialize, error(-32601, 'Method not found'))
      case 'tools/list':
        return this.pick(
          `${method}:${text('cursor')}`,
          this.script.listing?.[text('cursor')],
          error(-32602, 'Unknown cursor'),
        )
      case 'tools/call':
        return this.pick(
          `${method}:${text('name')}`,
          this.script.calls?.[text('name')],
          error(-32602, 'Unknown tool'),
        )
      case 'tasks/get':
        return this.pick(`${method}:${text('taskId')}`, task?.get, error(-32602, 'Task not found'))
      case 'tasks/update':
      case 'tasks/cancel': {
        if (task === undefined) return error(-32602, 'Task not found')
        const scripted = method === 'tasks/update' ? task.update : task.cancel
        return this.pick(`${method}:${text('taskId')}`, scripted, { kind: 'result', result: {} })
      }
      default:
        return error(-32601, 'Method not found')
    }
  }

  notificationReply(method: string): PeerReply | undefined {
    const replies = this.script.notifications
    return replies === undefined
      ? undefined
      : this.pick(`notification:${method}`, replies, { kind: 'silent' })
  }

  /** The requests the peer sends at a point of the legacy path, as JSON-RPC messages. */
  peerRequests(at: 'initialize' | 'initialized'): readonly PlainJson[] {
    return (this.script.peerRequests ?? [])
      .filter(request => (request.at ?? 'initialized') === at)
      .map(request => {
        this.peerRequestCount += 1
        return {
          jsonrpc: '2.0',
          id: `p${this.peerRequestCount}`,
          method: request.method,
          ...(request.params === undefined ? {} : { params: request.params }),
        }
      })
  }

  async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    response.setHeader('connection', 'close')
    const url = new URL(request.url ?? '/', this.target)
    this.requestLines.push(`${request.method ?? ''} ${url.pathname}`)
    if (request.method === 'GET' && url.pathname.startsWith(METADATA_PATH)) {
      this.log.push({ kind: 'fetch', url: url.href })
      if (this.options.metadata === 'hangs') return
      if (this.options.metadata === 'endless') return this.endlessMetadata(request, response)
      const document = this.script.wellKnown?.[url.pathname]
      if (document === undefined) {
        response.writeHead(404, { 'content-type': 'text/plain' }).end('no metadata')
        return
      }
      response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(document))
      return
    }
    if (url.pathname === new URL(this.target).pathname) {
      if (request.method === 'GET') return this.openSse(request, response)
      if (request.method === 'POST') return this.post(request, response, url)
    }
    if (url.pathname === '/message' && request.method === 'POST')
      return this.post(request, response, url)
    response.writeHead(404, { 'content-type': 'text/html' }).end('<html>not found</html>')
  }

  /** A 200 JSON document that never ends: the client must stop reading it at its byte bound. */
  private endlessMetadata(request: IncomingMessage, response: ServerResponse): void {
    response.writeHead(200, { 'content-type': 'application/json' })
    response.write('{"authorization_servers":["https://endless.test"],"pad":"')
    const chunk = 'x'.repeat(65_536)
    const more = () => {
      if (response.destroyed) return
      this.endlessWritten += chunk.length
      if (response.write(chunk)) setImmediate(more)
      else response.once('drain', more)
    }
    request.on('close', () => response.destroy())
    more()
  }

  /** The legacy HTTP+SSE transport: the stream with the `endpoint` event. */
  private openSse(request: IncomingMessage, response: ServerResponse): void {
    this.options.onSseRequest?.()
    const refusal = this.options.sseRefusal
    if (refusal !== undefined) {
      response.writeHead(refusal.status, refusal.headers ?? {})
      response.write('slow')
      const timer = setTimeout(() => response.end('...'), refusal.bodyDelayMs)
      request.on('close', () => clearTimeout(timer))
      return
    }
    if (!this.legacySse) {
      response.writeHead(405, { 'content-type': 'text/plain' }).end('no stream')
      return
    }
    this.sessionCount += 1
    const session = `s${this.sessionCount}`
    response.writeHead(200, { 'content-type': 'text/event-stream' })
    const endpoint = `${this.endpointOrigin ?? ''}/message?sessionId=${session}`
    response.write(`event: endpoint\ndata: ${endpoint}\n\n`)
    this.sseStreams.set(session, response)
    request.on('close', () => this.sseStreams.delete(session))
  }

  private async post(request: IncomingMessage, response: ServerResponse, url: URL): Promise<void> {
    const session = url.searchParams.get('sessionId')
    const stream = session === null ? undefined : this.sseStreams.get(session)
    if (session !== null && stream === undefined) {
      response.writeHead(404, { 'content-type': 'application/json' }).end(
        JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          error: { code: -32000, message: 'Session not found' },
        }),
      )
      return
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(await readBody(request))
    } catch {
      response.writeHead(400, { 'content-type': 'text/plain' }).end('bad body')
      return
    }
    const message = isRecord(parsed as PlainJson)
      ? (parsed as Readonly<{ [key: string]: PlainJson }>)
      : undefined
    if (message === undefined) {
      response.writeHead(400, { 'content-type': 'text/plain' }).end('bad message')
      return
    }
    const headers = mcpHeadersOf(request)
    const method = message['method']
    const id = message['id']
    const params = isRecord(message['params']) ? message['params'] : {}
    if (typeof method !== 'string') {
      // The client's answer to a request of the peer.
      this.log.push({
        kind: 'response',
        id: String(id),
        ...(message['result'] === undefined ? {} : { result: message['result'] }),
        ...(message['error'] === undefined ? {} : { error: message['error'] }),
      })
      response.writeHead(202).end()
      return
    }
    if (id === undefined) {
      this.log.push({ kind: 'notification', method, params: message['params'] ?? {}, headers })
      const chosen = this.notificationReply(method)
      if (chosen?.kind === 'http') this.answerHttp(response, chosen)
      else if (chosen?.kind === 'stream-breaks') this.breakStream(response)
      else response.writeHead(202).end()
      if (method === 'notifications/initialized' && stream !== undefined)
        for (const peerRequest of this.peerRequests('initialized'))
          stream.write(`event: message\ndata: ${JSON.stringify(peerRequest)}\n\n`)
      return
    }
    const requestId = typeof id === 'string' ? id : String(id)
    await this.options.beforeRecord?.(method)
    this.log.push({
      kind: 'request',
      id: requestId,
      method,
      params: message['params'] ?? {},
      headers,
    })
    const chosen = this.reply(method, params)
    const token = isRecord(params['_meta']) ? params['_meta']['progressToken'] : undefined
    const before = method === 'initialize' ? this.peerRequests('initialize') : []
    if (stream !== undefined) {
      // The legacy HTTP+SSE mode: the answer goes on the shared stream; the POST is accepted.
      response.writeHead(202).end()
      this.realizeOnStream(stream, chosen, id, token, before)
      this.planUnsent()
      return
    }
    response.on('close', () => {
      if (!response.writableFinished) this.log.push({ kind: 'stream-aborted', id: requestId })
    })
    this.realize(response, chosen, id, token, before)
  }

  private realize(
    response: ServerResponse,
    chosen: PeerReply,
    id: PlainJson,
    token: PlainJson | undefined,
    before: readonly PlainJson[],
  ): void {
    const finish = () => {
      response.on('finish', () => this.planUnsent())
    }
    switch (chosen.kind) {
      case 'result': {
        const events = [
          ...before,
          ...(chosen.notifications ?? []).map(notification => ({
            jsonrpc: '2.0',
            method: notification.method,
            params: this.progressParams(notification.params, token),
          })),
        ]
        const answer = { jsonrpc: '2.0', id, result: chosen.result }
        const headers = { ...chosen.headers }
        finish()
        if (events.length === 0 && this.options.sseNoise !== true) {
          response
            .writeHead(200, { ...headers, 'content-type': 'application/json' })
            .end(JSON.stringify(answer))
          return
        }
        response.writeHead(200, { ...headers, 'content-type': 'text/event-stream' })
        if (this.options.sseNoise === true) {
          const decoy = { jsonrpc: '2.0', id, result: { decoy: true } }
          response.write(`event: ping\ndata: ${JSON.stringify(decoy)}\n\n`)
        }
        for (const event of [...events, answer])
          response.write(`event: message\ndata: ${JSON.stringify(event)}\n\n`)
        response.end()
        return
      }
      case 'error':
        finish()
        response
          .writeHead(200, { 'content-type': 'application/json' })
          .end(JSON.stringify({ jsonrpc: '2.0', id, error: chosen.error }))
        return
      case 'http':
        finish()
        this.answerHttp(response, chosen)
        return
      case 'stream-breaks':
        this.breakStream(response)
        return
      case 'silent':
      case 'unsent':
      case 'process-exits':
        // The answer never comes: the stream stays open until the client ends it. With
        // `holdHeads` not even the answer head goes out.
        if (this.options.holdHeads === true) return
        response.writeHead(200, { 'content-type': 'text/event-stream' })
        response.flushHeaders()
        return
      default: {
        const exhaustive: never = chosen
        return exhaustive
      }
    }
  }

  private realizeOnStream(
    stream: ServerResponse,
    chosen: PeerReply,
    id: PlainJson,
    token: PlainJson | undefined,
    before: readonly PlainJson[],
  ): void {
    const send = (event: PlainJson) =>
      stream.write(`event: message\ndata: ${JSON.stringify(event)}\n\n`)
    switch (chosen.kind) {
      case 'result':
        for (const event of before) send(event)
        for (const notification of chosen.notifications ?? [])
          send({
            jsonrpc: '2.0',
            method: notification.method,
            params: this.progressParams(notification.params, token),
          })
        send({ jsonrpc: '2.0', id, result: chosen.result })
        return
      case 'error':
        send({ jsonrpc: '2.0', id, error: chosen.error })
        return
      case 'stream-breaks':
        stream.destroy()
        return
      default:
        return
    }
  }

  private progressParams(params: PlainJson | undefined, token: PlainJson | undefined): PlainJson {
    const written = isRecord(params) ? params : {}
    return written['progressToken'] === undefined && token !== undefined
      ? { ...written, progressToken: token }
      : written
  }

  private answerHttp(response: ServerResponse, chosen: Extract<PeerReply, { kind: 'http' }>): void {
    response.writeHead(chosen.status, chosen.headers ?? {})
    response.end(chosen.body ?? '')
  }

  /** The answer head goes out, then the socket dies: the client reads a broken 2xx body. */
  private breakStream(response: ServerResponse): void {
    response.writeHead(200, { 'content-type': 'text/event-stream' })
    response.write(': open\n\n')
    setTimeout(() => {
      response.socket?.destroy()
      this.planUnsent()
    }, 5)
  }
}

/** The request header that carries the number the counting `fetch` gave the request. */
const REQUEST_HEADER = 'x-omne-fixture-request'

/** A request that is stuck: `received()` rejects when the log is not complete by then. */
const RECEIVED_WITHIN_MS = 5_000

/** What the fixture knows of one request that went out through the peer's factory. */
type Tracked = {
  readonly n: number
  readonly url: string
  readonly signal: AbortSignal | undefined
  /** The `fetch` rejected. */
  rejected: boolean
  /** The server got the request: the peer's `handle()` was called for it. */
  seen: boolean
  /** The promise of `handle()` settled. */
  handled: boolean
  /** The answer's `close` event came. */
  closed: boolean
}

/**
 * The peer has recorded everything about the request: `handle()` settled (the peer records
 * before it returns), and, when the client aborted the request, the answer closed (the peer
 * records an aborted answer stream on `close`). A request that failed without reaching the
 * server has nothing to record.
 */
function recorded(request: Tracked): boolean {
  if (request.rejected && !request.seen) return true
  return request.handled && (request.signal?.aborted !== true || request.closed)
}

function missingOf(request: Tracked): string {
  if (!request.seen) return 'the peer did not get it and the fetch did not fail'
  if (!request.handled) return 'handle() did not settle'
  return 'the aborted answer did not close'
}

/**
 * The requests that went out through the peer's factory, in step with what the server did with
 * each. The counting `fetch` numbers every request and sends the number in `REQUEST_HEADER`; the
 * server reads it back, so the two sides of one request are joined without a time window.
 */
class Requests {
  private readonly tracked = new Map<number, Tracked>()
  private count = 0
  /** Counts the rounds `newRound` opened. */
  private epoch = 0
  private waiters: (() => void)[] = []

  /** The `fetch` of the peer's factory: the global one, with each request numbered and tracked. */
  readonly fetch: typeof fetch = (input, init) => {
    this.count += 1
    const n = this.count
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : {}))
    headers.set(REQUEST_HEADER, String(n))
    const signal = init?.signal ?? undefined
    const request: Tracked = {
      n,
      url: input instanceof Request ? input.url : String(input),
      signal,
      rejected: false,
      seen: false,
      handled: false,
      closed: false,
    }
    this.tracked.set(n, request)
    signal?.addEventListener('abort', () => this.newRound(), { once: true })
    this.newRound()
    const answer = globalThis.fetch(input, { ...init, headers })
    void answer.then(
      () => undefined,
      () => {
        request.rejected = true
        this.progressed()
      },
    )
    return answer
  }

  /**
   * The server got a request. Returns what to call when `handle()` settled. A request without the
   * header did not come through the peer's factory and is not tracked. The `close` listener goes on
   * before `handle()` adds its own, so the peer records an aborted stream in the same `close`
   * event, before a waiter resumes.
   */
  arrived(request: IncomingMessage, response: ServerResponse): () => void {
    const header = request.headers[REQUEST_HEADER]
    const tracked = typeof header === 'string' ? this.tracked.get(Number(header)) : undefined
    if (tracked === undefined) return () => undefined
    tracked.seen = true
    this.newRound()
    response.on('close', () => {
      tracked.closed = true
      this.progressed()
    })
    return () => {
      tracked.handled = true
      this.progressed()
    }
  }

  /**
   * Resolves when the peer has recorded every request that started before, and one more turn of
   * the event loop started no request, aborted none and brought none to the server. A caller's
   * promise may settle before the client sends what follows it, such as a cancellation or an
   * answer to the peer; a request that reaches the server may make the peer send something the
   * client answers with a request of its own. Rejects after `RECEIVED_WITHIN_MS` with the requests
   * not yet recorded.
   */
  async settle(): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined
    const late = new Promise<'late'>(resolve => {
      timer = setTimeout(() => resolve('late'), RECEIVED_WITHIN_MS)
    })
    try {
      for (;;) {
        const round = this.epoch
        const started = [...this.tracked.values()]
        for (;;) {
          const open = started.filter(request => !recorded(request))
          if (open.length === 0) break
          if ((await Promise.race([this.next(), late])) === 'late') throw stuck(open)
        }
        await new Promise(resolve => setImmediate(resolve))
        if (this.epoch === round) return
      }
    } finally {
      clearTimeout(timer)
    }
  }

  private next(): Promise<void> {
    return new Promise(resolve => this.waiters.push(resolve))
  }

  /** A request started, was aborted or reached the server: `settle` waits one more round. */
  private newRound(): void {
    this.epoch += 1
    this.progressed()
  }

  /** A request moved on toward being recorded: the waiters look again. */
  private progressed(): void {
    const waiters = this.waiters
    this.waiters = []
    for (const resume of waiters) resume()
  }
}

function stuck(open: readonly Tracked[]): Error {
  const lines = open.map(request => `#${request.n} ${request.url}: ${missingOf(request)}`)
  return new Error(
    `the peer had not recorded these requests within ${RECEIVED_WITHIN_MS} ms: ${lines.join('; ')}`,
  )
}

/** The options of the client a test builds: `httpPeer` adds only its tracking `fetch`. */
export type ClientOptions = Omit<LocalTransportOptions, 'fetch'>

export type HttpPeer = Readonly<{
  material: TransportMaterial
  /**
   * The transport factory on the test's client options whose `fetch` the peer tracks.
   * `received()` waits only for the requests that went out through it.
   */
  factory: McpTransportFactory
  /**
   * The log, once the peer has recorded every request that went out through `factory` before the
   * call, and what the client sent right after. Rejects when a request is not recorded within
   * `RECEIVED_WITHIN_MS`.
   */
  received(): Promise<readonly PeerReceived[]>
  /** The method and path of every request the peer got, in order. */
  requestLines(): readonly string[]
  /** The bytes of the endless metadata document written before the client stopped reading. */
  endlessBytes(): number
  /** The legacy HTTP+SSE mode: destroys every open stream. */
  breakStreams(): void
  /** The legacy HTTP+SSE mode: forgets every session, so that its endpoint answers 404. */
  endSessions(): void
  close(): Promise<void>
}>

export type HttpPeerOptions = Readonly<{
  /** The peer speaks the legacy HTTP+SSE transport: `GET` gives the stream and the endpoint. */
  legacySse?: boolean
  /** The origin the `endpoint` event names; default: the peer's own. */
  endpointOrigin?: string
  /** A `silent` reply sends no answer head at all, not even the status line. */
  holdHeads?: boolean
  /** The metadata GET never answers (`hangs`), or answers a JSON document that never ends. */
  metadata?: 'hangs' | 'endless'
  /** The GET of the legacy fallback answers this status, a partial body, and the rest after a delay. */
  sseRefusal?: Readonly<{
    status: number
    headers?: Readonly<{ [name: string]: string }>
    bodyDelayMs: number
  }>
  /** Called when the peer sees the GET of the legacy fallback. */
  onSseRequest?: () => void
  /**
   * Every 2xx answer goes out as an SSE body whose first event is not a `message` event: a `ping`
   * event carrying a decoy answer with the request's id. A transport reads message events only.
   */
  sseNoise?: boolean
  /**
   * Called with the method of each request the peer takes, after the body is read and before the
   * peer records it; the record and the answer wait for it. Only the fixture's own cases use it,
   * to record a request late, as a peer under load may.
   */
  beforeRecord?: (method: string) => Promise<void>
}>

export async function httpPeer(
  source: ScriptSource,
  needs: PeerNeeds,
  versions: readonly string[],
  client: ClientOptions,
  options: HttpPeerOptions = {},
): Promise<HttpPeer> {
  let peer: Peer | undefined
  const requests = new Requests()
  const server = createServer((request, response) => {
    const handled = requests.arrived(request, response)
    void (peer?.handle(request, response) ?? Promise.resolve())
      .catch(() => {
        if (!response.headersSent) response.writeHead(500).end()
      })
      .finally(handled)
  })
  servers.add(server)
  const port = await listenFree(server)
  const target = `http://127.0.0.1:${port}/mcp`
  if (!isConnectionTarget(target)) throw new Error(`not a connection target: ${target}`)
  const script = typeof source === 'function' ? source(target) : source
  if (
    (script.peerRequests ?? []).some(request => (request.at ?? 'initialized') === 'initialized') &&
    options.legacySse !== true
  ) {
    servers.delete(server)
    await new Promise<void>(resolve => server.close(() => resolve()))
    throw new NotApplicable('a channel for the requests of the peer after initialized')
  }
  const unreachable = () => {
    server.closeAllConnections()
    server.close()
    servers.delete(server)
  }
  peer = new Peer(script, versions, target, unreachable, options)
  peer.planUnsent()
  const material: TransportMaterial = {
    kind: 'streamable-http',
    target,
    ...(needs.credential === undefined ? {} : { credential: needs.credential }),
    generation: generationOf(1),
    instructionsByteLimit: needs.instructionsByteLimit ?? 4096,
  }
  const log = peer.log
  const built = peer
  return {
    material,
    factory: createLocalTransportFactory({ ...client, fetch: requests.fetch }),
    requestLines: () => [...built.requestLines],
    endlessBytes: () => built.endlessWritten,
    breakStreams: () => built.breakStreams(),
    endSessions: () => built.endSessions(),
    async received() {
      await requests.settle()
      return [...log]
    },
    async close() {
      if (!servers.has(server)) return
      servers.delete(server)
      server.closeAllConnections()
      await new Promise<void>(resolve => server.close(() => resolve()))
    },
  }
}
