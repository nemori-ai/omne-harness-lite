import type { ClientRequest, IncomingHttpHeaders, IncomingMessage } from 'node:http'
import { request, type Agent } from 'node:https'
import type { Socket } from 'node:net'
import type { ConnectionCapacity, ConnectionReservation, ConsumedSeat } from './capacity.ts'
import type { IsolatedDiagnostics } from './diagnostics.ts'
import { closeSourceOnEarlyEnd } from './iteration.ts'
import { isPositiveInteger, isTimerDuration } from './limits.ts'
import { CONNECTION_CANCEL } from './pool-agent.ts'

export type TlsOptions = Readonly<{ ca: string | Buffer }>

/** The part of an exchange that the network resources keep while it is in flight. */
export type InFlightExchange = Pick<HttpExchange, 'stop' | 'stopped'>

/** What one exchange takes from the network resources. Nothing else of them is visible here. */
export interface ExchangeResources {
  readonly agent: Agent
  readonly tls: TlsOptions | undefined
  readonly diagnostics: IsolatedDiagnostics
  /** Every exchange registers itself here from its start until `stopped`. */
  readonly inFlight: Set<InFlightExchange>
  /** `true` once the resources close: no new exchange may start. */
  readonly closed: boolean
  /** Only a reservation of this capacity may start an exchange here. */
  readonly capacity: Pick<ConnectionCapacity, 'owns'>
}

export type ExchangeInput = Readonly<{
  url: URL
  /** Sent as given, the credential included. Names are HTTP tokens; values are printable ASCII. */
  headers: Readonly<Record<string, string>>
  /** The serialized request; `content-length` is its byte length. */
  body: Uint8Array
  /** A held reservation of the resources' capacity. The exchange consumes it and returns the slot after its physical end. */
  reservation: ConnectionReservation
  /**
   * Runs from the start until the request has a connected socket: a new one through its TLS
   * handshake, through the proxy's CONNECT, tunnel and TLS when proxied; a reused one ends it at
   * once. `null` disables it. At most `MAX_TIMER_MS`.
   */
  connectTimeoutMs: number | null
  /** A non-2xx body beyond this many bytes is dropped as a whole and the connection is closed. */
  maxErrorBodyBytes: number
}>

/** Why no request was sent. The reservation, if it was ours and still held, is back in the capacity. */
export type ExchangeRefusal =
  | 'resources-closed'
  | 'reservation-unusable'
  | 'cancelled'
  | 'invalid-url'
  | 'invalid-header'
  | 'invalid-body'
  | 'invalid-limit'

export type ExchangeStart =
  | Readonly<{ kind: 'started'; exchange: HttpExchange }>
  | Readonly<{ kind: 'refused'; reason: ExchangeRefusal }>

/** Copied from the response: no `undefined` entries, arrays kept as arrays. Package-internal. */
export type ResponseHeaders = Readonly<Record<string, string | readonly string[]>>

export interface ResponseBody {
  /**
   * Hands the body to its single reader. A second claim gets `undefined`. The reader ending
   * the iteration early, even before its first `next()`, destroys the response.
   */
  claim(): AsyncIterable<Uint8Array> | undefined
}

export type ErrorBody =
  | Readonly<{ kind: 'complete'; bytes: Uint8Array }>
  | Readonly<{ kind: 'too-large' }>
  | Readonly<{ kind: 'read-failed' }>

export type ExchangeResult =
  /** A 2xx response. The slot stays taken until the body is read to its end, stopped or failed. */
  | Readonly<{ kind: 'ok'; status: number; headers: ResponseHeaders; body: ResponseBody }>
  /** Any other status, 3xx included: nothing is followed. Settled after the physical end. */
  | Readonly<{ kind: 'http-error'; status: number; headers: ResponseHeaders; errorBody: ErrorBody }>
  /** The connection closed before any response, without a stop. */
  | Readonly<{ kind: 'connect-failed'; timeout: boolean }>
  /** The signal or `stop()` won: it can win until the physical stop completes. */
  | Readonly<{ kind: 'stopped'; responded: boolean }>

export interface HttpExchange {
  /** Settles once. It rejects only for a defect outside the closed result set. */
  readonly result: Promise<ExchangeResult>
  /** Asks for a physical stop. The request already sent is not recalled. Idempotent. */
  stop(): void
  /** Request and response are closed, the error body is read, and the slot is returned. */
  readonly stopped: Promise<void>
}

/**
 * The reader of a 2xx body sees this when the exchange was stopped locally before the body
 * reached its end: by `stop()`, by the cancel signal or by the close of the network resources.
 */
export class ResponseBodyStoppedError extends Error {
  constructor() {
    super('the exchange was stopped before the response body reached its end')
    this.name = 'ResponseBodyStoppedError'
  }
}

