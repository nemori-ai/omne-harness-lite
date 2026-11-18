import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import type { LoginSession } from '../main-core/index.ts'
import { answerPageFile } from '../shared/page-files.ts'
import {
  BRIDGE,
  WIRE_LIMITS,
  readAttach,
  readCall,
  readCredentials,
  readDetach,
  writeLoginState,
  writePageEvent,
  writeReport,
  writeResult,
  type Attach,
  type ObserveEvent,
} from '../shared/wire.ts'

export type WebHostOptions = {
  readonly session: LoginSession
  readonly pageRoot?: string
  /** One line per event; never a body, a proof or a password. */
  readonly log?: (line: string) => void
}

export interface WebHost {
  listen(port: number): Promise<number>
  close(): Promise<void>
}

// A loopback name with any port. The name is what stops a rebinding page (its own name is in
// `Host`); the port says nothing more, and a forwarded port shows the browser another number.
const LOOPBACK_HOST = /^(?:127\.0\.0\.1|localhost|\[::1\])(?::\d{1,5})?$/

class TooLarge extends Error {}

async function bodyText(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request as AsyncIterable<Buffer>) {
    size += chunk.length
    if (size > WIRE_LIMITS.maxBytes) throw new TooLarge()
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

function send(response: ServerResponse, status: number, type: string, body: string): void {
  response.writeHead(status, {
    'content-type': type,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  response.end(body)
}

const json = (response: ServerResponse, body: string): void =>
  send(response, 200, 'application/json', body)

function openStream(response: ServerResponse): void {
  response.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-store',
    connection: 'keep-alive',
    'x-content-type-options': 'nosniff',
  })
  response.flushHeaders()
}

const event = (data: string): string => `data: ${data}\n\n`

type PageStream = {
  readonly response: ServerResponse
  readonly observations: Map<string, AbortController>
}

function pageGone(response: ServerResponse): AbortSignal {
  const controller = new AbortController()
  response.on('close', () => {
    if (!response.writableFinished) controller.abort()
  })
  return controller.signal
}

/** One stream per page carries all of its observations: a browser keeps few connections per host. */
function pageObservations(
  session: LoginSession,
  streams: Set<ServerResponse>,
  log: (line: string) => void,
) {
  const pages = new Map<string, PageStream>()

  function events(request: IncomingMessage, response: ServerResponse): void {
    const page = new URL(request.url ?? '/', 'http://host').searchParams.get('page')
    if (page === null || page === '') return send(response, 400, 'text/plain', 'no page')
    pages.get(page)?.response.end()
    openStream(response)
    const stream: PageStream = { response, observations: new Map() }
    pages.set(page, stream)
    streams.add(response)
    response.on('close', () => {
      streams.delete(response)
      for (const controller of stream.observations.values()) controller.abort()
      if (pages.get(page) === stream) pages.delete(page)
    })
  }

  async function forward(stream: PageStream, attach: Attach, controller: AbortController) {
    const { signal } = controller
    const write = (observed: ObserveEvent) =>
      stream.response.write(event(writePageEvent(attach.id, observed)))
    const frames = session.transport.observe({ ...attach.request, signal })
    const stop = (): void => void frames.return({ kind: 'aborted' })
    signal.addEventListener('abort', stop)
    try {
      for (;;) {
        const next = await frames.next()
        if (signal.aborted) return
        if (next.done === true) {
          const { protocol, observation } = attach.request
          log(
            `observation ${protocol.name}/v${protocol.major} ${observation} ended: ${next.value.kind}`,
          )
          return void write({ end: next.value })
        }
        write({ frame: next.value })
      }
    } catch {
      if (!signal.aborted) write({ end: { kind: 'uncertain' } })
    } finally {
      signal.removeEventListener('abort', stop)
      if (stream.observations.get(attach.id) === controller) stream.observations.delete(attach.id)
    }
  }

  async function observe(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const attach = readAttach(await bodyText(request))
    if (attach === undefined) return send(response, 400, 'text/plain', 'bad observation')
    const stream = pages.get(attach.page)
    if (stream === undefined) {
      log('observation refused: the page has no event stream')
      return send(response, 409, 'text/plain', 'no event stream')
    }
    const controller = new AbortController()
    stream.observations.get(attach.id)?.abort()
    stream.observations.set(attach.id, controller)
    json(response, '{}')
    await forward(stream, attach, controller)
  }

  async function unobserve(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const detach = readDetach(await bodyText(request))
    if (detach === undefined) return send(response, 400, 'text/plain', 'bad detach')
    pages.get(detach.page)?.observations.get(detach.id)?.abort()
    json(response, '{}')
  }

  return { events, observe, unobserve }
}

export function createWebHost(options: WebHostOptions): WebHost {
  const { session } = options
  const log = options.log ?? (() => {})
  const streams = new Set<ServerResponse>()
  const { events, observe, unobserve } = pageObservations(session, streams, log)

  function trusted(request: IncomingMessage, post: boolean): boolean {
    const host = request.headers.host ?? ''
    if (!LOOPBACK_HOST.test(host)) return false
    const origin = request.headers.origin
    if (origin !== undefined && origin !== `http://${host}`) return false
    if (!post) return true
    return request.headers['content-type']?.split(';')[0]?.trim() === 'application/json'
  }

  async function call(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const message = readCall(await bodyText(request))
    if (message === undefined) return send(response, 400, 'text/plain', 'bad call')
    const report = await session.transport.call({ ...message, signal: pageGone(response) })
    json(response, writeReport(report))
  }

  async function login(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const credentials = readCredentials(await bodyText(request))
    if (credentials === undefined) return send(response, 400, 'text/plain', 'bad credentials')
    json(response, writeResult(await session.login(credentials)))
  }

  async function logout(request: IncomingMessage, response: ServerResponse): Promise<void> {
    await bodyText(request)
    json(response, writeResult(await session.logout()))
  }

  function loginState(response: ServerResponse): void {
    openStream(response)
    streams.add(response)
    response.write(event(writeLoginState(session.state(), session.protocols)))
    const unsubscribe = session.subscribe(state =>
      response.write(event(writeLoginState(state, session.protocols))),
    )
    response.on('close', () => {
      unsubscribe()
      streams.delete(response)
    })
  }

  async function page(path: string, response: ServerResponse): Promise<void> {
    const root = options.pageRoot
    if (root === undefined) return send(response, 404, 'text/plain', 'not found')
    const answer = await answerPageFile(path, segments =>
      readFile(join(root, ...segments)).then(
        content => new Uint8Array(content),
        () => undefined,
      ),
    )
    if (answer.status === 404) return send(response, 404, 'text/plain', 'not found')
    response.writeHead(200, answer.headers)
    response.end(answer.body)
  }

  async function route(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const path = new URL(request.url ?? '/', 'http://host').pathname
    const post = request.method === 'POST'
    if (!trusted(request, post)) {
      // Header values only (no body, no proof): enough to see which check refused a browser.
      log(
        `refused ${request.method ?? ''} ${path}: host=${request.headers.host ?? ''} origin=${request.headers.origin ?? ''}`,
      )
      return send(response, 403, 'text/plain', 'forbidden')
    }
    if (post && path === BRIDGE.call) return call(request, response)
    if (post && path === BRIDGE.observe) return observe(request, response)
    if (post && path === BRIDGE.unobserve) return unobserve(request, response)
    if (request.method === 'GET' && path === BRIDGE.events) return events(request, response)
    if (post && path === BRIDGE.login) return login(request, response)
    if (post && path === BRIDGE.logout) return logout(request, response)
    if (request.method === 'GET' && path === BRIDGE.loginState) return loginState(response)
    if (request.method === 'GET' && !path.startsWith('/bridge/')) return page(path, response)
    send(response, 404, 'text/plain', 'not found')
  }

  const server: Server = createServer((request, response) => {
    route(request, response).catch((error: unknown) => {
      const path = new URL(request.url ?? '/', 'http://host').pathname
      // The error's message may quote a body; only its kind is logged.
      log(
        `request failed: ${request.method ?? '?'} ${path} (${error instanceof TooLarge ? 'too large' : 'error'})`,
      )
      if (!response.headersSent)
        send(response, error instanceof TooLarge ? 413 : 500, 'text/plain', 'failed')
      else response.end()
    })
  })

  return {
    listen(wanted) {
      return new Promise((resolve, reject) => {
        server.once('error', reject)
        server.listen(wanted, '127.0.0.1', () => {
          resolve((server.address() as AddressInfo).port)
        })
      })
    },
    close() {
      for (const stream of streams) stream.end()
      server.closeAllConnections()
      return new Promise(resolve => server.close(() => resolve()))
    },
  }
}
