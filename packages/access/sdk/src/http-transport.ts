import type { GovernanceTransport, TransportReport } from './transport.ts'
import { neverWritten } from './never-written.ts'

export interface HttpTransportOptions {
  readonly origin: string
  readonly location: 'governance' | 'session' | 'hitl'
  readonly signal?: AbortSignal
}

const paths = {
  governance: '/governance-public/1',
  session: '/session-public/1',
  hitl: '/hitl-public/1',
} as const

const loopbackHosts: ReadonlySet<string> = new Set(['127.0.0.1', 'localhost'])

function loopbackUrl(origin: string, location: keyof typeof paths): URL {
  const refusal = new TypeError('origin must be a loopback http address')
  let parsed: URL
  try {
    parsed = new URL(origin)
  } catch {
    throw refusal
  }
  const plain = parsed.username === '' && parsed.password === ''
  const bare = parsed.pathname === '/' && parsed.search === '' && parsed.hash === ''
  if (parsed.protocol !== 'http:' || !loopbackHosts.has(parsed.hostname) || !plain || !bare)
    throw refusal
  return new URL(paths[location], parsed)
}

function isJson(contentType: string | null): boolean {
  if (contentType === null) return false
  return contentType.split(';')[0]?.trim().toLowerCase() === 'application/json'
}

export function createHttpTransport(options: HttpTransportOptions): GovernanceTransport {
  const url = loopbackUrl(options.origin, options.location)
  const { signal } = options
  return {
    async send(bytes): Promise<TransportReport> {
      if (signal?.aborted === true) return { kind: 'not-sent' }
      let response: Response
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: bytes,
          redirect: 'manual',
          cache: 'no-store',
          ...(signal === undefined ? {} : { signal }),
        })
      } catch (error) {
        return neverWritten(error) ? { kind: 'not-sent' } : { kind: 'uncertain' }
      }
      try {
        if (!isJson(response.headers.get('content-type'))) {
          await response.body?.cancel()
          return { kind: 'uncertain' }
        }
        return { kind: 'response', bytes: new Uint8Array(await response.arrayBuffer()) }
      } catch {
        return { kind: 'uncertain' }
      }
    },
  }
}