/**
 * The reader of a 2xx body sees this when the body ended before its end without a local stop:
 * the connection was reset or closed by the other side. `cause` is the failure Node reported.
 */
export class ResponseBodyReadError extends Error {
  constructor(cause: unknown) {
    super('the response body ended before its end', { cause })
    this.name = 'ResponseBodyReadError'
  }
}

/**
 * Sends one POST at once: after the return the request is on its way, with no await and no
 * queue in between. The caller must hold a reservation of the resources' capacity; a refusal
 * returns it. One call is one physical send: nothing is retried and no redirect is followed.
 * Any synchronous throw returns the held reservation first, and is the error reported even when
 * that return fails on a defective input.
 */
export function startExchange(
  resources: ExchangeResources,
  input: ExchangeInput,
  signal: AbortSignal,
): ExchangeStart {
  try {
    return begin(resources, input, signal)
  } catch (error) {
    returnIfHeld(resources, input)
    throw error
  }
}

function begin(
  resources: ExchangeResources,
  input: ExchangeInput,
  signal: AbortSignal,
): ExchangeStart {
  if (!(signal instanceof AbortSignal)) throw new TypeError('signal must be an AbortSignal')
  const refusal = refusalOf(resources, input, signal)
  if (refusal !== undefined) {
    returnIfHeld(resources, input)
    return { kind: 'refused', reason: refusal }
  }
  const consumed = input.reservation.consume()
  if (!('ok' in consumed)) return { kind: 'refused', reason: 'reservation-unusable' }
  return { kind: 'started', exchange: runExchange(resources, input, signal, consumed.ok) }
}

/**
 * Returns the reservation if it is ours and still held. A foreign or consumed one is not touched.
 * Total over any shape of `resources` and `input`: when the reservation cannot be read or the
 * resources have no capacity, nothing is returned and the error that led here stays the one
 * reported.
 */
function returnIfHeld(resources: ExchangeResources, input: ExchangeInput): void {
  try {
    const { reservation } = input
    if (resources.capacity.owns(reservation)) reservation.release()
  } catch {
    // A defective input or resources; the caller reports the error it already has.
  }
}

const HEADER_NAME = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/
const HEADER_VALUE = /^[\x20-\x7e]*$/

/** Total over any input shape: a caller without the types gets a refusal, not a throw. */
function refusalOf(
  resources: ExchangeResources,
  input: ExchangeInput,
  signal: AbortSignal,
): ExchangeRefusal | undefined {
  if (resources.closed) return 'resources-closed'
  if (signal.aborted) return 'cancelled'
  if (!isPlainHttpsUrl(input.url)) return 'invalid-url'
  if (!isHeaderRecord(input.headers)) return 'invalid-header'
  if (!(input.body instanceof Uint8Array)) return 'invalid-body'
  if (!isPositiveInteger(input.maxErrorBodyBytes)) return 'invalid-limit'
  if (input.connectTimeoutMs !== null && !isTimerDuration(input.connectTimeoutMs))
    return 'invalid-limit'
  if (!resources.capacity.owns(input.reservation)) return 'reservation-unusable'
  return undefined
}

/** `https:` with nothing but origin and path: no credentials, no query, no fragment. */
export function isPlainHttpsUrl(url: unknown): url is URL {
  return (
    url instanceof URL &&
    url.protocol === 'https:' &&
    url.username === '' &&
    url.password === '' &&
    url.search === '' &&
    url.hash === ''
  )
}

function isHeaderRecord(value: unknown): value is Readonly<Record<string, string>> {
  return isObject(value) && !Array.isArray(value) && Object.entries(value).every(isValidHeader)
}

function isValidHeader([name, value]: readonly [string, unknown]): boolean {
  return HEADER_NAME.test(name) && typeof value === 'string' && HEADER_VALUE.test(value)
}

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null
}

/**
 * The life of one exchange. `requesting`: sent, no response yet. `responding`: a 2xx result is
 * delivered; the body is with its reader. `reading-error`: a non-2xx body is being collected.
 * `concluding`: a natural outcome is known; a stop can still replace it. `stopping`: a stop
 * won. `defective`: a condition outside the result set. `closed`: everything is released.
 */
type Phase =
  | Readonly<{ kind: 'requesting' }>
  | Readonly<{ kind: 'responding' }>
  | Readonly<{ kind: 'reading-error'; status: number; headers: ResponseHeaders }>
  | Readonly<{ kind: 'concluding'; outcome: ExchangeResult }>
  | Readonly<{ kind: 'stopping'; responded: boolean }>
  | Readonly<{ kind: 'defective'; error: Error }>
  | Readonly<{ kind: 'closed' }>

/** The physical handles that must end before the exchange is closed. */
type OpenHandle = 'request' | 'response' | 'error-body'

