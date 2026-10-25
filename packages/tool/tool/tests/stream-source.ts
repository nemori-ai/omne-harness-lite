// A controlled in-process publisher of one Tool process stream, for the tests of the runtime's
// observation facade. It is test support, not a provider: it keeps every frame in memory, has no
// executor behind it, and its limits are the test's. It follows the public observation contract
// (stream-arrival README): a snapshot and the subscription are taken in one synchronous step, each
// delta starts at the cursor last delivered to that observer, a queue overflow or lost history
// removes the subscription first and leaves one terminal gap, abort ends with `observer-closed`,
// a reference to another stream ends with `stale-stream`, and the two Tool-owned ends travel in
// `producer-ended`.
import {
  decodeStreamPosition,
  encodeStreamCursor,
  readStreamRef,
  type StreamCursor,
  type StreamFrame,
  type StreamId,
  type StreamRef,
} from '@omne-harness/stream-arrival'
import type {
  Access,
  ToolStreamDelta,
  ToolStreamEnd,
  ToolStreamObservation,
  ToolStreamSnapshot,
} from '@omne-harness/tool-contract'

export type Frame = StreamFrame<ToolStreamSnapshot, ToolStreamDelta, ToolStreamEnd>

type Observer = {
  queue: Frame[]
  wake: (() => void) | null
  live: boolean
  delivered: StreamCursor | null
}

export type TestStreamSource<P> = Readonly<{
  observation: ToolStreamObservation<P>
  /** Confirms one projection change: the delta for subscribers, the snapshot for later observers. */
  confirm(delta: ToolStreamDelta, snapshot: ToolStreamSnapshot): void
  /** Ends every observation with a Tool-owned reason; later requests end the same way at once. */
  end(reason: ToolStreamEnd['reason']): void
  /** Forgets the history before the current position: subscribers behind it get gap(source-history). */
  dropHistory(): void
  /** The inputs of every `observe` call, in call order. */
  readonly observed: readonly Readonly<{ ref: StreamRef; access: Access<P> }>[]
  /** How many observers are subscribed now. */
  subscribers(): number
}>

function cursorOf(ref: StreamRef, position: number): StreamCursor {
  const decoded = decodeStreamPosition(String(position))
  if ('failure' in decoded) throw new Error('test position does not decode')
  const cursor = encodeStreamCursor({ ref, position: decoded.ok })
  if ('failure' in cursor) throw new Error('test cursor does not encode')
  return cursor.ok
}

export function createTestStreamSource<P>(input: {
  stream: StreamId
  ref: StreamRef
  initial: ToolStreamSnapshot
  /** The most frames one observer may have queued; the next one overflows (gap buffer). */
  queuedFrames?: number
  /** The most UTF-8 JSON bytes of a snapshot; a larger one ends with capacity. */
  snapshotBytes?: number
}): TestStreamSource<P> {
  const limits = {
    queuedFrames: input.queuedFrames ?? 8,
    snapshotBytes: input.snapshotBytes ?? 65536,
  }
  let position = 0
  let view = input.initial
  let ended: ToolStreamEnd['reason'] | null = null
  const observers = new Set<Observer>()
  const observed: Readonly<{ ref: StreamRef; access: Access<P> }>[] = []

  const push = (observer: Observer, frame: Frame) => {
    observer.queue.push(frame)
    observer.wake?.()
  }
  const detach = (observer: Observer) => {
    observer.live = false
    observers.delete(observer)
  }
  /** Removes the subscription and discards pending data first, then leaves one terminal frame. */
  const terminate = (observer: Observer, frame: Frame) => {
    detach(observer)
    observer.queue.length = 0
    push(observer, frame)
  }

  const observation: ToolStreamObservation<P> = {
    observe: request => ({
      [Symbol.asyncIterator]: () => {
        const observer: Observer = { queue: [], wake: null, live: false, delivered: null }
        let started = false
        let done = false
        const abort = () => {
          if (done) return
          terminate(observer, { kind: 'ended', reason: 'observer-closed' })
        }
        const start = () => {
          started = true
          observed.push({ ref: request.ref, access: request.access })
          if (readStreamRef(request.ref).stream !== input.stream || request.ref !== input.ref) {
            push(observer, { kind: 'ended', reason: 'stale-stream' })
            return
          }
          if (request.signal.aborted) {
            push(observer, { kind: 'ended', reason: 'observer-closed' })
            return
          }
          if (ended !== null) {
            push(observer, { kind: 'ended', reason: 'producer-ended', value: { reason: ended } })
            return
          }
          if (Buffer.byteLength(JSON.stringify(view), 'utf8') > limits.snapshotBytes) {
            push(observer, { kind: 'ended', reason: 'capacity' })
            return
          }
          // Snapshot and subscription in one synchronous step: nothing confirmed can fall between.
          observer.live = true
          observers.add(observer)
          observer.delivered = cursorOf(input.ref, position)
          push(observer, { kind: 'snapshot', cursor: observer.delivered, value: view })
          request.signal.addEventListener('abort', abort, { once: true })
        }
        return {
          async next(): Promise<IteratorResult<Frame>> {
            if (done) return { done: true, value: undefined }
            if (!started) start()
            while (observer.queue.length === 0) {
              if (!observer.live) {
                done = true
                return { done: true, value: undefined }
              }
              await new Promise<void>(resolve => {
                observer.wake = resolve
              })
              observer.wake = null
            }
            const frame = observer.queue.shift() as Frame
            if (frame.kind === 'snapshot' || frame.kind === 'delta')
              observer.delivered = frame.cursor
            return { done: false, value: frame }
          },
          async return(): Promise<IteratorResult<Frame>> {
            done = true
            detach(observer)
            observer.queue.length = 0
            request.signal.removeEventListener('abort', abort)
            observer.wake?.()
            return { done: true, value: undefined }
          },
        }
      },
    }),
  }

  return Object.freeze({
    observation,
    observed,
    subscribers: () => observers.size,
    confirm(delta, snapshot) {
      position += 1
      view = snapshot
      const cursor = cursorOf(input.ref, position)
      for (const observer of observers) {
        if (observer.queue.length >= limits.queuedFrames) {
          terminate(observer, { kind: 'gap', after: observer.delivered, reason: 'buffer' })
          continue
        }
        const from = cursorOf(input.ref, position - 1)
        push(observer, { kind: 'delta', from, cursor, value: delta })
      }
    },
    end(reason) {
      ended = reason
      for (const observer of observers)
        terminate(observer, { kind: 'ended', reason: 'producer-ended', value: { reason } })
    },
    dropHistory() {
      const current = cursorOf(input.ref, position)
      for (const observer of observers)
        if (observer.delivered !== current || observer.queue.length > 0)
          terminate(observer, { kind: 'gap', after: observer.delivered, reason: 'source-history' })
    },
  })
}
