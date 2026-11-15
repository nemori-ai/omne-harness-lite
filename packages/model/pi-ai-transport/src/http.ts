import type { ClientRequest, IncomingHttpHeaders, IncomingMessage } from 'node:http'
import { request, type Agent } from 'node:https'
import type { Socket } from 'node:net'
import type { ConnectionCapacity, ConnectionReservation, ConsumedSeat } from './capacity.ts'
import type { IsolatedDiagnostics } from './diagnostics.ts'
import { closeSourceOnEarlyEnd } from './iteration.ts'
import { isPositiveInteger, isTimerDuration } from './limits.ts'
import { CONNECTION_CANCEL } from './pool-agent.ts'

export type TlsOptions = Readonly<{ ca: string | Buffer }>

export type InFlightExchange = Pick<HttpExchange, 'stop' | 'stopped'>

export interface ExchangeResources {
  readonly agent: Agent
  readonly tls: TlsOptions | undefined
  readonly diagnostics: IsolatedDiagnostics
  readonly inFlight: Set<InFlightExchange>
  readonly closed: boolean
  readonly capacity: Pick<ConnectionCapacity, 'owns'>
}

export type ExchangeInput = Readonly<{
  url: URL
  headers: Readonly<Record<string, string>>
  body: Uint8Array
  reservation: ConnectionReservation
  connectTimeoutMs: number | null
  streamStallTimeoutMs?: number | undefined
  maxErrorBodyBytes: number
}>

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

export type ResponseHeaders = Readonly<Record<string, string | readonly string[]>>

export interface ResponseBody {
  claim(): AsyncIterable<Uint8Array> | undefined
  received(): boolean
}

export type ErrorBody =
  | Readonly<{ kind: 'complete'; bytes: Uint8Array }>
  | Readonly<{ kind: 'too-large' }>
  | Readonly<{ kind: 'read-failed' }>

export type ExchangeResult =
  | Readonly<{ kind: 'ok'; status: number; headers: ResponseHeaders; body: ResponseBody }>
  | Readonly<{ kind: 'http-error'; status: number; headers: ResponseHeaders; errorBody: ErrorBody }>
  | Readonly<{ kind: 'connect-failed'; timeout: boolean }>
  | Readonly<{ kind: 'stopped'; responded: boolean }>
  | Readonly<{ kind: 'stalled' }>

export interface HttpExchange {
  readonly result: Promise<ExchangeResult>
  stop(): void
  readonly stopped: Promise<void>
  requestMaySent(): boolean
}

export class ResponseBodyStoppedError extends Error {
  constructor() {
    super('the exchange was stopped before the response body reached its end')
    this.name = 'ResponseBodyStoppedError'
  }
}

export class ResponseBodyStalledError extends Error {
  constructor() {
    super('no response byte came within the stream stall timeout')
    this.name = 'ResponseBodyStalledError'
  }
}

export class ResponseBodyReadError extends Error {
  constructor(cause: unknown) {
    super('the response body ended before its end', { cause })
    this.name = 'ResponseBodyReadError'
  }
}

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

function returnIfHeld(resources: ExchangeResources, input: ExchangeInput): void {
  try {
    const { reservation } = input
    if (resources.capacity.owns(reservation)) reservation.release()
  } catch {}
}

const HEADER_NAME = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/
const HEADER_VALUE = /^[\x20-\x7e]*$/

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
  if (input.streamStallTimeoutMs !== undefined && !isTimerDuration(input.streamStallTimeoutMs))
    return 'invalid-limit'
  if (!resources.capacity.owns(input.reservation)) return 'reservation-unusable'
  return undefined
}

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

type Phase =
  | Readonly<{ kind: 'requesting' }>
  | Readonly<{ kind: 'responding' }>
  | Readonly<{ kind: 'reading-error'; status: number; headers: ResponseHeaders }>
  | Readonly<{ kind: 'concluding'; outcome: ExchangeResult }>
  | Readonly<{ kind: 'stopping'; responded: boolean }>
  | Readonly<{ kind: 'defective'; error: Error }>
  | Readonly<{ kind: 'closed' }>

type OpenHandle = 'request' | 'response' | 'error-body'

