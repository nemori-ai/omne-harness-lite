import { AckCoalescer, BodyPump, BodyReceiver, FlowWindow, ReceiveBudget } from './flow.ts'
import {
  ackCoalesce as parseAckCoalesce,
  type AckCoalesceOptions,
  chunkBytes,
  positiveInteger,
} from './options.ts'
import type { Port } from './ports.ts'
import {
  DEFAULT_MAX_CONCURRENT_REQUESTS,
  DEFAULT_MAX_QUEUED_BYTES,
  DEFAULT_WINDOW_BYTES,
  errorFrame,
  parsePortMessage,
  type PortErrorCode,
  type PortMessage,
  type RequestHeadMessage,
} from './protocol.ts'
import { Counters, type PortStats } from './stats.ts'

export interface ServePortOptions {
  windowBytes?: number | undefined
  maxChunkBytes?: number
  maxConcurrentRequests?: number
  maxQueuedBytes?: number
  ackCoalesce?: AckCoalesceOptions
}

export interface PortServer {
  close(): void
  stats(): PortStats
}

interface InFlight {
  controller: AbortController
  hasBody: boolean
  bodyEnded: boolean
  receiver?: BodyReceiver
  pump?: BodyPump | undefined
  window: FlowWindow
  cancelled: boolean
}

class ServeError extends Error {
  readonly code: PortErrorCode
  constructor(message: string, code: PortErrorCode) {
    super(message)
    this.code = code
  }
}

async function attempt<T>(code: PortErrorCode, step: () => T | Promise<T>): Promise<T> {
  try {
    return await step()
  } catch (err) {
    if (err instanceof ServeError) throw err
    throw coded(err, code)
  }
}

function coded(err: unknown, code: PortErrorCode): ServeError {
  const wrapped = new ServeError(err instanceof Error ? err.message : String(err), code)
  if (err instanceof Error) wrapped.name = err.name
  return wrapped
}

type Handler = (request: Request) => Response | Promise<Response>

interface Config {
  windowBytes: number
  maxChunkBytes: number
  maxConcurrentRequests: number
  maxQueuedBytes: number
  coalesce: AckCoalescer | undefined
}

function readConfig(options: ServePortOptions): Config {
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
  }
}

const isRequestFrame = (value: unknown): boolean =>
  typeof value === 'object' && value !== null && 'type' in value && value.type === 'request'

type BodyFrame = Extract<PortMessage, { type: 'request-chunk' | 'request-end' }>

const BODY_ERRORS = {
  'request-chunk': {
    ended: 'A request body chunk arrived after its end',
    none: 'A body chunk arrived for a request without one',
  },
  'request-end': {
    ended: 'The request body ended twice',
    none: 'A body end arrived for a request without one',
  },
} as const

/** One port's server side: the requests in flight and how each of them ends, exactly once. */
class Serving {
  readonly inFlight = new Map<number, InFlight>()
  readonly counters = new Counters()
  readonly #port: Port
  readonly #fetch: Handler
  readonly #config: Config
  readonly #budget: ReceiveBudget
  readonly #unsubscribe: (() => void)[]

  constructor(port: Port, fetch: Handler, config: Config) {
    this.#port = port
    this.#fetch = fetch
    this.#config = config
    this.#budget = new ReceiveBudget(config.maxQueuedBytes, this.counters)
    this.#unsubscribe = [
      port.onMessage(value => this.#onFrame(value)),
      port.onClose(() => this.#closeAll(new Error('The port closed'), false)),
    ]
    port.start?.()
  }

  close(): void {
    this.#closeAll(new Error('The server closed'), true)
    for (const unsubscribe of this.#unsubscribe) unsubscribe()
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

  #abort(id: number, entry: InFlight, reason: unknown): void {
    if (entry.cancelled) return
    entry.cancelled = true
    entry.pump?.cancel(reason)
    entry.window.release()
    entry.controller.abort(reason)
    entry.receiver?.error(reason)
    this.inFlight.delete(id)
  }

  #complete(id: number, entry: InFlight): void {
    if (entry.cancelled) return
    entry.cancelled = true
    entry.window.release()
    entry.receiver?.finish()
    this.inFlight.delete(id)
  }

  #fail(id: number, entry: InFlight, err: unknown, code: PortErrorCode): void {
    if (entry.cancelled) return
    this.#post(errorFrame(id, err, code))
    this.#abort(id, entry, err)
  }