function runExchange(
  resources: ExchangeResources,
  input: ExchangeInput,
  signal: AbortSignal,
  seat: ConsumedSeat,
): HttpExchange {
  const { diagnostics } = resources
  const result = deferred<ExchangeResult>()
  const stopped = deferred<void>()
  const open = new Set<OpenHandle>(['request'])
  let phase: Phase = { kind: 'requesting' }
  let response: IncomingMessage | undefined
  let clearConnectTimeout: () => void = noop
  /** Reaches the pool: a connection still being built for this request ends with the request. */
  const connecting = new AbortController()
  /** Set by every local stop: `stop()`, the signal, or the close of the resources. */
  let stopRequested = false
  let req: ClientRequest

  const handle: HttpExchange = {
    result: result.promise,
    stop,
    stopped: stopped.promise,
  }

  try {
    const options = {
      method: 'POST',
      agent: resources.agent,
      ...(resources.tls === undefined ? {} : { ca: resources.tls.ca }),
      headers: { ...input.headers, 'content-length': String(input.body.byteLength) },
      [CONNECTION_CANCEL]: connecting.signal,
    }
    req = request(input.url, options)
    req.on('error', noop) // Every error ends in 'close', which decides the outcome.
    req.end(input.body)
  } catch (error) {
    seat.release()
    throw error
  }
  // The pool hands the socket, the response and the close over on later ticks, never here.
  startConnectTimeout()
  req.once('socket', onSocket)
  req.once('response', onResponse)
  req.once('close', onRequestClose)
  signal.addEventListener('abort', stop, { once: true })
  resources.inFlight.add(handle)
  diagnostics.emit({ kind: 'exchange-started', level: 'info' })
  return handle

  function startConnectTimeout(): void {
    if (input.connectTimeoutMs === null) return
    const timer = setTimeout(onConnectTimeout, input.connectTimeoutMs)
    clearConnectTimeout = () => {
      clearTimeout(timer)
      clearConnectTimeout = noop
    }
  }

  /**
   * A reused socket, and one that came through a proxy's tunnel, is connected when the request gets
   * it: the timeout ends here. A new direct socket is still connecting: it ends at its handshake.
   */
  function onSocket(socket: Socket): void {
    if (!socket.connecting) {
      clearConnectTimeout()
      return
    }
    const clearTimer = clearConnectTimeout
    const clear = (): void => {
      socket.removeListener('secureConnect', clear)
      clearTimer()
    }
    socket.once('secureConnect', clear)
    clearConnectTimeout = clear
  }

  function onConnectTimeout(): void {
    if (phase.kind !== 'requesting') return
    phase = { kind: 'concluding', outcome: { kind: 'connect-failed', timeout: true } }
    diagnostics.emit({ kind: 'connect-failed', level: 'error' })
    destroyRequest()
  }

  function onResponse(res: IncomingMessage): void {
    clearConnectTimeout()
    response = res
    open.add('response')
    res.on('error', noop) // The reader sees the error through its iteration; 'close' follows.
    res.once('close', onResponseClose)
    if (phase.kind !== 'requesting') {
      // A stop or the connect timeout already decided the outcome; only drain the socket.
      res.destroy()
      return
    }
    const status = res.statusCode
    if (status === undefined) {
      fail(new Error('client response without a status code'))
      return
    }
    const headers = copyHeaders(res.headers)
    if (status >= 200 && status < 300) {
      phase = { kind: 'responding' }
      result.resolve({ kind: 'ok', status, headers, body: createBody(res, () => stopRequested) })
      return
    }
    phase = { kind: 'reading-error', status, headers }
    open.add('error-body')
    readErrorBody(res, input.maxErrorBodyBytes, destroyConnection).then(onErrorBodyRead, fail)
  }

  function onErrorBodyRead(errorBody: ErrorBody): void {
    if (phase.kind === 'reading-error') {
      const { status, headers } = phase
      phase = { kind: 'concluding', outcome: { kind: 'http-error', status, headers, errorBody } }
      if (errorBody.kind === 'too-large')
        diagnostics.emit({ kind: 'error-body-too-large', level: 'error' })
    }
    open.delete('error-body')
    finishIfClosed()
  }

  function onRequestClose(): void {
    if (phase.kind === 'requesting') {
      phase = { kind: 'concluding', outcome: { kind: 'connect-failed', timeout: false } }
      diagnostics.emit({ kind: 'connect-failed', level: 'error' })
    }
    open.delete('request')
    finishIfClosed()
  }

  function onResponseClose(): void {
    open.delete('response')
    finishIfClosed()
  }

  function stop(): void {
    switch (phase.kind) {
      case 'requesting':
        phase = { kind: 'stopping', responded: false }
        break
      case 'reading-error':
        phase = { kind: 'stopping', responded: true }
        break
      case 'concluding':
        phase = { kind: 'stopping', responded: phase.outcome.kind === 'http-error' }
        break
      case 'responding':
        // The result is delivered; the stop only ends the body.
        break
      case 'stopping':
      case 'defective':
      case 'closed':
        return
      default: {
        const _exhaustive: never = phase
        return _exhaustive
      }
    }
    stopRequested = true
    destroyConnection()
  }

  /** A defect outside the result set: stop physically and reject the result at the close. */
  function fail(error: unknown): void {
    if (phase.kind === 'closed' || phase.kind === 'defective') return
    phase = { kind: 'defective', error: error instanceof Error ? error : new Error(String(error)) }
    open.delete('error-body')
    destroyConnection()
    finishIfClosed()
  }

  function destroyConnection(): void {
    response?.destroy()
    destroyRequest()
  }

  function destroyRequest(): void {
    connecting.abort()
    req.destroy()
  }

  function finishIfClosed(): void {
    if (open.size > 0 || phase.kind === 'closed') return
    const final = phase
    phase = { kind: 'closed' }
    clearConnectTimeout()
    signal.removeEventListener('abort', stop)
    resources.inFlight.delete(handle)
    seat.release()
    switch (final.kind) {
      case 'responding':
        break // Delivered with the response.
      case 'concluding':
        result.resolve(final.outcome)
        break
      case 'stopping':
        result.resolve({ kind: 'stopped', responded: final.responded })
        break
      case 'defective':
        result.reject(final.error)
        break
      case 'requesting':
      case 'reading-error':
        // 'request' and 'error-body' leave `open` only after their transition above.
        result.reject(new Error(`exchange closed while ${final.kind}`))
        break
      default: {
        const _exhaustive: never = final
        return _exhaustive
      }
    }
    diagnostics.emit({ kind: 'exchange-stopped', level: 'info' })
    stopped.resolve()
  }
}

