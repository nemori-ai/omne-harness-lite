import { randomUUID } from 'node:crypto'
import type { PortFetch } from '../port-fetch/index.ts'
import { APP_ORIGIN, APP_SCHEME, toInternalUrl } from './app-url.ts'
import type { CookieJar } from './cookie-jar.ts'
import type { Logger } from './log.ts'
import {
  REQUEST_STAMP,
  failureStatus,
  shapeRequestHeaders,
  shapeResponseHeaders,
} from './mapping.ts'

type RequestHeaders = Record<string, string>

export interface AppProtocolSession {
  protocol: { handle(scheme: string, handler: (request: Request) => Promise<Response>): void }
  webRequest: {
    onBeforeSendHeaders(
      filter: { urls: string[] },
      listener: (
        details: { id: number; requestHeaders: RequestHeaders },
        next: (response: { requestHeaders: RequestHeaders }) => void,
      ) => void,
    ): void
    onErrorOccurred(listener: (details: { id: number }) => void): void
    onCompleted(listener: (details: { id: number }) => void): void
  }
}

export type AppProtocolOptions = {
  readonly upstream: PortFetch
  readonly cookies: CookieJar
  readonly log: Logger
}

const refuse = (status: number, body: string): Response =>
  new Response(body, {
    status,
    headers: { 'content-type': 'text/plain', 'cache-control': 'no-store' },
  })

type Pending = Map<string, AbortController>

/** Stamps each app request with its network id, so the handler finds its cancellation. */
function trackRequests(session: AppProtocolSession, prefix: string): Pending {
  const pending: Pending = new Map()
  session.webRequest.onBeforeSendHeaders({ urls: [`${APP_ORIGIN}/*`] }, (details, next) => {
    const key = prefix + details.id
    if (!pending.has(key)) pending.set(key, new AbortController())
    const requestHeaders: RequestHeaders = {}
    for (const [name, value] of Object.entries(details.requestHeaders))
      if (name.toLowerCase() !== REQUEST_STAMP) requestHeaders[name] = value
    requestHeaders[REQUEST_STAMP] = key
    next({ requestHeaders })
  })
  session.webRequest.onErrorOccurred(({ id }) => {
    const key = prefix + id
    pending.get(key)?.abort()
    pending.delete(key)
  })
  session.webRequest.onCompleted(({ id }) => void pending.delete(prefix + id))
  return pending
}

function forwarded(request: Request, internalUrl: string, headers: Headers, signal: AbortSignal) {
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD' && request.body !== null
  return new Request(internalUrl, {
    method: request.method,
    signal,
    headers,
    body: hasBody ? request.body : null,
    ...(hasBody ? { duplex: 'half' } : {}),
  } as RequestInit)
}

/** One request: to the internal origin, with the jar's cookie; the answer's cookies into the jar. */
async function answer(
  request: Request,
  signal: AbortSignal,
  { upstream, cookies, log }: AppProtocolOptions,
): Promise<Response> {
  const path = new URL(request.url).pathname
  const internalUrl = toInternalUrl(request.url)
  if (internalUrl === null) {
    log.warn({ method: request.method, path }, 'refused: not the app host')
    return refuse(403, 'forbidden')
  }
  const headers = shapeRequestHeaders(request.headers, request.method)
  const cookie = await cookies.cookieHeader(path)
  signal.throwIfAborted()
  if (cookie !== undefined) headers.set('cookie', cookie)
  const response = await upstream(forwarded(request, internalUrl, headers, signal))
  // Stored and flushed first, so the page's next request already carries them.
  await cookies.storeResponseCookies(response.headers, path)
  if (signal.aborted) {
    void response.body?.cancel().catch(() => {})
    return Response.error()
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: shapeResponseHeaders(response.headers),
  })
}

// Electron's `request.signal` does not fire here. Before the headers a page's cancellation shows
// only as a network error event, found again by the stamp.
export function serveAppProtocol(session: AppProtocolSession, options: AppProtocolOptions): void {
  const prefix = `${randomUUID()}:`
  const pending = trackRequests(session, prefix)

  session.protocol.handle(APP_SCHEME, async request => {
    const key = request.headers.get(REQUEST_STAMP) ?? ''
    const controller = pending.get(key)
    if (controller === undefined && key.startsWith(prefix)) return Response.error()
    const signal = controller?.signal ?? new AbortController().signal
    try {
      return await answer(request, signal, options)
    } catch (err) {
      if (signal.aborted) return Response.error()
      const { status, message } = failureStatus(err)
      const path = new URL(request.url).pathname
      options.log.error({ err, method: request.method, path, status }, 'app request failed')
      return refuse(status, message)
    } finally {
      if (controller !== undefined && pending.get(key) === controller) pending.delete(key)
    }
  })
}