  #protocolError(id: number, entry: InFlight | undefined, reason: string): void {
    this.counters.protocolErrors++
    const err = new ServeError(reason, 'protocol')
    err.name = 'ProtocolError'
    if (entry) this.#fail(id, entry, err, 'protocol')
    else this.#post(errorFrame(id, err, 'protocol'))
  }

  #closeAll(reason: unknown, notify: boolean): void {
    for (const [id, entry] of this.inFlight) {
      if (notify) this.#post(errorFrame(id, reason, 'closed'))
      this.#abort(id, entry, reason)
    }
  }

  #receiverFor(id: number, entry: InFlight): BodyReceiver {
    return new BodyReceiver({
      ack: bytes => this.#post({ type: 'ack', id, bytes }),
      onCancel: () => {},
      onOverflow: () =>
        this.#protocolError(
          id,
          entry,
          `The request body queued more than ${this.#config.maxQueuedBytes} unread bytes`,
        ),
      budget: this.#budget,
      counters: this.counters,
      coalesce: this.#config.coalesce,
    })
  }

  /** The handler's response, or `undefined` when the request was cancelled meanwhile. */
  async #respond(head: RequestHeadMessage, entry: InFlight): Promise<Response | undefined> {
    const response = await attempt('fetch-failed', () => {
      const body = entry.receiver?.stream ?? null
      return this.#fetch(
        new Request(head.url, {
          method: head.method,
          headers: head.headers,
          body,
          signal: entry.controller.signal,
          ...(body ? { duplex: 'half' } : {}),
        } as RequestInit),
      )
    })
    if (entry.cancelled) {
      await response.body?.cancel().catch(() => {})
      return undefined
    }
    if (!(response.status >= 200 && response.status <= 599)) {
      await response.body?.cancel().catch(() => {})
      throw new ServeError(
        `The response status ${response.status} cannot be sent over the port`,
        'invalid-status',
      )
    }
    if (response.body?.locked)
      throw new ServeError('The response body is locked by another reader', 'body-failed')
    return response
  }

  async #serve(head: RequestHeadMessage, entry: InFlight): Promise<void> {
    const { id } = head
    if (head.hasBody && head.method !== 'GET' && head.method !== 'HEAD')
      entry.receiver = this.#receiverFor(id, entry)
    const response = await this.#respond(head, entry)
    if (response === undefined) return
    entry.pump = response.body
      ? new BodyPump(
          response.body,
          (chunk): PortMessage => ({ type: 'response-chunk', id, chunk }),
          (): PortMessage => ({ type: 'response-end', id }),
          this.#send,
          entry.window,
          this.#config.maxChunkBytes,
        )
      : undefined
    this.#post({
      type: 'response',
      id,
      status: response.status,
      statusText: response.statusText,
      headers: [...response.headers],
      hasBody: entry.pump !== undefined,
    })
    const pump = entry.pump
    if (pump) await attempt('body-failed', () => pump.done)
    this.#complete(id, entry)
  }

  async #handle(head: RequestHeadMessage, entry: InFlight): Promise<void> {
    try {
      await this.#serve(head, entry)
    } catch (err) {
      this.#fail(head.id, entry, err, err instanceof ServeError ? err.code : 'fetch-failed')
    }
  }

  #start(head: RequestHeadMessage): void {
    const { id } = head
    const { maxConcurrentRequests } = this.#config
    const existing = this.inFlight.get(id)
    if (existing)
      return this.#protocolError(id, existing, `A request with id ${id} is already in flight`)
    if (this.inFlight.size >= maxConcurrentRequests) {
      this.counters.busyRejections++
      const busy = new ServeError(
        `${maxConcurrentRequests} requests are already being served`,
        'busy',
      )
      return this.#post(errorFrame(id, busy, 'busy'))
    }
    const entry: InFlight = {
      controller: new AbortController(),
      hasBody: head.hasBody,
      bodyEnded: false,
      window: new FlowWindow(this.#config.windowBytes, this.counters),
      cancelled: false,
    }
    this.inFlight.set(id, entry)
    void this.#handle(head, entry)
  }

  #onBody(message: BodyFrame, entry: InFlight): void {
    const { id } = message
    if (!entry.hasBody || entry.bodyEnded)
      return this.#protocolError(
        id,
        entry,
        BODY_ERRORS[message.type][entry.hasBody ? 'ended' : 'none'],
      )
    if (message.type === 'request-end') {
      entry.bodyEnded = true
      entry.receiver?.end()
    } else if (entry.receiver) entry.receiver.push(message.chunk)
    else this.#post({ type: 'ack', id, bytes: message.chunk.byteLength })
  }

  #onMessage(message: PortMessage): void {
    if (message.type === 'request') return this.#start(message)
    const { id } = message
    const entry = this.inFlight.get(id)
    if (!entry) return
    switch (message.type) {
      case 'request-chunk':
      case 'request-end':
        return this.#onBody(message, entry)
      case 'ack':
        return entry.window.ack(message.bytes)
      case 'cancel':
        return this.#abort(
          id,
          entry,
          new DOMException(message.reason ?? 'The client cancelled the request', 'AbortError'),
        )
      case 'error':
        return this.#abort(id, entry, new Error(message.message))
      default:
    }
  }

  #onFrame(value: unknown): void {
    const parsed = parsePortMessage(value, 'server')
    if (!parsed) {
      this.counters.ignoredFrames++
      return
    }
    if (!parsed.ok) {
      this.counters.invalidFrames++
      const entry = this.inFlight.get(parsed.id)
      if (entry || isRequestFrame(value)) this.#protocolError(parsed.id, entry, parsed.reason)
      return
    }
    const { message } = parsed
    this.counters.countReceived(message)
    try {
      this.#onMessage(message)
    } catch (err) {
      const entry = this.inFlight.get(message.id)
      if (entry) this.#fail(message.id, entry, err, 'protocol')
    }
  }
}

export function servePort(port: Port, fetch: Handler, options: ServePortOptions = {}): PortServer {
  const serving = new Serving(port, fetch, readConfig(options))
  return {
    close: () => serving.close(),
    stats: () => serving.counters.snapshot(serving.inFlight.size),
  }
}
