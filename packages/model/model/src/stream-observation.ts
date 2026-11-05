import type { Outcome } from '@omne-harness/operation-result'
import type { StreamCursor, StreamFrame } from '@omne-harness/stream-arrival'
import type {
  ModelStreamDelta,
  ModelStreamObservation,
  ModelStreamSnapshot,
} from '@omne-harness/model-contract'
import { measureStreamValue, STREAM_OBSERVER_BYTES } from './stream-bounds.ts'
import type { ModelObservationLimits, ModelObservationTiming } from './stream-types.ts'

export type ModelObservationFrame = StreamFrame<ModelStreamSnapshot, ModelStreamDelta>
type Body = Extract<ModelObservationFrame, { kind: 'snapshot' | 'delta' }>
type Terminal = Extract<ModelObservationFrame, { kind: 'gap' | 'ended' }>
export type StreamEndReason = Exclude<
  Extract<Terminal, { kind: 'ended' }>['reason'],
  'producer-ended'
>
export type StreamCheckFailure = StreamEndReason | 'cold'
export type StreamWatcher = Readonly<{
  push(frame: Body): void
  end(reason: StreamEndReason): void
}>
export type StreamTarget = {
  snapshot: ModelStreamSnapshot
  cursor: StreamCursor
  watchers: Set<StreamWatcher>
}
type Request<P> = Parameters<ModelStreamObservation<P>['observe']>[0]
type Ports<P> = Readonly<{
  limits: ModelObservationLimits
  timing: ModelObservationTiming
  check(request: Request<P>): Outcome<StreamTarget, StreamCheckFailure>
  refresh(request: Request<P>): Promise<StreamEndReason | null>
  reserve(bytes: number): (() => void) | null
  admit(request: Request<P>): (() => void) | null
  track(watcher: StreamWatcher): () => void
}>
type Queued = Readonly<{ frame: Body; bytes: number; at: number; release(): void }>
const done = (): IteratorResult<ModelObservationFrame> => ({ done: true, value: undefined })
const publicReason = (failure: StreamCheckFailure): StreamEndReason =>
  failure === 'cold' ? 'unavailable' : failure

