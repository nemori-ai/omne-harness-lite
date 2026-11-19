import type { AckCoalesceOptions } from './options.ts'
import type { PortMessage } from './protocol.ts'
import type { Counters } from './stats.ts'

export class FlowWindow {
  readonly windowBytes: number
  readonly #counters: Counters
  #unacked = 0
  #waiters: (() => void)[] = []

  constructor(windowBytes: number, counters: Counters) {
    this.windowBytes = windowBytes
    this.#counters = counters
  }

  async reserve(bytes: number): Promise<void> {
    if (this.#unacked + bytes > this.windowBytes && this.#unacked > 0) {
      const start =
        /* wall-clock: operation-timing -- measures the wait for flow-control credit */ performance.now()
      while (this.#unacked + bytes > this.windowBytes && this.#unacked > 0) {
        await new Promise<void>(resolve => this.#waiters.push(resolve))
      }
      this.#counters.creditWaitMs +=
        /* wall-clock: operation-timing -- measures the wait for flow-control credit */ performance.now() -
        start
    }
    this.#unacked += bytes
  }

  ack(bytes: number): void {
    if (bytes > this.#unacked) {
      this.#counters.acksClamped++
      this.#unacked = 0
    } else {
      this.#unacked -= bytes
    }
    this.#wake()
  }

  release(): void {
    this.#unacked = 0
    this.#wake()
  }

  #wake(): void {
    if (this.#waiters.length === 0) return
    const waiters = this.#waiters
    this.#waiters = []
    for (const wake of waiters) wake()
  }
}

export class BodyPump {
  readonly done: Promise<boolean>
  readonly #reader: ReadableStreamDefaultReader<Uint8Array>
  readonly #window: FlowWindow
  readonly #chunkBytes: number
  #cancelled = false

  constructor(
    body: ReadableStream<Uint8Array>,
    send: (chunk: Uint8Array) => PortMessage,
    end: () => PortMessage,
    post: (message: PortMessage) => void,
    window: FlowWindow,
    chunkBytes: number = window.windowBytes,
  ) {
    this.#reader = body.getReader()
    this.#window = window
    this.#chunkBytes = Math.min(chunkBytes, window.windowBytes)
    this.done = this.#run(send, end, post)
  }

