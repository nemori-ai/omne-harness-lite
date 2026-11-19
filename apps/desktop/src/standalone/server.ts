import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import type { AddressInfo } from 'node:net'
import type { Forwarding } from '../forwarding/app.ts'

export type StandaloneOptions = {
  readonly forwarding: Forwarding
  readonly log?: (line: string) => void
}

/** The forwarding layer on a loopback port, for a browser. Development and walk-throughs only. */
export interface Standalone {
  listen(port: number): Promise<number>
  close(): Promise<void>
}

export const STANDALONE_WARNING =
  'omne desktop (standalone): for development and walk-throughs only. The login cookie is in the ' +
  "browser's cookie store, and a browser sends it to any port of this machine. Do not sign in to " +
  'an account that matters.'

// A loopback name with any port: the name stops a rebinding page, and a forwarded port shows
// the browser another number.
const LOOPBACK_HOST = /^(?:127\.0\.0\.1|localhost|\[::1\])(?::\d{1,5})?$/

function refuse(response: ServerResponse, status: number, body: string): void {
  response.writeHead(status, { 'content-type': 'text/plain', 'cache-control': 'no-store' })
  response.end(body)
}

function pageGone(response: ServerResponse): AbortSignal {
  const controller = new AbortController()
  response.on('close', () => {
    if (!response.writableFinished) controller.abort()
  })
  return controller.signal
}

function webRequest(request: IncomingMessage, host: string, signal: AbortSignal): Request {
  const headers = new Headers()
  for (const [name, value] of Object.entries(request.headers))
    if (typeof value === 'string') headers.set(name, value)
  const body = request.method !== 'GET' && request.method !== 'HEAD'
  return new Request(`http://${host}${request.url ?? '/'}`, {
    method: request.method ?? 'GET',
    headers,
    signal,
    ...(body
      ? { body: Readable.toWeb(request) as ReadableStream<Uint8Array>, duplex: 'half' }
      : {}),
  } as RequestInit)
}

async function deliver(answer: Response, response: ServerResponse): Promise<void> {
  const stream = answer.headers.get('content-type') === 'text/event-stream'
  for (const [name, value] of answer.headers)
    if (name !== 'set-cookie') response.setHeader(name, value)
  const cookies = answer.headers.getSetCookie()
  if (cookies.length > 0) response.setHeader('set-cookie', cookies)
  if (stream) response.setHeader('connection', 'keep-alive')
  response.writeHead(answer.status)
  if (answer.body === null) return void response.end()
  if (stream) response.flushHeaders()
  const reader = answer.body.getReader()
  response.on('close', () => void reader.cancel().catch(() => {}))
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (!response.write(value)) await new Promise(resolve => response.once('drain', resolve))
  }
  response.end()
}

export function createStandalone(options: StandaloneOptions): Standalone {
  const log = options.log ?? (() => {})

  async function route(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const host = request.headers.host ?? ''
    if (!LOOPBACK_HOST.test(host)) {
      const path = new URL(request.url ?? '/', 'http://host').pathname
      log(`refused ${request.method ?? ''} ${path}: host=${host}`)
      return refuse(response, 403, 'forbidden')
    }
    await deliver(
      await options.forwarding.fetch(webRequest(request, host, pageGone(response))),
      response,
    )
  }

  const server: Server = createServer((request, response) => {
    route(request, response).catch(() => {
      const path = new URL(request.url ?? '/', 'http://host').pathname
      log(`request failed: ${request.method ?? '?'} ${path} (error)`)
      if (!response.headersSent) refuse(response, 500, 'failed')
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
      options.forwarding.close()
      server.closeAllConnections()
      return new Promise(resolve => server.close(() => resolve()))
    },
  }
}
