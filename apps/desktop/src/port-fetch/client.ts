import {
  errorMessage,
  PortBusyError,
  PortClosedError,
  PortFetchTimeoutError,
  RemoteFetchError,
  type TimeoutPhase,
} from './errors.ts'
import { AckCoalescer, BodyPump, BodyReceiver, FlowWindow, ReceiveBudget } from './flow.ts'
import {
  ackCoalesce as parseAckCoalesce,
  type AckCoalesceOptions,
  chunkBytes,
  optionalTimeout,
  positiveInteger,
} from './options.ts'
import type { Port } from './ports.ts'
import {
  cap,
  DEFAULT_MAX_CONCURRENT_REQUESTS,
  DEFAULT_MAX_QUEUED_BYTES,
  DEFAULT_WINDOW_BYTES,
  errorFrame,
  LIMITS,
  parsePortMessage,
  PROTOCOL_VERSION,
  type HeaderPairs,
  type PortMessage,
} from './protocol.ts'
import { Counters, type PortStats } from './stats.ts'

export interface PortFetchOptions {
  windowBytes?: number
  maxChunkBytes?: number
  maxConcurrentRequests?: number
  maxQueuedBytes?: number
  ackCoalesce?: AckCoalesceOptions
  headersTimeoutMs?: number
  idleTimeoutMs?: number
  timeoutMs?: number
}

export type PortFetch = (request: Request) => Promise<Response>

export type PortFetchClient = PortFetch & { stats(): PortStats }

interface Pending {
  resolve: (response: Response) => void
  reject: (err: unknown) => void
  receiver?: BodyReceiver
  pump?: BodyPump
  window: FlowWindow
  finished: boolean
  settled: boolean
  timers: Map<TimeoutPhase, ReturnType<typeof setTimeout>>
  detachSignal: () => void
}

interface Config {
  windowBytes: number
  maxChunkBytes: number
  maxConcurrentRequests: number
  maxQueuedBytes: number
  coalesce: AckCoalescer | undefined
  headersTimeoutMs: number | undefined
  idleTimeoutMs: number | undefined
  timeoutMs: number | undefined
}

function readConfig(options: PortFetchOptions): Config {
  const windowBytes = positiveInteger('windowBytes', options.windowBytes, DEFAULT_WINDOW_BYTES)
  const ackCoalesce = parseAckCoalesce(options.ackCoalesce)
  return {
    windowBytes,
    maxChunkBytes: chunkBytes(options.maxChunkBytes, windowBytes),
    maxConcurrentRequests: positiveInteger(
      'maxConcurrentRequests',
      options.maxConcurrentRequests,
      DEFAULT_MAX_CONCURRENT_REQUESTS,
    ),
    maxQueuedBytes: positiveInteger(
      'maxQueuedBytes',
      options.maxQueuedBytes,
      DEFAULT_MAX_QUEUED_BYTES,
    ),
    coalesce: ackCoalesce ? new AckCoalescer(ackCoalesce) : undefined,
    headersTimeoutMs: optionalTimeout('headersTimeoutMs', options.headersTimeoutMs),
    idleTimeoutMs: optionalTimeout('idleTimeoutMs', options.idleTimeoutMs),
    timeoutMs: optionalTimeout('timeoutMs', options.timeoutMs),
  }
}

const abortReason = (signal: AbortSignal): Error =>
  signal.reason instanceof Error ? signal.reason : abortError()

/** One port's client side: the requests in flight and how each of them ends, exactly once. */
class Connection {
  readonly pending = new Map<number, Pending>()
  readonly counters = new Counters()
  readonly #port: Port
  readonly #config: Config
  readonly #budget: ReceiveBudget
  #nextId = 1
  #closed = false

  constructor(port: Port, config: Config) {
    this.#port = port
    this.#config = config
    this.#budget = new ReceiveBudget(config.maxQueuedBytes, this.counters)
    port.onMessage(value => this.#onFrame(value))
    port.onClose(() => {
      this.#closed = true
      for (const [id, entry] of this.pending) this.#fail(id, entry, new PortClosedError())
    })
    port.start?.()
  }

  readonly #send = (message: PortMessage): void => {
    this.#port.postMessage(message)
    this.counters.countSent(message)
  }