type LocalEnd = 'stop' | 'stall'

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
  let stallTimer: NodeJS.Timeout | undefined
  let watchedSocket: Socket | undefined
  const connecting = new AbortController()
  let localEnd: LocalEnd | undefined
  let req: ClientRequest
  /** Set once the request may have been written to a connected socket; it never goes back. */
  let requestMaySent = false

  const handle: HttpExchange = {
    result: result.promise,
    stop,
    stopped: stopped.promise,
    requestMaySent: () => requestMaySent,
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
    req.on('error', noop)
    req.end(input.body)
  } catch (error) {
    seat.release()
    throw error
  }
  // The pool hands the socket, the response and the close over on later ticks, never here.
  startConnectTimeout()
  armStall()
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

  function onSocket(socket: Socket): void {
    watchBytes(socket)
    if (!socket.connecting) {
      requestMaySent = true
      clearConnectTimeout()
      return
    }
    const clearTimer = clearConnectTimeout
    const clear = (): void => {
      socket.removeListener('secureConnect', clear)
      clearTimer()
    }
    socket.once('secureConnect', () => {
      requestMaySent = true
    })
    socket.once('secureConnect', clear)
    clearConnectTimeout = clear
  }

  function armStall(): void {
    if (input.streamStallTimeoutMs === undefined) return
    clearStall()
    stallTimer = setTimeout(onStall, input.streamStallTimeoutMs)
  }

  function clearStall(): void {
    if (stallTimer === undefined) return
    clearTimeout(stallTimer)
    stallTimer = undefined
  }

  function watchBytes(socket: Socket): void {
    if (input.streamStallTimeoutMs === undefined || phase.kind === 'closed') return
    watchedSocket = socket
    socket.on('data', onBytes)
  }

  function onBytes(): void {
    if (
      phase.kind === 'requesting' ||
      phase.kind === 'responding' ||
      phase.kind === 'reading-error'
    )
      armStall()
  }

  function onStall(): void {
    stallTimer = undefined
    if (localEnd !== undefined || response?.complete === true) return
    if (response !== undefined && response.readableLength > 0) {
      armStall()
      return
    }
    stallIn(phase)
  }

  function stallIn(current: Phase): void {
    switch (current.kind) {
      case 'requesting':
        return stallBeforeResponse()
      case 'responding':
        return stallInBody()
      case 'reading-error':
        return stallInErrorBody()
      case 'concluding':
      case 'stopping':
      case 'defective':
      case 'closed':
        return
      default: {
        const _exhaustive: never = current
        return _exhaustive
      }
    }
  }

  function stallBeforeResponse(): void {
    localEnd = 'stall'
    phase = { kind: 'concluding', outcome: { kind: 'stalled' } }
    destroyRequest()
  }

  function stallInBody(): void {
    localEnd = 'stall'
    destroyConnection()
  }

  function stallInErrorBody(): void {
    localEnd = 'stall'
    destroyConnection()
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
    res.on('error', noop)
    res.once('close', onResponseClose)
    if (phase.kind !== 'requesting') {
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
      result.resolve({ kind: 'ok', status, headers, body: createBody(res, () => localEnd) })
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
    if (localEnd === 'stall') return
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
    localEnd ??= 'stop'
    clearStall()
    destroyConnection()
  }

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
    clearStall()
    watchedSocket?.removeListener('data', onBytes)
    signal.removeEventListener('abort', stop)
    resources.inFlight.delete(handle)
    seat.release()
    switch (final.kind) {
      case 'responding':
        break
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

function createBody(res: IncomingMessage, localEnd: () => LocalEnd | undefined): ResponseBody {
  let unclaimed: IncomingMessage | undefined = res
  return {
    claim() {
      if (unclaimed === undefined) return undefined
      const stream = unclaimed
      unclaimed = undefined
      return closeSourceOnEarlyEnd(readBytes(stream, localEnd), () => stream.destroy())
    },
    received: () => res.complete,
  }
}

async function* readBytes(
  stream: IncomingMessage,
  localEnd: () => LocalEnd | undefined,
): AsyncGenerator<Uint8Array, void, undefined> {
  const source: AsyncIterator<unknown> = stream.iterator({ destroyOnReturn: false })
  try {
    for (;;) {
      const step = await nextChunk(source, localEnd)
      if (step.done === true) return
      if (!(step.value instanceof Uint8Array)) throw new Error('response body chunk is not bytes')
      yield step.value
    }
  } finally {
    await source.return?.().catch((error: unknown) => {
      stream.destroy()
      throw error
    })
    if (!stream.destroyed && !stream.readableEnded) {
      if (stream.complete && localEnd() === undefined) stream.resume()
      else stream.destroy()
    }
  }
}

async function nextChunk(
  source: AsyncIterator<unknown>,
  localEnd: () => LocalEnd | undefined,
): Promise<IteratorResult<unknown>> {
  try {
    return await source.next()
  } catch (error) {
    const end = localEnd()
    switch (end) {
      case 'stop':
        throw new ResponseBodyStoppedError()
      case 'stall':
        throw new ResponseBodyStalledError()
      case undefined:
        throw new ResponseBodyReadError(error)
      default: {
        const _exhaustive: never = end
        return _exhaustive
      }
    }
  }
}

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
