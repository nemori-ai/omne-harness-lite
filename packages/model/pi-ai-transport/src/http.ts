import { Agent, request, type RequestOptions } from 'node:https'
import type { IncomingMessage } from 'node:http'
import type { Socket } from 'node:net'
import {
  createCredentialRedactionPolicy,
  type CredentialRedactionConfig,
  type BoundCredentialRedaction,
  type TransportFailure,
  type SendResult,
  type TransportExecutionDiagnostics,
} from '@omne-harness-lite/model-request-runtime'
import { isPlannedRequest, type PlannedRequest } from './plan.ts'
import { strictObject } from './json.ts'
import {
  ownCredentialConfiguration,
  processedObject,
  CredentialProcessingFailure,
} from './credential-policy.ts'
import type { RawHeaders } from '@omne-harness-lite/model-response'
import { reportDiagnostic, reportExecutionDiagnostic } from './diagnostics.ts'

export interface TransportPolicy {
  readonly maxConnections: number
  readonly idleConnectionTimeoutMs: number
  readonly connectTimeoutMs: number | null
  readonly maxErrorBodyBytes: number
  readonly maxSseEventBytes: number
  readonly credentialRedaction: CredentialRedactionConfig
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
  readonly statusCode: number | undefined
  readonly credentialPolicy: BoundCredentialRedaction
  readonly planned: PlannedRequest
  readonly executionDiagnostics: TransportExecutionDiagnostics | undefined
  claimed: boolean
}
const responses = new WeakMap<RawResponse, ResponseState>()
/** Package-internal, single-reader claim; never exported from the public entry. */
export function claimResponse(
  response: RawResponse,
  planned: PlannedRequest,
  diagnostics?: TransportExecutionDiagnostics,
): ResponseState | undefined {
  const state = responses.get(response)
  if (
    !state ||
    state.claimed ||
    state.planned !== planned ||
    state.executionDiagnostics !== diagnostics
  )
    return undefined
  state.claimed = true
  return state
}
export async function sendRequest(
  planned: PlannedRequest,
  credential: string,
  signal: AbortSignal,
  resources: NetworkResources,
  diagnostics?: TransportExecutionDiagnostics,
): Promise<SendResult<RawResponse>> {
  const execution = (fact: Parameters<TransportExecutionDiagnostics['record']>[0]) =>
    reportExecutionDiagnostic(diagnostics, fact)
  const instance = (event: Diagnostic) => {
    if (!diagnostics) reportDiagnostic(resources.diagnostic, event)
  }
  if (!validSendInput(planned, credential, signal)) return { rejected: 'invalidInput' }
  const binding = bindCredential()
  if (!('ok' in binding)) return binding
  const bound = binding.ok
  const connectTimeoutMs = resources.policy.connectTimeoutMs
  const maxErrorBodyBytes = resources.policy.maxErrorBodyBytes
  if (resources.closed()) return { rejected: 'unavailable' }
  if (signal.aborted) return { aborted: true }
  execution({ stage: 'queue', outcome: 'waiting', facts: { kind: 'transport' } })
  const release = await resources.acquireConnection(signal)
  if (!release) {
    return queueRefusal()
  }
  execution({ stage: 'queue', outcome: 'accepted', facts: { kind: 'transport' } })
  if (signal.aborted || resources.closed()) {
    release()
    return signal.aborted ? { aborted: true } : { rejected: 'unavailable' }
  }
  return new Promise((resolve, reject) => {
    let resolved = false,
      attached = false,
      received = false,
      requestClosed = false,
      responseClosed = true,
      callbackFinished = true,
      disposeConnect = () => {}
    let responseStream: IncomingMessage | undefined
    let stoppedDone = () => {},
      networkDone = () => {}
    const stopped = new Promise<void>(done => {
      stoppedDone = done
    })
    const networkClosed = new Promise<void>(done => {
      networkDone = done
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
        if ('failed' in result)
          execution({
            stage: 'send',
            outcome: 'failed',
            facts: { kind: 'transport' },
          })
        else if ('aborted' in result)
          execution({ stage: 'send', outcome: 'stopped', facts: { kind: 'transport' } })
        resolve(result)
      }
    }
    let released = false
    const finishStop = () => {
      if (!requestClosed || !responseClosed) return
      networkDone()
      if (!callbackFinished || released) return
      released = true
      signal.removeEventListener('abort', abort)
      resources.active.delete(stopped)
      release()
      stoppedDone()
    }
    const stop = () => {
      responseStream?.destroy()
      req.destroy()
    }
    let cancelReported = false
    const abort = () => {
      if (!cancelReported) {
        cancelReported = true
        execution({ stage: 'send', outcome: 'cancel_requested', facts: { kind: 'transport' } })
      }
      stop()
    }
    signal.addEventListener('abort', abort, { once: true })
    req.once('finish', () =>
      execution({
        stage: 'send',
        outcome: 'accepted',
        facts: { kind: 'transport', touch: 'touched' },
      }),
    )
    req.once('socket', onSocket)
    req.once('close', onRequestClose)
    req.once('error', () => {
      // Once a response exists its owner alone settles, preserving actual HTTP facts and H.
      if (received) stop()
    })
    req.once('response', onResponse)
    execution({ stage: 'send', outcome: 'started', facts: { kind: 'transport' } })
    instance({ kind: 'model_transport.send_started', level: 'info' })
    req.end(planned.serialized)
    if (signal.aborted) abort()

    function onSocket(socket: Socket): void {
      attached = true
      if (connectTimeoutMs !== null && socket.connecting) {
        const timer = setTimeout(
          () => req.destroy(new Error('connection timeout')),
          connectTimeoutMs,
        )
        const dispose = () => {
          clearTimeout(timer)
          socket.removeListener('secureConnect', dispose)
        }
        disposeConnect = dispose
        socket.once('secureConnect', dispose)
      }
    }

    function onRequestClose(): void {
      disposeConnect()
      requestClosed = true
      finishStop()
      // destroy() without an Error emits close, not necessarily error.
      if (!received)
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
    }

    function onResponse(res: IncomingMessage): void {
      received = true
      responseStream = res
      responseClosed = false
      callbackFinished = false
      res.once('close', () => {
        responseClosed = true
        finishStop()
      })
      disposeConnect()
      const statusCode = res.statusCode
      if (statusCode !== undefined)
        execution({
          stage: 'send',
          outcome: 'completed',
          facts: { kind: 'transport', httpStatus: statusCode },
        })
      const httpFailure = statusCode !== undefined && !(statusCode >= 200 && statusCode < 300)
      const { rawHeaders, invalidHeaders } = captureHeaders()
      const retained = rawHeaders === undefined ? {} : { rawHeaders }
      const actualFailure = (localError: string): TransportFailure =>
        httpFailure
          ? { source: 'http_status', statusCode, localError }
          : { source: 'local', localError }
      if (!invalidHeaders && statusCode !== undefined && !httpFailure) {
        const response: RawResponse = Object.freeze(
          Object.assign(Object.create(null), { stopped, stop }),
        )
        responses.set(response, {
          stream: res,
          statusCode,
          credentialPolicy: bound,
          planned,
          executionDiagnostics: diagnostics,
          claimed: false,
        })
        callbackFinished = true
        finishStop()
        settle({ response, ...retained })
        return
      }
      const readError = async (): Promise<SendResult<RawResponse>> => {
        if (invalidHeaders || statusCode === undefined) {
          stop()
          await networkClosed
          return {
            failed: actualFailure(invalidHeaders ? 'headers_policy' : 'missing_http_status'),
            ...retained,
          }
        }
        const chunks: Buffer[] = []
        let bytes = 0,
          tooLarge = false,
          readFailed = false
        try {
          for await (const chunk of res) {
            if (!Buffer.isBuffer(chunk)) {
              readFailed = true
              stop()
              break
            }
            bytes += chunk.length
            if (bytes > maxErrorBodyBytes) {
              tooLarge = true
              stop()
              instance({
                kind: 'model_transport.error_body_limit',
                level: 'error',
              })
              break
            }
            chunks.push(chunk)
          }
        } catch {
          readFailed = true
          stop()
        }
        await networkClosed
        if (signal.aborted) return { aborted: true, ...retained }
        const parsed =
          tooLarge || readFailed ? undefined : strictObject(Buffer.concat(chunks).toString('utf8'))
        const failed = errorBodyFailure(statusCode)
        return { failed, ...retained }

        function errorBodyFailure(statusCode: number): TransportFailure {
          let failed: TransportFailure = actualFailure(
            readFailed ? 'error_body_read' : 'upstream HTTP error',
          )
          if (parsed) {
            try {
              failed = {
                source: 'http_status',
                statusCode,
                upstreamError: { raw: processedObject(bound, parsed, 'error_body_policy') },
              }
            } catch (error) {
              if (!(error instanceof CredentialProcessingFailure)) throw error
              failed = actualFailure(error.stage)
              instance({
                kind: error.rejected
                  ? 'model_transport.error_body_policy_rejected'
                  : 'model_transport.error_body_policy_defect',
                level: 'error',
              })
            }
          }
          return failed
        }
      }
      void readError()
        .then(
          async result => {
            callbackFinished = true
            finishStop()
            await stopped
            // Cancellation can win until the error-body task and physical stop have finished.
            settle(signal.aborted ? { aborted: true, ...retained } : result)
          },
          error => {
            callbackFinished = true
            stop()
            finishStop()
            void stopped.then(() => reject(error), reject)
          },
        )
        .catch(reject)

      function captureHeaders(): { rawHeaders: RawHeaders | undefined; invalidHeaders: boolean } {
        let rawHeaders: RawHeaders | undefined,
          invalidHeaders = false
        // Node's undefined entries denote absence. Do not normalize the actual map or arrays.
        const headers: Record<string, string | readonly string[]> = Object.create(null)
        for (const [key, value] of Object.entries(res.headers))
          if (value !== undefined) headers[key] = value
        let captured
        try {
          captured = bound.headers(headers)
        } catch {
          instance({
            kind: 'model_transport.headers_policy_defect',
            level: 'error',
          })
        }
        if (captured) {
          if ('ok' in captured) rawHeaders = captured.ok
          else {
            invalidHeaders = true
            instance({
              kind: 'model_transport.headers_policy_rejected',
              level: 'error',
            })
          }
        }
        return { rawHeaders, invalidHeaders }
      }
    }
  })

  function bindCredential():
    { ok: BoundCredentialRedaction } | { rejected: 'invalidInput' } | { failed: TransportFailure } {
    // Admission and binding happen before the connection queue, including direct consumers.
    let credentialPolicy
    try {
      const config = ownCredentialConfiguration(resources.policy.credentialRedaction)
      credentialPolicy = createCredentialRedactionPolicy(config)
    } catch {
      return { rejected: 'invalidInput' }
    }
    let binding
    try {
      binding = credentialPolicy.bind(credential)
    } catch {
      instance({
        kind: 'model_transport.bind_policy_defect',
        level: 'error',
      })
      execution({ stage: 'send', outcome: 'failed', facts: { kind: 'transport' } })
      return { failed: { source: 'local', localError: 'bind_policy' } }
    }
    if ('rejected' in binding) return { rejected: 'invalidInput' }
    return { ok: binding.ok }
  }

  function queueRefusal(): SendResult<RawResponse> {
    execution({
      stage: 'queue',
      outcome: signal.aborted ? 'stopped' : 'unavailable',
      facts: { kind: 'transport', touch: 'queued' },
    })
    if (signal.aborted)
      instance({
        kind: 'model_transport.queue_cancelled',
        level: 'info',
      })
    return signal.aborted ? { aborted: true, queued: true } : { rejected: 'unavailable' }
  }
}

function validSendInput(planned: PlannedRequest, credential: string, signal: AbortSignal): boolean {
  if (
    !isPlannedRequest(planned) ||
    typeof credential !== 'string' ||
    !credential.trim() ||
    /[^\x20-\x7e]/.test(credential) ||
    !(signal instanceof AbortSignal)
  )
    return false
  return true
}
