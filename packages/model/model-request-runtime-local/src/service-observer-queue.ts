import type { ObserverReceiveTask } from '@omne-harness-lite/model-request-runtime'
import { validate as validateArrival } from '@omne-harness-lite/arrival-events'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import {
  isNonNegativeJsonInteger,
  isJsonNumber,
  LosslessNumber,
  writeJsonLossless,
  type JsonNumber,
} from '@omne-harness-lite/content-blocks'
import type { AssemblySnapshot } from '@omne-harness-lite/stream-assembly'
import type { ObserverDiagnostic } from '@omne-harness-lite/model-request-runtime'
import type {
  ModelObserverQueue,
  ModelObserverQueueInput,
  ObserverOfferResult,
} from './service-types.ts'

interface Buffered {
  readonly serialized: string
  readonly bytes: number
  readonly position?: JsonNumber
  counted: boolean
}
interface Receiving {
  readonly item: Buffered
  readonly abort: AbortController
  completionDone: boolean
  stoppedDone: boolean
}

function positive(value: unknown): value is JsonNumber {
  return (
    isJsonNumber(value) &&
    isNonNegativeJsonInteger(value) &&
    ExactDecimal.from(value).compare(ExactDecimal.from(0)) > 0
  )
}
function nonnegative(value: unknown): value is JsonNumber {
  return isJsonNumber(value) && isNonNegativeJsonInteger(value)
}
function validSnapshot(value: unknown): value is AssemblySnapshot {
  if (value === null || typeof value !== 'object' || !('position' in value)) return false
  return (
    nonnegative(value.position) &&
    'blocks' in value &&
    Array.isArray(value.blocks) &&
    (!('firstContentAt' in value) || nonnegative(value.firstContentAt))
  )
}
function numeric(value: ExactDecimal): JsonNumber {
  return new LosslessNumber(value.toString())
}

function validReceiveTask(task: ObserverReceiveTask): boolean {
  return !(
    task === null ||
    typeof task !== 'object' ||
    !(task.completion instanceof Promise) ||
    !(task.stopped instanceof Promise)
  )
}

