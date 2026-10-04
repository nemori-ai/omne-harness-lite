import type { ArrivalEvent } from '@omne-harness-lite/arrival-events'
import type { AssemblySnapshot } from '@omne-harness-lite/stream-assembly'
import type { CallConsumer, CallReadView, CallWaitResult } from './reference-types.ts'
import type { ModelObserverQueue } from './service-types.ts'

interface Listener {
  readonly changed: () => void
  readonly offer: (event: ArrivalEvent, snapshot: AssemblySnapshot) => void
}
// Each bucket is the real container instance, never just a serializable CallKey.
const listeners = new WeakMap<object, Set<Listener>>()
export function notifyReferenceConsumers(container: object): void {
  for (const listener of listeners.get(container) ?? []) listener.changed()
}
export function offerReferenceConsumers(
  container: object,
  event: ArrivalEvent,
  snapshot: AssemblySnapshot,
): void {
  for (const listener of listeners.get(container) ?? []) listener.offer(event, snapshot)
}

function bucketOf(container: object): Set<Listener> {
  const existing = listeners.get(container)
  if (existing !== undefined) return existing
  const created = new Set<Listener>()
  listeners.set(container, created)
  return created
}

function waitInput(
  request: Parameters<CallConsumer['wait']>[0],
): { readonly signal: AbortSignal | undefined } | { readonly result: CallWaitResult } {
  if (request === null || typeof request !== 'object') return { result: { unavailable: true } }
  const signal = request.signal
  if (
    signal !== undefined &&
    (typeof signal.aborted !== 'boolean' ||
      typeof signal.addEventListener !== 'function' ||
      typeof signal.removeEventListener !== 'function')
  )
    return { result: { unavailable: true } }
  if (signal?.aborted) return { result: { aborted: true } }
  return { signal }
}

function hasWaitResult(result: { readonly view: CallReadView }): boolean {
  return (
    result.view.acknowledged !== undefined ||
    result.view.result !== undefined ||
    result.view.presence.kind !== 'live'
  )
}

