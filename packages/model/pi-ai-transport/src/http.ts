import { Agent, request, type RequestOptions } from 'node:https'
import type { IncomingMessage } from 'node:http'
import type { TransportFailure, SendResult } from '@omne-harness-lite/model-request-runtime'
import { isPlannedRequest, type PlannedRequest } from './plan.ts'
import { strictObject, redactObject, redactedEntries } from './json.ts'
import { reportDiagnostic } from './diagnostics.ts'

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
  readonly stopped: Promise<void>
  readonly stop: () => void
}
interface ResponseState {
  readonly stream: IncomingMessage
  readonly statusCode: number
  readonly redact: (text: string) => string
  readonly planned: PlannedRequest
  claimed: boolean
}
const responses = new WeakMap<RawResponse, ResponseState>()
/** Package-internal, single-reader claim; never exported from the public entry. */
export function claimResponse(
  response: RawResponse,
  planned: PlannedRequest,
): ResponseState | undefined {
  const state = responses.get(response)
  if (!state || state.claimed || state.planned !== planned) return undefined
  state.claimed = true
  return state
}
/** Deliberate substring removal; no hashing of credentials and no unbounded regex. */
export function credentialRedactor(secret: string, minimum: number): (text: string) => string {
  return text => {
    // sendRequest accepts ASCII credentials only. A non-ASCII marker cannot itself
    // contain a credential or join retained ASCII text into a credential fragment.
    let value = text.split(secret).join('█')
    if (secret.length >= minimum) {
      for (let n = 0; n <= secret.length - minimum; n++)
        value = value.split(secret.slice(n, n + minimum)).join('█')
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
      reportDiagnostic(resources.diagnostic, {
        kind: 'model_transport.queue_cancelled',
        level: 'info',
      })
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
      const statusCode = res.statusCode ?? 0
      if (statusCode >= 200 && statusCode < 300) {
        const response: RawResponse = Object.freeze(
          Object.assign(Object.create(null), {
            stopped,
            stop: () => {
              req.destroy()
            },
          }),
        )
        responses.set(response, { stream: res, statusCode, redact, planned, claimed: false })
        settle({ response })
        return
      }
      const headers: Record<string, string | readonly string[]> = {}
      for (const [key, value] of redactedEntries(Object.entries(res.headers), redact))
        if (value !== undefined)
          headers[key] = Array.isArray(value) ? Object.freeze(value.map(redact)) : redact(value)
      Object.freeze(headers)
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
              reportDiagnostic(resources.diagnostic, {
                kind: 'model_transport.error_body_limit',
                level: 'error',
              })
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
        const parsed = tooLarge ? undefined : strictObject(Buffer.concat(chunks).toString('utf8'))
        const raw = parsed ? redactObject(parsed, redact) : undefined
        const failed: TransportFailure = {
          source: 'http_status',
          statusCode,
          headers,
          ...(raw ? { upstreamError: { raw } } : { localError: 'upstream HTTP error' }),
        }
        settle({ failed })
      }
      void readError().catch(reject)
    })
    reportDiagnostic(resources.diagnostic, { kind: 'model_transport.send_started', level: 'info' })
    req.end(planned.serialized)
    if (signal.aborted) abort()
  })
}