/** One FIFO owns its own logical bytes, deadline, listener and last delivered cursor. */
export function createStreamObservation<P>(ports: Ports<P>): ModelStreamObservation<P> {
  return {
    observe(original) {
      const request: Request<P> = {
        ref: original.ref,
        access: { tenant: original.access.tenant, principal: original.access.principal },
        signal: original.signal,
      }
      return {
        [Symbol.asyncIterator]() {
          let phase: 'new' | 'opening' | 'open' | 'terminal' | 'closed' = 'new'
          let target: StreamTarget | null = null
          let queue: Queued[] = []
          let queuedBytes = 0
          let lastDelivered: StreamCursor | null = null
          let terminal: Terminal | null = null
          let pending: ((result: IteratorResult<ModelObservationFrame>) => void) | null = null
          let releaseAdmission: (() => void) | null = null
          let releaseMetadata: (() => void) | null = null
          let releaseTracking: (() => void) | null = null
          let timer: AbortController | null = null
          let timerDeadline = Infinity
          let opening = 0

          function detach(): void {
            target?.watchers.delete(watcher)
            target = null
            for (const entry of queue) entry.release()
            queue = []
            queuedBytes = 0
            timer?.abort()
            timer = null
            timerDeadline = Infinity
            request.signal.removeEventListener('abort', abort)
            releaseAdmission?.()
            releaseAdmission = null
            releaseTracking?.()
            releaseTracking = null
          }
          function close(): void {
            phase = 'closed'
            opening += 1
            detach()
            releaseMetadata?.()
            releaseMetadata = null
            terminal = null
            const resolve = pending
            pending = null
            resolve?.(done())
          }
          function hold(frame: Terminal): void {
            if (phase === 'closed' || phase === 'terminal') return
            detach()
            phase = 'terminal'
            terminal = frame
            flush()
          }
          function abort(): void {
            hold({ kind: 'ended', reason: 'observer-closed' })
          }
          function expired(): boolean {
            const first = queue[0]
            return (
              first !== undefined &&
              ports.timing.nowMs() - first.at >= ports.limits.maxQueueResidenceMs
            )
          }
          function gap(): void {
            hold({ kind: 'gap', after: lastDelivered, reason: 'buffer' })
          }
          function disclose(held: Terminal): Terminal {
            const checked = ports.check(request)
            if (
              'failure' in checked &&
              (checked.failure === 'denied' ||
                checked.failure === 'unavailable' ||
                checked.failure === 'stale-stream')
            )
              return { kind: 'ended', reason: checked.failure }
            if (request.signal.aborted) return { kind: 'ended', reason: 'observer-closed' }
            return held
          }
          /** Before an open delivery: qualification, abort and residence; false once it held a terminal. */
          function recheck(): boolean {
            const checked = ports.check(request)
            if ('failure' in checked) {
              hold({ kind: 'ended', reason: publicReason(checked.failure) })
              return false
            }
            if (request.signal.aborted) {
              abort()
              return false
            }
            if (expired()) {
              gap()
              return false
            }
            return true
          }
          function flush(): void {
            if (!pending || phase === 'closed' || phase === 'new' || phase === 'opening') return
            if (phase === 'open' && !recheck()) return
            if (terminal) {
              const frame = disclose(terminal)
              const resolve = pending
              pending = null
              close()
              resolve({ done: false, value: frame })
              return
            }
            const entry = queue.shift()
            if (!entry) return
            queuedBytes -= entry.bytes
            entry.release()
            lastDelivered = entry.frame.cursor
            const resolve = pending
            pending = null
            resolve({ done: false, value: entry.frame })
          }
          function enqueue(frame: Body): void {
            if (phase !== 'open') return
            if (expired()) {
              gap()
              return
            }
            const limit =
              frame.kind === 'snapshot' ? ports.limits.maxSnapshotBytes : ports.limits.maxDeltaBytes
            const measured = measureStreamValue(
              frame,
              Math.min(limit, ports.limits.maxQueuedBytes - queuedBytes),
            )
            const release =
              measured && queue.length < ports.limits.maxQueuedFrames
                ? ports.reserve(measured.bytes)
                : null
            if (!measured || !release) {
              if (frame.kind === 'snapshot') hold({ kind: 'ended', reason: 'capacity' })
              else gap()
              return
            }
            queue.push({ frame, bytes: measured.bytes, at: ports.timing.nowMs(), release })
            queuedBytes += measured.bytes
            flush()
            schedule()
          }
          const watcher: StreamWatcher = {
            push: enqueue,
            end: reason => hold({ kind: 'ended', reason }),
          }
          /** The current timer is due: recheck the open observation, deliver, then arm the next one. */
          function elapse(controller: AbortController, result: 'elapsed' | 'cancelled'): void {
            if (timer !== controller || phase !== 'open' || result === 'cancelled') return
            timer = null
            timerDeadline = Infinity
            const checked = ports.check(request)
            if ('failure' in checked) hold({ kind: 'ended', reason: publicReason(checked.failure) })
            else if (expired()) gap()
            flush()
            schedule()
          }
          function schedule(): void {
            if (phase !== 'open') return
            const deadline = Math.min(
              ports.timing.nowMs() + ports.limits.checkIntervalMs,
              (queue[0]?.at ?? Infinity) + ports.limits.maxQueueResidenceMs,
            )
            if (timer && timerDeadline <= deadline) return
            timer?.abort()
            const controller = new AbortController()
            timer = controller
            timerDeadline = deadline
            void ports.timing.waitUntil(deadline, controller.signal).then(
              result => elapse(controller, result),
              () => {
                if (timer === controller && phase === 'open')
                  hold({ kind: 'ended', reason: 'unavailable' })
              },
            )
          }
          function begin(): void {
            const checked = ports.check(request)
            if ('failure' in checked) {
              hold({ kind: 'ended', reason: publicReason(checked.failure) })
              return
            }
            releaseMetadata = ports.reserve(STREAM_OBSERVER_BYTES)
            releaseAdmission = releaseMetadata ? ports.admit(request) : null
            if (!releaseMetadata || !releaseAdmission) {
              hold({ kind: 'ended', reason: 'capacity' })
              return
            }
            target = checked.ok
            phase = 'open'
            request.signal.addEventListener('abort', abort, { once: true })
            if (request.signal.aborted) {
              abort()
              return
            }
            // Snapshot capture and watcher insertion share this synchronous section.
            const frame: Body = { kind: 'snapshot', cursor: target.cursor, value: target.snapshot }
            target.watchers.add(watcher)
            enqueue(frame)
          }
          function start(): void {
            const checked = ports.check(request)
            if (
              'ok' in checked ||
              (checked.failure !== 'unavailable' && checked.failure !== 'cold')
            ) {
              begin()
              return
            }
            phase = 'opening'
            const attempt = ++opening
            request.signal.addEventListener('abort', abort, { once: true })
            if (request.signal.aborted) {
              abort()
              return
            }
            void ports.refresh(request).then(
              failure => {
                if (phase !== 'opening' || attempt !== opening) return
                request.signal.removeEventListener('abort', abort)
                if (failure) hold({ kind: 'ended', reason: failure })
                else begin()
              },
              () => hold({ kind: 'ended', reason: 'unavailable' }),
            )
          }
          return {
            next(): Promise<IteratorResult<ModelObservationFrame>> {
              if (phase === 'closed') return Promise.resolve(done())
              if (pending) {
                hold({ kind: 'ended', reason: 'capacity' })
                return Promise.resolve(done())
              }
              return new Promise(resolve => {
                pending = resolve
                if (phase === 'new') {
                  releaseTracking = ports.track(watcher)
                  start()
                }
                flush()
              })
            },
            return(): Promise<IteratorResult<ModelObservationFrame>> {
              close()
              return Promise.resolve(done())
            },
          }
        },
      }
    },
  }
}