function createBody(res: IncomingMessage, stoppedLocally: () => boolean): ResponseBody {
  let unclaimed: IncomingMessage | undefined = res
  return {
    claim() {
      if (unclaimed === undefined) return undefined
      const stream = unclaimed
      unclaimed = undefined
      return closeSourceOnEarlyEnd(readBytes(stream, stoppedLocally), () => stream.destroy())
    },
  }
}

/** Ending the iteration early destroys the response, so the exchange still closes. */
async function* readBytes(
  stream: IncomingMessage,
  stoppedLocally: () => boolean,
): AsyncGenerator<Uint8Array, void, undefined> {
  const source: AsyncIterator<unknown> = stream[Symbol.asyncIterator]()
  try {
    for (;;) {
      const step = await nextChunk(source, stoppedLocally)
      if (step.done === true) return
      if (!(step.value instanceof Uint8Array)) throw new Error('response body chunk is not bytes')
      yield step.value
    }
  } finally {
    await source.return?.()
  }
}

/** A failure of the stream is reported by its cause: a local stop, or the other side. */
async function nextChunk(
  source: AsyncIterator<unknown>,
  stoppedLocally: () => boolean,
): Promise<IteratorResult<unknown>> {
  try {
    return await source.next()
  } catch (error) {
    throw stoppedLocally() ? new ResponseBodyStoppedError() : new ResponseBodyReadError(error)
  }
}

/**
 * Collects a non-2xx body up to `limit` bytes. Beyond the limit the connection is closed and
 * everything read is dropped. A stream failure is a read failure; a non-byte chunk is a defect.
 */
async function readErrorBody(
  res: IncomingMessage,
  limit: number,
  closeConnection: () => void,
): Promise<ErrorBody> {
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for await (const chunk of res) {
      if (!(chunk instanceof Uint8Array)) throw new NonByteChunk()
      total += chunk.byteLength
      if (total > limit) {
        closeConnection()
        return { kind: 'too-large' }
      }
      chunks.push(chunk)
    }
  } catch (error) {
    if (error instanceof NonByteChunk) throw new Error('error body chunk is not bytes')
    return { kind: 'read-failed' }
  }
  return { kind: 'complete', bytes: concat(chunks, total) }
}

class NonByteChunk extends Error {}

function concat(chunks: readonly Uint8Array[], total: number): Uint8Array {
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

/** Node marks absence with `undefined`; arrays stay arrays. Own data properties only. */
function copyHeaders(headers: IncomingHttpHeaders): ResponseHeaders {
  const entries: [string, string | readonly string[]][] = []
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined) continue
    entries.push([name, typeof value === 'string' ? value : Object.freeze([...value])])
  }
  return Object.freeze(Object.fromEntries(entries))
}

function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason: Error) => void
} {
  let resolve: (value: T) => void = noop
  let reject: (reason: Error) => void = noop
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve
    reject = onReject
  })
  return { promise, resolve, reject }
}

function noop(): void {}
