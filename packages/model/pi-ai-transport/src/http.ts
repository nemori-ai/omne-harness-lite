import { Agent, request, type RequestOptions } from 'node:https'
import type { IncomingMessage } from 'node:http'
import type { TransportFailure, SendResult } from '@omne-harness-lite/model-request-runtime'
import { isPlannedRequest, type PlannedRequest } from './plan.ts'
import { strictObject } from './json.ts'

export interface TransportPolicy {
  readonly maxConnections: number
  readonly idleConnectionTimeoutMs: number
  readonly connectTimeoutMs: number | null
  readonly maxErrorBodyBytes: number
  readonly maxSseEventBytes: number
  readonly credentialFragmentMinLength: number
}
export interface Diagnostic {
  readonly kind: string
  readonly level: 'info' | 'error'
}
export interface NetworkResources {
  readonly agent: Agent
  readonly baseUrl: URL
  readonly policy: TransportPolicy
  readonly tls?: Pick<RequestOptions, 'ca'>
  readonly diagnostic: (event: Diagnostic) => void
  readonly active: Set<Promise<void>>
  readonly closed: () => boolean
  readonly acquireConnection: (signal: AbortSignal) => Promise<(() => void) | undefined>
}
export interface RawResponse {
  readonly stream: IncomingMessage
  readonly statusCode: number
  readonly headers: Readonly<Record<string, string | readonly string[]>>
  readonly stopped: Promise<void>
  readonly stop: () => void
  readonly redact: (text: string) => string
}
const responses = new WeakSet<RawResponse>()
const consumed = new WeakSet<RawResponse>()
const responsePlans = new WeakMap<RawResponse, PlannedRequest>()
export function claimResponse(response: RawResponse, planned: PlannedRequest): boolean {
  if (!responses.has(response) || consumed.has(response) || responsePlans.get(response) !== planned)
    return false
  consumed.add(response)
  return true
}
/** Deliberate substring removal; no hashing of credentials and no unbounded regex. */
export function credentialRedactor(secret: string, minimum: number): (text: string) => string {
  return text => {
    let value = text.split(secret).join('[redacted]')
    if (secret.length >= minimum) {
      for (let n = 0; n <= secret.length - minimum; n++)
        value = value.split(secret.slice(n, n + minimum)).join('[redacted]')
    }
    return value
  }
}
export async function sendRequest(
  planned: PlannedRequest,
  credential: string,
  signal: AbortSignal,
  resources: NetworkResources,
): Promise<SendResult<RawResponse>> {
  if (
    !isPlannedRequest(planned) ||
    typeof credential !== 'string' ||
    !credential.trim() ||
    /[^\x20-\x7e]/.test(credential) ||
    !(signal instanceof AbortSignal)
  )
    return { rejected: 'invalidInput' }
  if (resources.closed()) return { rejected: 'unavailable' }
  if (signal.aborted) return { aborted: true }
  const release = await resources.acquireConnection(signal)
  if (!release) {
    if (signal.aborted)
      resources.diagnostic({ kind: 'model_transport.queue_cancelled', level: 'info' })
    return signal.aborted ? { aborted: true, queued: true } : { rejected: 'unavailable' }
  }
  if (signal.aborted || resources.closed()) {
    release()
    return signal.aborted ? { aborted: true } : { rejected: 'unavailable' }
  }
  const redact = credentialRedactor(credential, resources.policy.credentialFragmentMinLength)
  return new Promise((resolve, reject) => {
    let resolved = false,
      attached = false,
      disposeConnect = () => {}
    let stopFinished: () => void = () => {}
    const stopped = new Promise<void>(done => {
      stopFinished = done
    })
    resources.active.add(stopped)
    const req = request(new URL('chat/completions', resources.baseUrl), {
      method: 'POST',
      agent: resources.agent,
      ...resources.tls,
      headers: {
        Authorization: `Bearer ${credential}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(planned.serialized),
      },
    })
    const settle = (result: SendResult<RawResponse>) => {
      if (!resolved) {
        resolved = true
        resolve(result)
      }
    }
    const abort = () => req.destroy(new Error('explicit cancellation'))
    signal.addEventListener('abort', abort, { once: true })
    req.once('socket', socket => {
      attached = true
      if (resources.policy.connectTimeoutMs !== null && socket.connecting) {
        const timer = setTimeout(
          () => req.destroy(new Error('connection timeout')),
          resources.policy.connectTimeoutMs,
        )
        disposeConnect = () => clearTimeout(timer)
        socket.once('secureConnect', disposeConnect)
      }
    })
    req.once('close', () => {
      disposeConnect()
      signal.removeEventListener('abort', abort)
      resources.active.delete(stopped)
      stopFinished()
      release()
    })
    req.once('error', () => {
      // This callback never exposes Error.message, request URL, Authorization or body.
      void stopped.then(
        () =>
          settle(
            signal.aborted
              ? !attached
                ? {
                    failed: {
                      source: 'local',
                      queued: true,
                      localError: 'cancelled in local connection queue',
                    },
                  }
                : { aborted: true }
              : { failed: { source: 'connect', localError: 'connection failed' } },
          ),
        reject,
      )
    })
    req.once('response', res => {
      disposeConnect()
      const headers: Record<string, string | readonly string[]> = {}
      for (const [key, value] of Object.entries(res.headers))
        if (value !== undefined)
          headers[key] = Array.isArray(value) ? Object.freeze(value.map(redact)) : redact(value)
      const response: RawResponse = Object.freeze({
        stream: res,
        statusCode: res.statusCode ?? 0,
        headers: Object.freeze(headers),
        stopped,
        stop: () => req.destroy(),
        redact,
      })
      responses.add(response)
      responsePlans.set(response, planned)
      if (response.statusCode >= 200 && response.statusCode < 300) {
        settle({ response })
        return
      }
      const readError = async () => {
        const chunks: Buffer[] = []
        let bytes = 0,
          tooLarge = false
        try {
          for await (const chunk of res) {
            if (!Buffer.isBuffer(chunk)) throw new Error('non-byte response')
            bytes += chunk.length
            if (bytes > resources.policy.maxErrorBodyBytes) {
              tooLarge = true
              req.destroy()
              resources.diagnostic({ kind: 'model_transport.error_body_limit', level: 'error' })
              break
            }
            chunks.push(chunk)
          }
        } catch (error) {
          if (!res.destroyed) throw error
        }
        await stopped
        if (signal.aborted) {
          settle({ aborted: true })
          return
        }
        const raw = tooLarge
          ? undefined
          : strictObject(redact(Buffer.concat(chunks).toString('utf8')))
        const failed: TransportFailure = {
          source: 'http_status',
          statusCode: response.statusCode,
          headers: response.headers,
          ...(raw ? { upstreamError: { raw } } : { localError: 'upstream HTTP error' }),
        }
        settle({ failed })
      }
      void readError().catch(reject)
    })
    resources.diagnostic({ kind: 'model_transport.send_started', level: 'info' })
    req.end(planned.serialized)
    if (signal.aborted) abort()
  })
}
