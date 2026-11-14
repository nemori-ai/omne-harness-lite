// The web host (SPEC.md「宿主给页面的通道」): a local Node process that holds the login for the
// page and gives it the bridge over same-origin HTTP and SSE, and serves the built page. It listens
// on the loopback address only. No server framework: `node:http`.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize, sep } from 'node:path'
import type { AddressInfo } from 'node:net'
import type { LoginSession } from '../main-core/index.ts'
import {
  BRIDGE,
  WIRE_LIMITS,
  readCall,
  readCredentials,
  readObserve,
  writeLoginState,
  writeObserveEvent,
  writeReport,
  writeResult,
} from '../shared/wire.ts'

export type WebHostOptions = {
  readonly session: LoginSession
  /** The built page; absent: no static files (tests). */
  readonly pageRoot?: string
  /** One line per event; never a body, a proof or a password. */
  readonly log?: (line: string) => void
}

export interface WebHost {
  /** Listens on 127.0.0.1; answers the bound port (useful with port 0). */
  listen(port: number): Promise<number>
  close(): Promise<void>
}

/** Only the page's own scripts and styles; only same-origin connections. */
const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ')

const TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
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

/** An abort signal that fires when the page goes away before the answer is complete. */
function pageGone(response: ServerResponse): AbortSignal {
  const controller = new AbortController()
  response.on('close', () => {
    if (!response.writableFinished) controller.abort()
  })
  return controller.signal
}

export function createWebHost(options: WebHostOptions): WebHost {
  const { session } = options
  const log = options.log ?? (() => {})
  const streams = new Set<ServerResponse>()

  /** Same-origin checks: a loopback `Host`; a JSON body; any `Origin` is ours. */
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

  async function observe(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const message = readObserve(await bodyText(request))
    if (message === undefined) return send(response, 400, 'text/plain', 'bad observation')
    const signal = pageGone(response)
    openStream(response)
    const frames = session.transport.observe({ ...message, signal })
    // The page went away: stop the observation, which also closes the upstream stream.
    const stop = (): void => {
      void frames.return({ kind: 'aborted' })
    }
    signal.addEventListener('abort', stop)
    try {
      for (;;) {
        const next = await frames.next()
        if (signal.aborted) return
        if (next.done === true) {
          response.end(event(writeObserveEvent({ end: next.value })))
          return
        }
        response.write(event(writeObserveEvent({ frame: next.value })))
      }
    } finally {
      signal.removeEventListener('abort', stop)
    }
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
    response.write(event(writeLoginState(session.state())))
    const unsubscribe = session.subscribe(state => response.write(event(writeLoginState(state))))
    response.on('close', () => {
      unsubscribe()
      streams.delete(response)
    })
  }

  async function page(path: string, response: ServerResponse): Promise<void> {
    const root = options.pageRoot
    if (root === undefined) return send(response, 404, 'text/plain', 'not found')
    const relative = normalize(decodeURIComponent(path === '/' ? '/index.html' : path))
    const file = join(root, relative)
    if (!file.startsWith(root.endsWith(sep) ? root : root + sep))
      return send(response, 404, 'text/plain', 'not found')
    let content: Buffer
    try {
      content = await readFile(file)
    } catch {
      return send(response, 404, 'text/plain', 'not found')
    }
    const type = TYPES[extname(file)] ?? 'application/octet-stream'
    response.writeHead(200, {
      'content-type': type,
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      ...(type.startsWith('text/html')
        ? { 'content-security-policy': CONTENT_SECURITY_POLICY }
        : {}),
    })
    response.end(content)
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
