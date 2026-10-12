import { createHash } from 'node:crypto'
import { Agent, request } from 'node:https'
import { TLSSocket } from 'node:tls'
import type { IncomingMessage } from 'node:http'
import { captureConfiguration } from './config.ts'
import { type PublicHealthOptions } from '@omne-harness-lite/governance-center-entry-https-json'
import type { HealthUnavailableReason } from '@omne-harness-lite/governance-center-entry-https-json'

type Response = {
  readonly kind: 'response'
  readonly body: Buffer
  readonly status: number | undefined
}
type Unavailable = { readonly kind: 'unavailable'; readonly reason: HealthUnavailableReason }
type WireResult = Response | Unavailable
export type TransportOutcome = WireResult & { readonly sendAttempted: boolean }

const HEADER_LIMIT = 16 * 1024
const BODY_LIMIT = 64 * 1024
const TRUST_ERROR_CODES = new Set([
  'CERT_HAS_EXPIRED',
  'CERT_NOT_YET_VALID',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_GET_ISSUER_CERT',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'ERR_TLS_CERT_ALTNAME_INVALID',
  'CERT_REVOKED',
  'CERT_SIGNATURE_FAILURE',
])

/** D038/D045: one captured request, no retry, owned until actual close. */
export async function sendRequest(
  options: PublicHealthOptions,
  body: Buffer,
): Promise<TransportOutcome> {
  const config = captureConfiguration(options)
  const signal = config.signal
  if (signal?.aborted === true)
    return { kind: 'unavailable', reason: 'cancelled', sendAttempted: false }

  return new Promise<TransportOutcome>((resolve, reject) => {
    const agent = new Agent({ keepAlive: false, maxCachedSessions: 0, proxyEnv: {} })
    let socket: TLSSocket | undefined
    let socketClosed = true
    let requestClosed = false
    let outcome: WireResult | undefined
    let sendAttempted = false
    let timer: ReturnType<typeof setTimeout> | undefined
    // ClientRequest.close 不等于 IncomingMessage.close；另等实际 socket.close。
    const maybeResolve = (): void => {
      if (outcome !== undefined && requestClosed && socketClosed)
        resolve({ ...outcome, sendAttempted })
    }
    const complete = (result: WireResult): void => {
      if (outcome !== undefined) return
      outcome = result
      clearTimeout(timer)
      signal?.removeEventListener('abort', cancel)
      req.destroy()
      socket?.destroy()
      agent.destroy()
      maybeResolve()
    }
    const cancel = (): void => complete({ kind: 'unavailable', reason: 'cancelled' })
    let req: ReturnType<typeof request>
    try {
      req = request(config.url, {
        agent,
        method: 'POST',
        minVersion: 'TLSv1.3',
        rejectUnauthorized: config.pin === undefined,
        ...(config.ca === undefined ? {} : { ca: config.ca }),
        maxHeaderSize: HEADER_LIMIT,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': body.length,
          Connection: 'close',
        },
      })
    } catch (error) {
      agent.destroy()
      reject(error)
      return
    }
    req.once('close', () => {
      requestClosed = true
      if (outcome === undefined) complete({ kind: 'unavailable', reason: 'connection' })
      maybeResolve()
    })
    req.on('error', (error: NodeJS.ErrnoException) => {
      complete({
        kind: 'unavailable',
        reason: TRUST_ERROR_CODES.has(error.code ?? '') ? 'trust' : 'connection',
      })
    })
    req.on('information', () => complete({ kind: 'unavailable', reason: 'response-framing' }))
    req.on('upgrade', (_response, upgraded) => {
      upgraded.destroy()
      complete({ kind: 'unavailable', reason: 'response-framing' })
    })
    req.once('socket', connected => {
      if (!(connected instanceof TLSSocket)) {
        connected.destroy()
        complete({ kind: 'unavailable', reason: 'connection' })
        return
      }
      socket = connected
      socketClosed = connected.closed
      connected.once('close', () => {
        socketClosed = true
        maybeResolve()
      })
      if (outcome !== undefined) {
        connected.destroy()
        return
      }
      connected.once('secureConnect', () => {
        if (outcome !== undefined) return
        if (config.pin !== undefined) {
          const certificate = connected.getPeerX509Certificate()
          const actual =
            certificate === undefined
              ? undefined
              : createHash('sha256')
                  .update(certificate.publicKey.export({ type: 'spki', format: 'der' }))
                  .digest('hex')
          if (actual !== config.pin) {
            complete({ kind: 'unavailable', reason: 'trust' })
            return
          }
        }
        // 唯一写入点：TLS及所选信任核实之后；没有 flushHeaders 或自动重发。
        sendAttempted = true
        try {
          req.end(body)
        } catch {
          complete({ kind: 'unavailable', reason: 'connection' })
        }
      })
    })
    req.once('response', response => collectResponse(response, complete))
    timer = setTimeout(() => complete({ kind: 'unavailable', reason: 'timeout' }), config.timeoutMs)
    signal?.addEventListener('abort', cancel, { once: true })
    // 覆盖订阅前发生的取消；取消也可能发生在 socket 分配之前。
    if (signal?.aborted === true) cancel()
  })
}

function collectResponse(response: IncomingMessage, complete: (value: WireResult) => void): void {
  response.on('error', () => complete({ kind: 'unavailable', reason: 'response-framing' }))
  response.once('aborted', () => complete({ kind: 'unavailable', reason: 'response-framing' }))
  const length = response.headers['content-length']
  if (
    response.httpVersion !== '1.1' ||
    typeof length !== 'string' ||
    !/^\d+$/.test(length) ||
    response.headers['transfer-encoding'] !== undefined
  ) {
    complete({ kind: 'unavailable', reason: 'response-framing' })
    return
  }
  const expected = Number(length)
  if (!Number.isSafeInteger(expected) || expected > BODY_LIMIT) {
    complete({ kind: 'unavailable', reason: 'response-limit' })
    return
  }
  let size = 0
  const chunks: Buffer[] = []
  response.on('data', (chunk: Buffer) => {
    size += chunk.length
    if (size > BODY_LIMIT) complete({ kind: 'unavailable', reason: 'response-limit' })
    else chunks.push(chunk)
  })
  response.once('end', () => {
    if (!response.complete || size !== expected) {
      complete({ kind: 'unavailable', reason: 'response-framing' })
      return
    }
    complete({ kind: 'response', body: Buffer.concat(chunks), status: response.statusCode })
  })
}