/** Per-dispatch, single-receiver delivery. Accepted means queued, never read by a person. */
export function createModelObserverQueue(input: ModelObserverQueueInput): ModelObserverQueue {
  const { scope, authorization, receiver, diagnostic } = input
  if (!positive(input.maxBufferedEvents) || !positive(input.maxBufferedBytes))
    throw new TypeError('observer bounds must be positive finite integers')
  if (
    scope.target.kind !== 'model_call' ||
    typeof receiver.receive !== 'function' ||
    typeof receiver.stop !== 'function' ||
    !(receiver.stopped instanceof Promise) ||
    typeof authorization.check !== 'function' ||
    typeof diagnostic !== 'function'
  )
    throw new TypeError('observer owner is incomplete')

  const encoder = new TextEncoder()
  const waiting: Buffered[] = []
  let bufferedBytes = ExactDecimal.from(0)
  let bufferedEvents = 0
  let current: Receiving | undefined
  let started = false
  let closed = false
  let failed = false
  let receiverStopped = false
  let stopRequested = false
  let receiverStopFailed = false
  let released = false
  let closing: Promise<{ readonly released: true } | { readonly unavailable: true }> | undefined

  function report(
    stage: ObserverDiagnostic['stage'],
    reason: ObserverDiagnostic['reason'],
    position?: JsonNumber,
  ): void {
    try {
      diagnostic({
        session: scope.session,
        tenant: scope.tenant,
        callId: scope.target.callId,
        dispatch: scope.target.dispatch,
        stage,
        reason,
        ...(position === undefined ? {} : { position }),
        bufferedEvents: new LosslessNumber(String(bufferedEvents)),
        bufferedBytes: numeric(bufferedBytes),
      })
    } catch {
      // Diagnostics are not the durable response record or a delivery permit.
    }
  }
  function uncount(item: Buffered): void {
    if (!item.counted) return
    item.counted = false
    bufferedEvents -= 1
    bufferedBytes = bufferedBytes.add(ExactDecimal.from(new LosslessNumber(`-${item.bytes}`)))
  }
  function dropWaiting(stage: ObserverDiagnostic['stage'], reason: ObserverDiagnostic['reason']) {
    for (const item of waiting.splice(0)) {
      report(stage, reason, item.position)
      uncount(item)
    }
  }
  function stopReceiver(): void {
    if (stopRequested || receiverStopped) return
    try {
      receiver.stop()
      stopRequested = true
      receiverStopFailed = false
    } catch {
      receiverStopFailed = true
    }
  }
  function fail(position?: JsonNumber): void {
    if (failed) return
    failed = true
    closed = true
    report('delivery', 'consumer_failed', position)
    dropWaiting('delivery', 'consumer_failed')
    current?.abort.abort()
    stopReceiver()
  }
  function check(): ObserverOfferResult | undefined {
    try {
      const result = authorization.check(scope.target)
      if ('valid' in result && result.valid === true) return undefined
      if ('invalidInput' in result) return result
      return { unavailable: true }
    } catch {
      return { unavailable: true }
    }
  }
  function enqueue(
    delivery:
      | { readonly kind: 'snapshot'; readonly snapshot: AssemblySnapshot }
      | {
          readonly kind: 'event'
          readonly position: JsonNumber
          readonly event: Parameters<ModelObserverQueue['offer']>[0]
        },
  ): ObserverOfferResult {
    const position = delivery.kind === 'event' ? delivery.position : delivery.snapshot.position
    if (closed || failed) {
      report('offer', 'consumer_failed', position)
      return { rejected: { reason: 'consumer_failed' } }
    }
    const scopeResult = check()
    if (scopeResult !== undefined) {
      const reason = 'invalidInput' in scopeResult ? 'observer_scope_mismatch' : 'unavailable'
      report('offer', reason, position)
      closed = true
      dropWaiting('delivery', reason)
      current?.abort.abort()
      stopReceiver()
      return scopeResult
    }
    let serialized: string
    try {
      serialized = writeJsonLossless({ scope, ...delivery })
    } catch {
      report('offer', 'malformed', position)
      return { invalidInput: { reason: 'malformed' } }
    }
    const bytes = encoder.encode(serialized).byteLength
    if (
      ExactDecimal.from(bufferedEvents + 1).compare(ExactDecimal.from(input.maxBufferedEvents)) >
        0 ||
      bufferedBytes
        .add(ExactDecimal.from(bytes))
        .compare(ExactDecimal.from(input.maxBufferedBytes)) > 0
    ) {
      report('offer', 'buffer_full', position)
      return { rejected: { reason: 'buffer_full' } }
    }
    waiting.push({ serialized, bytes, position, counted: true })
    bufferedEvents += 1
    bufferedBytes = bufferedBytes.add(ExactDecimal.from(bytes))
    if (started) drain()
    return { accepted: true }
  }
  function drain(): void {
    if (!started || closed || failed || current !== undefined) return
    const item = waiting.shift()
    if (item === undefined) return
    const permission = check()
    if (permission !== undefined) {
      report(
        'delivery',
        'invalidInput' in permission ? 'observer_scope_mismatch' : 'unavailable',
        item.position,
      )
      uncount(item)
      dropWaiting(
        'delivery',
        'invalidInput' in permission ? 'observer_scope_mismatch' : 'unavailable',
      )
      closed = true
      stopReceiver()
      return
    }
    const abort = new AbortController()
    const receiving: Receiving = { item, abort, completionDone: false, stoppedDone: false }
    current = receiving
    let task: ObserverReceiveTask
    try {
      task = receiver.receive(item.serialized, abort.signal)
      if (!validReceiveTask(task)) throw new TypeError('observer receive task missing')
    } catch {
      current = undefined
      uncount(item)
      fail(item.position)
      return
    }
    const finish = () => {
      if (!receiving.completionDone || !receiving.stoppedDone || current !== receiving) return
      current = undefined
      uncount(item)
      drain()
    }
    task.completion.then(
      () => {
        receiving.completionDone = true
        finish()
      },
      () => {
        receiving.completionDone = true
        fail(item.position)
        finish()
      },
    )
    task.stopped.then(
      () => {
        receiving.stoppedDone = true
        finish()
      },
      () => fail(item.position),
    )
  }
  receiver.stopped.then(
    () => {
      receiverStopped = true
    },
    () => {
      receiverStopFailed = true
    },
  )

  return Object.freeze({
    offer(event: Parameters<ModelObserverQueue['offer']>[0], snapshot: AssemblySnapshot) {
      if (closed || failed) {
        report('offer', 'consumer_failed')
        return { rejected: { reason: 'consumer_failed' } } as const
      }
      if (!validSnapshot(snapshot) || !validateArrival('ArrivalEvent', event).valid) {
        report('offer', 'malformed')
        return { invalidInput: { reason: 'malformed' } } as const
      }
      return enqueue({ kind: 'event', position: snapshot.position, event })
    },
    start(snapshot: AssemblySnapshot) {
      if (!validSnapshot(snapshot) || started) {
        report('offer', 'malformed')
        return { invalidInput: { reason: 'malformed' } } as const
      }
      for (let index = waiting.length - 1; index >= 0; index -= 1) {
        const item = waiting[index]
        if (
          item !== undefined &&
          item.position !== undefined &&
          ExactDecimal.from(item.position).compare(ExactDecimal.from(snapshot.position)) <= 0
        ) {
          waiting.splice(index, 1)
          uncount(item)
        }
      }
      const result = enqueue({ kind: 'snapshot', snapshot })
      if ('accepted' in result) {
        const initial = waiting.pop()
        if (initial !== undefined) waiting.unshift(initial)
      } else {
        closed = true
        dropWaiting('close', 'consumer_failed')
        stopReceiver()
      }
      started = true
      drain()
      return result
    },
    close() {
      if (released) return Promise.resolve({ released: true } as const)
      if (closing !== undefined) return closing
      closed = true
      dropWaiting('close', 'consumer_failed')
      current?.abort.abort()
      stopReceiver()
      closing = Promise.resolve()
        .then(() => {
          if (!receiverStopFailed && receiverStopped && current === undefined) {
            released = true
            return { released: true } as const
          }
          return { unavailable: true } as const
        })
        .finally(() => {
          closing = undefined
        })
      return closing
    },
  })
}