/** Receiver ownership only. This module has no invocation, cancel, settle or recovery handle. */
export function createIndependentCallConsumer(options: {
  readonly container: object
  readonly revoked: AbortSignal
  readonly valid: () => boolean
  readonly read: () => Promise<{ readonly view: CallReadView } | { readonly unavailable: true }>
  readonly queue?: ModelObserverQueue
  readonly initialSnapshot?: AssemblySnapshot
  readonly onStopped: () => void
}): CallConsumer {
  // Closures below capture `input`, which excludes the container (see `bucket`).
  const { container, ...input } = options
  let terminal:
    | Exclude<CallWaitResult, { readonly view: CallReadView } | { readonly aborted: true }>
    | undefined
  let activeReads = 0
  let receiverStopped = input.queue === undefined
  let stopFailed = false
  let revision = 0
  let completeStop = () => {}
  let announceClosed = (_result: CallWaitResult) => {}
  const stopped = new Promise<void>(resolve => {
    completeStop = resolve
  })
  const closed = new Promise<CallWaitResult>(resolve => {
    announceClosed = resolve
  })
  const waiters = new Set<() => void>()
  let finished = false
  let receiverClosing: Promise<void> | undefined
  function maybeStopped(): void {
    if (finished || terminal === undefined || activeReads !== 0 || !receiverStopped || stopFailed)
      return
    finished = true
    try {
      input.onStopped()
    } catch {
      stopFailed = true
      finished = false
      return
    }
    completeStop()
  }
  function changed(): void {
    revision++
    for (const wake of waiters) wake()
  }
  const listener: Listener = {
    changed,
    offer(event, snapshot) {
      if (terminal !== undefined) return
      if (input.revoked.aborted || !input.valid()) {
        terminate({ unavailable: true })
        return
      }
      if (input.queue === undefined) return
      try {
        const offered = input.queue.offer(event, snapshot)
        if ('rejected' in offered) terminate(offered)
        else if (!('accepted' in offered)) terminate({ unavailable: true })
      } catch {
        terminate({ rejected: { reason: 'consumer_failed' } })
      }
    },
  }
  function terminate(result: NonNullable<typeof terminal>): void {
    if (terminal !== undefined) return
    terminal = result
    input.revoked.removeEventListener('abort', revoked)
    bucket.delete(listener)
    announceClosed(result)
    changed()
    stopReceiver()
    maybeStopped()
  }
  function stopReceiver(): void {
    if (input.queue === undefined || receiverStopped || receiverClosing !== undefined) return
    const queue = input.queue
    receiverClosing = Promise.resolve()
      .then(() => queue.close())
      .then(
        result => {
          if ('released' in result) {
            receiverStopped = true
            stopFailed = false
          } else stopFailed = true
          maybeStopped()
        },
        () => {
          stopFailed = true
        },
      )
      .finally(() => {
        receiverClosing = undefined
      })
  }
  const revoked = () => terminate({ unavailable: true })
  // The handle keeps only its listener bucket, never the container itself (RT12 S-97: a
  // caller handle holds ref + access entry). An empty bucket stays keyed by the container in
  // the WeakMap and is collected with it, so the handle cannot pin a released container.
  const bucket = bucketOf(container)
  bucket.add(listener)
  input.revoked.addEventListener('abort', revoked, { once: true })
  if (input.revoked.aborted || !input.valid()) revoked()
  if (terminal === undefined && input.queue !== undefined && input.initialSnapshot !== undefined) {
    try {
      const started = input.queue.start(input.initialSnapshot)
      if ('rejected' in started) terminate(started)
      else if (!('accepted' in started)) terminate({ unavailable: true })
    } catch {
      terminate({ rejected: { reason: 'consumer_failed' } })
    }
  }

  function readCurrent(): boolean {
    if (!input.valid() || input.revoked.aborted) {
      revoked()
      return false
    }
    return true
  }

  function waitingStatus(signal: AbortSignal | undefined): CallWaitResult | undefined {
    if (terminal !== undefined) return terminal
    if (signal?.aborted) return { aborted: true }
    if (!readCurrent()) return { unavailable: true }
    return undefined
  }

  return Object.freeze<CallConsumer>({
    stopped,
    release: () => {
      terminate({ released: true })
      stopReceiver()
      maybeStopped()
    },
    async wait(request) {
      if (terminal !== undefined) return terminal
      const captured = waitInput(request)
      if ('result' in captured) return captured.result
      const { signal } = captured
      let abort = () => {}
      const aborted = new Promise<CallWaitResult>(resolve => {
        abort = () => resolve({ aborted: true })
        signal?.addEventListener('abort', abort, { once: true })
        if (signal?.aborted) abort()
      })
      try {
        for (;;) {
          const status = waitingStatus(signal)
          if (status !== undefined) return status
          const before = revision
          activeReads++
          // A caller's abort stops only this wait; the owned source read is still drained.
          const reading = Promise.resolve()
            .then(input.read)
            .catch(() => ({ unavailable: true as const }))
            .finally(() => {
              activeReads--
              maybeStopped()
            })
          const result = await Promise.race([reading, closed, aborted])
          if (terminal !== undefined) return terminal
          if (!('view' in result)) return result
          if (!readCurrent()) return { unavailable: true }
          // RT12 S-86/S-97: an acknowledged view is final for this handle; never re-read content.
          if (hasWaitResult(result)) return result
          if (revision !== before) continue
          let wake = () => {}
          const changedResult = new Promise<'changed'>(resolve => {
            wake = () => resolve('changed')
            waiters.add(wake)
          })
          try {
            const next = await Promise.race([changedResult, closed, aborted])
            if (next !== 'changed') return next
          } finally {
            waiters.delete(wake)
          }
        }
      } finally {
        signal?.removeEventListener('abort', abort)
      }
    },
  })
}
