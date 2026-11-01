// One SSE response with one serial writer. Events and heartbeats go through the same queue, so a
// heartbeat never lands inside an event and the first event is always the one `open` was given
// (binding page「SSE 观察」「心跳」).
import type { ServerResponse } from 'node:http'

const HEARTBEAT = ': heartbeat\n\n'
const END = Symbol('end')
type Chunk = string | typeof END

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
  readonly finished: Promise<void>
  #resolveFinished: () => void = () => {}

  constructor(res: ServerResponse, heartbeatMs: number) {
    this.#res = res
    this.#heartbeatMs = heartbeatMs
    this.finished = new Promise(resolve => {
      this.#resolveFinished = resolve
    })
    res.once('close', () => this.#onClosed())
  }

  get closed(): boolean {
    return this.#closed
  }

  /** Writes the head and the first event. Nothing else can be queued before it. */
  open(status: number, firstEvent: string): void {
    if (this.#opened) throw new TypeError('server-entry: SSE stream opened twice')
    this.#opened = true
    this.#res.writeHead(status, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store',
    })
    this.#enqueue(`data: ${firstEvent}\n\n`)
  }

  /** Queues one event after everything already queued. */
  event(text: string): void {
    if (!this.#opened) throw new TypeError('server-entry: SSE event before the first event')
    this.#enqueue(`data: ${text}\n\n`)
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

  #enqueue(chunk: Chunk): void {
    if (this.#closed) return
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
    this.#res.write(next, () => {
      this.#writing = false
      if (this.#closed) return
      this.#armHeartbeat()
      this.#pump()
    })
  }

  #armHeartbeat(): void {
    this.#clearHeartbeat()
    if (this.#queue.length > 0 || this.#ending) return
    this.#heartbeat = setTimeout(() => {
      this.#heartbeat = undefined
      this.#enqueue(HEARTBEAT)
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
    this.#resolveFinished()
    const listeners = this.#closeListeners.splice(0)
    for (const listener of listeners) listener()
  }
}