  cancel(reason?: unknown): void {
    if (this.#cancelled) return
    this.#cancelled = true
    this.#window.release()
    void this.#reader
      .cancel(reason)
      .catch(() => {})
      .finally(() => this.#releaseLock())
  }

  async #run(
    send: (chunk: Uint8Array) => PortMessage,
    end: () => PortMessage,
    post: (message: PortMessage) => void,
  ): Promise<boolean> {
    try {
      for (;;) {
        const { done, value } = await this.#reader.read()
        if (this.#cancelled) return false
        if (done) {
          post(end())
          return true
        }
        for (let offset = 0; offset < value.byteLength; offset += this.#chunkBytes) {
          const length = Math.min(this.#chunkBytes, value.byteLength - offset)
          const chunk = new Uint8Array(length)
          chunk.set(value.subarray(offset, offset + length))
          await this.#window.reserve(length)
          if (this.#cancelled) return false
          post(send(chunk))
        }
      }
    } finally {
      if (!this.#cancelled) this.#releaseLock()
    }
  }

  #releaseLock(): void {
    try {
      this.#reader.releaseLock()
    } catch {}
  }
}

export interface EndedShare {
  bytes: number
}

export class ReceiveBudget {
  readonly maxBytes: number
  readonly #counters: Counters
  readonly #held = new Set<BodyReceiver>()
  readonly #collected =
    typeof FinalizationRegistry === 'function'
      ? new FinalizationRegistry<EndedShare>(share => this.#release(share.bytes, share))
      : undefined
  #endedBytes = 0

  constructor(maxBytes: number, counters: Counters) {
    this.maxBytes = maxBytes
    this.#counters = counters
  }

  add(bytes: number): void {
    const queued = (this.#counters.queuedBytes += bytes)
    if (queued > this.#counters.peakQueuedBytes) this.#counters.peakQueuedBytes = queued
  }

  get endedBytes(): number {
    return this.#endedBytes
  }

  ended(receiver: BodyReceiver, bytes: number): EndedShare | undefined {
    if (bytes === 0) return undefined
    this.#endedBytes += bytes
    const share = { bytes }
    this.#collected?.register(receiver, share, share)
    return share
  }

  remove(bytes: number, share?: EndedShare): void {
    if (bytes === 0) return
    this.#release(bytes, share)
  }

  #release(bytes: number, share: EndedShare | undefined): void {
    if (share) {
      bytes = Math.min(bytes, share.bytes)
      if (bytes === 0) return
      share.bytes -= bytes
      this.#endedBytes -= bytes
      if (share.bytes === 0) this.#collected?.unregister(share)
    }
    this.#counters.queuedBytes -= bytes
    if (this.#held.size > 0 && this.#counters.queuedBytes <= this.maxBytes) {
      const held = [...this.#held]
      this.#held.clear()
      for (const receiver of held) receiver.flushAcks()
    }
  }

  holds(receiver: BodyReceiver, backlog: number): boolean {
    if (backlog === 0 || this.#counters.queuedBytes <= this.maxBytes) {
      this.#held.delete(receiver)
      return false
    }
    if (!this.#held.has(receiver)) {
      this.#held.add(receiver)
      this.#counters.acksWithheld++
    }
    return true
  }

  forget(receiver: BodyReceiver): void {
    this.#held.delete(receiver)
  }
}

export class AckCoalescer {
  readonly bytes: number
  readonly delayMs: number
  readonly #due = new Set<BodyReceiver>()
  #timer: ReturnType<typeof setTimeout> | undefined

  constructor({ bytes, delayMs }: AckCoalesceOptions) {
    this.bytes = bytes
    this.delayMs = delayMs
  }

  schedule(receiver: BodyReceiver): void {
    this.#due.add(receiver)
    if (this.#timer !== undefined) return
    this.#timer = setTimeout(this.#fire, this.delayMs)
    if (typeof this.#timer === 'object' && typeof this.#timer.unref === 'function')
      this.#timer.unref()
  }

  forget(receiver: BodyReceiver): void {
    this.#due.delete(receiver)
  }

  readonly #fire = (): void => {
    this.#timer = undefined
    if (this.#due.size === 0) return
    const due = [...this.#due]
    this.#due.clear()
    for (const receiver of due) receiver.flushAcks()
  }
}

export interface BodyReceiverOptions {
  ack: (bytes: number) => void
  onCancel: (reason: unknown) => void
  onOverflow: () => void
  budget: ReceiveBudget
  counters: Counters
  coalesce?: AckCoalescer | undefined
}

export class BodyReceiver {
  readonly stream: ReadableStream<Uint8Array>
  #controller!: ReadableStreamDefaultController<Uint8Array>
  #queue: Uint8Array[] = []
  #queuedBytes = 0
  #ended = false
  #share: EndedShare | undefined
  #waiting = false
  #done = false
  #acksStopped = false
  #pendingAck = 0
  #pendingCount = 0
  readonly #options: BodyReceiverOptions

  constructor(options: BodyReceiverOptions) {
    this.#options = options
    this.stream = new ReadableStream<Uint8Array>(
      {
        start: controller => {
          this.#controller = controller
        },
        pull: () => {
          const chunk = this.#queue.shift()
          if (chunk) {
            this.#queuedBytes -= chunk.byteLength
            options.budget.remove(chunk.byteLength, this.#share)
            this.#deliver(chunk)
          } else if (this.#ended) this.#close()
          else this.#waiting = true
        },
        cancel: reason => {
          this.#done = true
          this.#drop()
          options.onCancel(reason)
        },
      },
      { highWaterMark: 0 },
    )
  }

  push(chunk: Uint8Array): void {
    if (this.#done || this.#ended) return
    if (this.#waiting) {
      this.#waiting = false
      this.#deliver(chunk)
      return
    }
    if (this.#queuedBytes + chunk.byteLength > this.#options.budget.maxBytes) {
      this.#options.onOverflow()
      return
    }
    this.#queue.push(chunk)
    this.#queuedBytes += chunk.byteLength
    this.#options.budget.add(chunk.byteLength)
  }

  end(): void {
    if (this.#ended || this.#done) return
    this.stopAcks()
    this.#ended = true
    this.#share = this.#options.budget.ended(this, this.#queuedBytes)
    if (this.#waiting && this.#queue.length === 0) this.#close()
  }

  finish(): void {
    if (this.#done) return
    this.#drop()
    this.#ended = true
    if (this.#waiting) this.#close()
  }

  error(err: unknown): void {
    if (this.#done) return
    this.#done = true
    this.#drop()
    this.#controller.error(err)
  }

  stopAcks(): void {
    if (this.#acksStopped) return
    this.#acksStopped = true
    this.#pendingAck = 0
    this.#pendingCount = 0
    this.#options.coalesce?.forget(this)
    this.#options.budget.forget(this)
  }

  flushAcks(): void {
    this.#options.coalesce?.forget(this)
    if (this.#acksStopped || this.#pendingAck === 0) return
    if (this.#options.budget.holds(this, this.#queuedBytes)) return
    const bytes = this.#pendingAck
    this.#options.counters.acksCoalesced += this.#pendingCount - 1
    this.#pendingAck = 0
    this.#pendingCount = 0
    this.#options.ack(bytes)
  }

  #deliver(chunk: Uint8Array): void {
    this.#controller.enqueue(chunk)
    this.#consumed(chunk.byteLength)
  }

  #consumed(bytes: number): void {
    if (this.#acksStopped) return
    this.#pendingAck += bytes
    this.#pendingCount++
    const { coalesce } = this.#options
    if (!coalesce || this.#pendingAck >= coalesce.bytes) this.flushAcks()
    else coalesce.schedule(this)
  }

  #drop(): void {
    this.stopAcks()
    this.#queue = []
    const queued = this.#queuedBytes
    this.#queuedBytes = 0
    this.#options.budget.remove(queued, this.#share)
  }

  #close(): void {
    if (this.#done) return
    this.#done = true
    this.#waiting = false
    this.#controller.close()
  }
}
