import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { chmod } from 'node:fs/promises'
import { readJsonStrict, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { prepareStateDirectory, type TenantBinding } from './state-layout.ts'
import { checkedTenantBinding } from './state-layout-values.ts'
import { parseSessionHostRequest, type SessionHostEndpoint } from './session-host-protocol.ts'
import {
  positivePolicy,
  readSessionBody,
  sessionHostAddress,
  SessionProtocolFailure,
} from './session-host-io.ts'

export interface SessionHostPolicy {
  readonly maxRequestBytes: number
  readonly maxResponseBytes: number
  readonly maxConnections: number
  readonly maxInFlight: number
  readonly requestTimeoutMs: number
  readonly headersTimeoutMs: number
  readonly idleTimeoutMs: number
  readonly checkIntervalMs: number
  readonly maxFailureRecords: number
  readonly maxHeaderBytes: number
}
export interface LocalSessionHost {
  readonly socketPath: string
  readonly stopAdmission: () => void
  /** Closes only its listener and requests. Borrowed Session and execution owners stay open. */
  readonly close: () => Promise<void>
}
interface HostOptions {
  readonly binding: TenantBinding
  readonly home: string
  readonly endpoint: SessionHostEndpoint
  readonly policy: SessionHostPolicy
  readonly diagnostic: (error: unknown) => void
}
export async function startLocalSessionHost(options: HostOptions): Promise<LocalSessionHost> {
  positivePolicy(options.policy, [
    'maxRequestBytes',
    'maxResponseBytes',
    'maxConnections',
    'maxInFlight',
    'requestTimeoutMs',
    'headersTimeoutMs',
    'idleTimeoutMs',
    'checkIntervalMs',
    'maxFailureRecords',
    'maxHeaderBytes',
  ])
  const binding = Object.freeze(checkedTenantBinding(options.binding))
  const address = sessionHostAddress(options.home, binding)
  await prepareStateDirectory(address.home, address.directory)
  const owned = new HttpSessionHost(
    Object.freeze({ ...options, binding, policy: Object.freeze({ ...options.policy }) }),
  )
  await owned.listen(address.socketPath)
  return Object.freeze({
    socketPath: address.socketPath,
    stopAdmission: owned.stopAdmission,
    close: owned.close,
  })
}
class HttpSessionHost {
  readonly server: ReturnType<typeof createServer>
  readonly work = new Set<Promise<void>>()
  readonly failures: unknown[] = []
  additionalFailures = 0
  admitting = true
  closing?: Promise<void>
  constructor(readonly options: HostOptions) {
    const p = options.policy
    this.server = createServer(
      {
        requestTimeout: p.requestTimeoutMs,
        headersTimeout: p.headersTimeoutMs,
        keepAliveTimeout: p.idleTimeoutMs,
        connectionsCheckingInterval: p.checkIntervalMs,
        maxHeaderSize: p.maxHeaderBytes,
      },
      (request, response) => this.accept(request, response),
    )
    this.server.maxConnections = p.maxConnections
    this.server.maxRequestsPerSocket = 1
    this.server.setTimeout(p.idleTimeoutMs)
  }
  async listen(socketPath: string) {
    await new Promise<void>((resolve, reject) => {
      const failed = (error: Error) => {
        this.server.off('listening', listened)
        reject(error)
      }
      const listened = () => {
        this.server.off('error', failed)
        resolve()
      }
      this.server.once('error', failed)
      this.server.once('listening', listened)
      this.server.listen(socketPath)
    })
    this.server.on('error', error => this.recordFailure(error))
    try {
      await chmod(socketPath, 0o600)
    } catch (error) {
      try {
        await this.close()
      } catch (closeError) {
        throw new AggregateError([error, closeError], 'session socket preparation and close failed')
      }
      throw error
    }
  }
  stopAdmission = () => {
    this.admitting = false
  }
  accept(request: IncomingMessage, response: ServerResponse): void {
    const admitted = this.admitting && this.work.size < this.options.policy.maxInFlight
    const task = Promise.resolve().then(() => this.handle(request, response, admitted))
    this.work.add(task)
    void task.then(
      () => this.work.delete(task),
      error => {
        this.work.delete(task)
        this.recordFailure(error)
        response.destroy()
      },
    )
  }
  async handle(
    request: IncomingMessage,
    response: ServerResponse,
    admitted: boolean,
  ): Promise<void> {
    try {
      this.checkAdmission(request, admitted)
      const text = await readSessionBody(request, this.options.policy.maxRequestBytes)
      const parsed = readJsonStrict(text)
      const packet = 'ok' in parsed ? parseSessionHostRequest(parsed.ok) : undefined
      if (!packet || !sameBinding(packet.binding, this.options.binding))
        throw new SessionProtocolFailure('invalidRequest', 400)
      if (!this.admitting) throw new SessionProtocolFailure('unavailable', 503)
      // Client disconnect never supplies a cancellation signal to this original operation.
      const result = await this.options.endpoint.execute(packet)
      const bytes = Buffer.from(writeJsonLossless({ format: 'omne-session-host/1', result }))
      if (bytes.length > this.options.policy.maxResponseBytes)
        throw new SessionProtocolFailure('responseTooLarge', 503)
      await sendResponse(response, 200, bytes)
    } catch (error) {
      const known = error instanceof SessionProtocolFailure
      if (!known) this.recordFailure(error)
      const status = known ? error.status : 500
      const reason = known ? error.reason : 'internalDefect'
      await sendResponse(
        response,
        status,
        Buffer.from(JSON.stringify({ format: 'omne-session-host/1', failure: reason })),
      )
    }
  }
  checkAdmission(request: IncomingMessage, admitted: boolean): void {
    if (!this.admitting || !admitted) throw new SessionProtocolFailure('unavailable', 503)
    if (
      request.method !== 'POST' ||
      request.url !== '/session' ||
      request.headers['content-type'] !== 'application/json' ||
      request.headers['content-encoding'] !== undefined
    )
      throw new SessionProtocolFailure('invalidRequest', 400)
    const length = request.headers['content-length']
    if (length !== undefined && BigInt(length) > BigInt(this.options.policy.maxRequestBytes))
      throw new SessionProtocolFailure('requestTooLarge', 413)
  }
  recordFailure(error: unknown): void {
    this.stopAdmission()
    this.retainFailure(error)
    try {
      this.options.diagnostic(error)
    } catch (diagnosticError) {
      this.retainFailure(diagnosticError)
    }
  }
  retainFailure(error: unknown): void {
    if (this.failures.length < this.options.policy.maxFailureRecords) this.failures.push(error)
    else this.additionalFailures++
  }
  close = (): Promise<void> => {
    if (this.closing) return this.closing
    this.stopAdmission()
    this.closing = this.finishClose()
    return this.closing
  }
  async finishClose(): Promise<void> {
    await new Promise<void>((resolve, reject) =>
      this.server.close(error => (error ? reject(error) : resolve())),
    )
    while (this.work.size) await Promise.allSettled([...this.work])
    if (this.failures.length)
      throw new AggregateError(
        this.failures,
        `session host closed with failures; additional failures: ${this.additionalFailures}`,
      )
  }
}
function sameBinding(left: TenantBinding, right: TenantBinding) {
  return (
    left.centerId === right.centerId &&
    left.tenant.organization === right.tenant.organization &&
    left.tenant.account === right.tenant.account
  )
}
function sendResponse(response: ServerResponse, status: number, body: Buffer): Promise<void> {
  if (response.destroyed) return Promise.resolve()
  return new Promise<void>((resolve, reject) => {
    const remove = () => {
      response.off('finish', finished)
      response.off('close', finished)
      response.off('error', failed)
    }
    const finished = () => {
      remove()
      resolve()
    }
    const failed = (error: Error) => {
      remove()
      reject(error)
    }
    response.once('finish', finished)
    response.once('close', finished)
    response.once('error', failed)
    response.writeHead(status, {
      'content-type': 'application/json',
      'content-length': body.length,
      connection: 'close',
    })
    response.end(body)
  })
}
