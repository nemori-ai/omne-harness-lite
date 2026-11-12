// One SSE response with one serial writer. Events and heartbeats go through the same queue, so a
// heartbeat never lands inside an event and the first event is always the one `open` was given
// (binding page「SSE 观察」「心跳」). The new address opens without a first event, adds its own
// headers, and bounds the events not yet written (#1249 spec 已定 6).
import type { ServerResponse } from 'node:http'

const HEARTBEAT = ': heartbeat\n\n'
const END = Symbol('end')
/** A queued text, and how many of its bytes count against the frame queue (a heartbeat: none). */
type Chunk = Readonly<{ text: string; frameBytes: number }> | typeof END
const encoder = new TextEncoder()

export class SseStream {
  readonly #res: ServerResponse
  readonly #heartbeatMs: number
  readonly #queue: Chunk[] = []
  readonly #closeListeners: (() => void)[] = []
  #writing = false
  #opened = false
  #ending = false
  #closed = false
  #heartbeat: NodeJS.Timeout | undefined
  #queuedFrameBytes = 0
  readonly finished: Promise<void>
  #resolveFinished: () => void = () => {}

  constructor(res: ServerResponse, heartbeatMs: number) {
    this.#res = res
    this.#heartbeatMs = heartbeatMs
    this.finished = new Promise(resolve => {
      this.#resolveFinished = resolve
    })
    // A client that left while the request was still being answered has already emitted `close`;
    // a listener added now would never fire. The stream starts closed instead, so a registration
    // made on it releases at once and no heartbeat is armed against a destroyed response.
    if (res.destroyed || res.writableEnded || res.socket?.destroyed === true) this.#onClosed()
    else res.once('close', () => this.#onClosed())
  }

  get closed(): boolean {
    return this.#closed
  }

  /** The bytes of the events handed to the writer and not yet written out. Heartbeats do not count. */
  get queuedFrameBytes(): number {
    return this.#queuedFrameBytes
  }

  /**
   * Writes the head and, when given, the first event. Nothing else can be queued before it.
   * Without a first event the head goes out at once and the heartbeat starts.
   */
  open(status: number, firstEvent?: string, headers: Readonly<Record<string, string>> = {}): void {
    if (this.#opened) throw new TypeError('server-entry: SSE stream opened twice')
    this.#opened = true
    if (this.#closed) return
    this.#res.writeHead(status, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store',
      ...headers,
    })
    if (firstEvent !== undefined) {
      this.#event(firstEvent)
      return
    }
    this.#res.flushHeaders()
    this.#armHeartbeat()
  }

  /** Queues one event after everything already queued. */
  event(text: string): void {
    if (!this.#opened) throw new TypeError('server-entry: SSE event before the first event')
    this.#event(text)
  }

  /** Ends the response after everything already queued. */
  end(): void {
    if (this.#ending) return
    this.#ending = true
    this.#enqueue(END)
  }

  onClose(listener: () => void): void {
    if (this.#closed) listener()
    else this.#closeListeners.push(listener)
  }

  #event(text: string): void {
    const chunk = `data: ${text}\n\n`
    this.#enqueue({ text: chunk, frameBytes: encoder.encode(chunk).byteLength })
  }

  #enqueue(chunk: Chunk): void {
    if (this.#closed) return
    if (chunk !== END) this.#queuedFrameBytes += chunk.frameBytes
    this.#queue.push(chunk)
    this.#pump()
  }

  #pump(): void {
    if (this.#writing || this.#closed) return
    const next = this.#queue.shift()
    if (next === undefined) return
    this.#clearHeartbeat()
    this.#writing = true
    if (next === END) {
      this.#res.end(() => this.#onClosed())
      return
    }
    this.#res.write(next.text, () => {
      this.#writing = false
      if (this.#closed) return
      this.#queuedFrameBytes -= next.frameBytes
      this.#armHeartbeat()
      this.#pump()
    })
  }

  #armHeartbeat(): void {
    this.#clearHeartbeat()
    if (this.#queue.length > 0 || this.#ending) return
    this.#heartbeat = setTimeout(() => {
      this.#heartbeat = undefined
      this.#enqueue({ text: HEARTBEAT, frameBytes: 0 })
    }, this.#heartbeatMs)
  }

  #clearHeartbeat(): void {
    if (this.#heartbeat === undefined) return
    clearTimeout(this.#heartbeat)
    this.#heartbeat = undefined
  }

  #onClosed(): void {
    if (this.#closed) return
    this.#closed = true
    this.#clearHeartbeat()
    this.#queue.length = 0
    this.#queuedFrameBytes = 0
    this.#resolveFinished()
    const listeners = this.#closeListeners.splice(0)
    for (const listener of listeners) listener()
  }
}
