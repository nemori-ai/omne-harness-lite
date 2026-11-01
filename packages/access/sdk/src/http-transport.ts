import type { GovernanceTransport, TransportReport } from './transport.ts'

export interface HttpTransportOptions {
  /** A loopback `http:` origin: `127.0.0.1` or `localhost`, with no credential, path, or query. */
  readonly origin: string
  readonly location: 'governance' | 'session'
  /** Cancels sends. A send cancelled before it began is `not-sent`; one cancelled later is `uncertain`. */
  readonly signal?: AbortSignal
}

const paths = {
  governance: '/governance-public/1',
  session: '/session-public/1',
} as const

const loopbackHosts: ReadonlySet<string> = new Set(['127.0.0.1', 'localhost'])

/** Connection errors that can only happen before the first request byte is written. */
const beforeFirstByte: ReadonlySet<string> = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EADDRNOTAVAIL',
  'UND_ERR_CONNECT_TIMEOUT',
])

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

function codeOf(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined
  return typeof error.code === 'string' ? error.code : undefined
}

/** True only when the failure proves that the connection never reached the write of the request. */
function neverWritten(error: unknown): boolean {
  const cause = error instanceof Error ? error.cause : undefined
  const codes: (string | undefined)[] = [codeOf(cause)]
  const nested =
    typeof cause === 'object' && cause !== null && 'errors' in cause ? cause.errors : []
  if (Array.isArray(nested)) codes.push(...nested.map(codeOf))
  const known = codes.filter((code): code is string => code !== undefined)
  return known.length > 0 && known.every(code => beforeFirstByte.has(code))
}

function isJson(contentType: string | null): boolean {
  if (contentType === null) return false
  return contentType.split(';')[0]?.trim().toLowerCase() === 'application/json'
}

/**
 * An HTTP transport for one public location of one loopback server, built on `fetch`. It does
 * not follow redirects: the login proof is in the request body and a redirect would resend it.
 * It hands over the full body of every JSON response whatever the status, so the client can
 * read an `unknown` outcome that travels with status 500.
 */
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