  #post(message: PortMessage): void {
    try {
      this.#send(message)
    } catch {}
  }

  #complete(id: number, entry: Pending): void {
    if (entry.finished) return
    entry.finished = true
    entry.pump?.cancel()
    entry.window.release()
    entry.receiver?.stopAcks()
    for (const timer of entry.timers.values()) clearTimeout(timer)
    entry.detachSignal()
    this.pending.delete(id)
  }

  #settle(entry: Pending): Pick<Pending, 'resolve' | 'reject'> {
    const { resolve, reject } = entry
    entry.settled = true
    entry.resolve = entry.reject = noop
    return { resolve, reject }
  }

  #fail(id: number, entry: Pending, err: unknown): void {
    if (entry.finished) return
    this.#complete(id, entry)
    if (entry.settled) entry.receiver?.error(err)
    else this.#settle(entry).reject(err)
  }

  #cancel(id: number, entry: Pending, reason: unknown, err: unknown): void {
    if (entry.finished) return
    this.#post({ type: 'cancel', id, reason: cap(errorMessage(reason), LIMITS.messageLength) })
    this.#fail(id, entry, err)
  }

  #protocolError(id: number, entry: Pending, reason: string): void {
    if (entry.finished) return
    this.counters.protocolErrors++
    this.#cancel(id, entry, reason, new RemoteFetchError(reason, { code: 'protocol' }))
  }

  #arm(id: number, entry: Pending, phase: TimeoutPhase, ms: number | undefined): void {
    if (ms === undefined || entry.finished) return
    const previous = entry.timers.get(phase)
    if (previous) clearTimeout(previous)
    const timeout = new PortFetchTimeoutError(ms, phase)
    entry.timers.set(
      phase,
      setTimeout(() => this.#cancel(id, entry, timeout, timeout), ms),
    )
  }

  #disarm(entry: Pending, phase: TimeoutPhase): void {
    const timer = entry.timers.get(phase)
    if (timer) clearTimeout(timer)
    entry.timers.delete(phase)
  }

  #onResponse(message: Extract<PortMessage, { type: 'response' }>, entry: Pending): void {
    const { id } = message
    if (entry.settled)
      return this.#protocolError(id, entry, 'A second response head arrived for the request')
    const receiver = new BodyReceiver({
      ack: bytes => this.#post({ type: 'ack', id, bytes }),
      onCancel: reason => this.#cancel(id, entry, reason, reason),
      onOverflow: () =>
        this.#protocolError(
          id,
          entry,
          `The response body queued more than ${this.#config.maxQueuedBytes} unread bytes`,
        ),
      budget: this.#budget,
      counters: this.counters,
      coalesce: this.#config.coalesce,
    })
    const headers = new Headers()
    for (const [name, value] of message.headers) headers.append(name, value)
    const response = new Response(message.hasBody ? receiver.stream : null, {
      status: message.status,
      statusText: message.statusText,
      headers,
    })
    const { resolve } = this.#settle(entry)
    entry.receiver = receiver
    this.#disarm(entry, 'headers')
    if (message.hasBody) this.#arm(id, entry, 'idle', this.#config.idleTimeoutMs)
    else this.#complete(id, entry)
    resolve(response)
  }

  #onBody(
    message: Extract<PortMessage, { type: 'response-chunk' | 'response-end' }>,
    entry: Pending,
  ): void {
    const { id } = message
    const chunk = message.type === 'response-chunk'
    if (!entry.receiver)
      return this.#protocolError(
        id,
        entry,
        chunk
          ? 'A response body chunk arrived before the response head'
          : 'The response body ended before the response head',
      )
    if (message.type === 'response-chunk') {
      entry.receiver.push(message.chunk)
      this.#arm(id, entry, 'idle', this.#config.idleTimeoutMs)
    } else {
      entry.receiver.end()
      this.#complete(id, entry)
    }
  }

  #onMessage(message: PortMessage, entry: Pending): void {
    switch (message.type) {
      case 'response':
        return this.#onResponse(message, entry)
      case 'response-chunk':
      case 'response-end':
        return this.#onBody(message, entry)
      case 'ack':
        return entry.window.ack(message.bytes)
      case 'error':
        return this.#fail(
          message.id,
          entry,
          new RemoteFetchError(message.message, { code: message.code, remoteName: message.name }),
        )
      default:
    }
  }

  #onFrame(value: unknown): void {
    const parsed = parsePortMessage(value, 'client')
    if (!parsed) {
      this.counters.ignoredFrames++
      return
    }
    if (!parsed.ok) {
      this.counters.invalidFrames++
      const entry = this.pending.get(parsed.id)
      if (entry) this.#protocolError(parsed.id, entry, parsed.reason)
      return
    }
    const { message } = parsed
    this.counters.countReceived(message)
    const entry = this.pending.get(message.id)
    if (!entry) return
    try {
      this.#onMessage(message, entry)
    } catch (err) {
      this.#cancel(
        message.id,
        entry,
        err,
        err instanceof Error ? err : new RemoteFetchError(errorMessage(err)),
      )
    }
  }

  /** Why a new request cannot start now, or `undefined` when it can. */
  #refusal(signal: AbortSignal): Error | undefined {
    const { maxConcurrentRequests, maxQueuedBytes } = this.#config
    if (this.#closed) return new PortClosedError('The port is closed')
    if (signal.aborted) return abortReason(signal)
    if (this.pending.size >= maxConcurrentRequests) {
      this.counters.busyRejections++
      return new PortBusyError(maxConcurrentRequests)
    }
    if (this.#budget.endedBytes > maxQueuedBytes) {
      this.counters.busyRejections++
      return new PortBusyError(maxConcurrentRequests, 'unread', maxQueuedBytes)
    }
    return undefined
  }

  #sendBody(id: number, entry: Pending, body: ReadableStream<Uint8Array>): void {
    try {
      entry.pump = new BodyPump(
        body,
        (chunk): PortMessage => ({ type: 'request-chunk', id, chunk }),
        (): PortMessage => ({ type: 'request-end', id }),
        this.#send,
        entry.window,
        this.#config.maxChunkBytes,
      )
    } catch (err) {
      return this.#cancel(id, entry, err, err)
    }
    entry.pump.done.catch((err: unknown) => {
      if (!entry.finished) this.#post(errorFrame(id, err, 'body-failed'))
      this.#fail(id, entry, err)
    })
  }

  #start(id: number, entry: Pending, request: Request): void {
    this.pending.set(id, entry)
    this.#arm(id, entry, 'headers', this.#config.headersTimeoutMs)
    this.#arm(id, entry, 'total', this.#config.timeoutMs)
    const hasBody = request.body !== null && request.method !== 'GET' && request.method !== 'HEAD'
    try {
      this.#send({
        type: 'request',
        id,
        v: PROTOCOL_VERSION,
        method: request.method,
        url: request.url,
        headers: headerPairs(request.headers),
        hasBody,
      })
    } catch (err) {
      return this.#fail(
        id,
        entry,
        err instanceof Error ? err : new PortClosedError(errorMessage(err)),
      )
    }
    if (hasBody && request.body) this.#sendBody(id, entry, request.body)
  }

  fetch(request: Request): Promise<Response> {
    const { signal } = request
    const refusal = this.#refusal(signal)
    if (refusal !== undefined) return Promise.reject(refusal)
    const id = this.#nextId++
    return new Promise<Response>((resolve, reject) => {
      const onAbort = (): void => this.#cancel(id, entry, signal.reason, abortReason(signal))
      signal.addEventListener('abort', onAbort, { once: true })
      const entry: Pending = {
        resolve,
        reject,
        window: new FlowWindow(this.#config.windowBytes, this.counters),
        finished: false,
        settled: false,
        timers: new Map(),
        detachSignal: () => signal.removeEventListener('abort', onAbort),
      }
      this.#start(id, entry, request)
    })
  }
}

export function createPortFetch(port: Port, options: PortFetchOptions = {}): PortFetchClient {
  const connection = new Connection(port, readConfig(options))
  const portFetch: PortFetch = request => connection.fetch(request)
  return Object.assign(portFetch, {
    stats: () => connection.counters.snapshot(connection.pending.size),
  })
}

function noop(): void {}

function headerPairs(headers: Headers): HeaderPairs {
  return [...headers]
}

function abortError(): Error {
  return new DOMException('The operation was aborted', 'AbortError')
}
