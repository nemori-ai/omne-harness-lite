/**
 * A transport diagnostic carries its kind and level only: never a URL, a header or a body.
 * The event vocabulary and its query belong to a later owner; this is the current closed set.
 */
export type TransportDiagnostic = Readonly<{
  kind: 'exchange-started' | 'connect-failed' | 'error-body-too-large' | 'exchange-stopped'
  level: 'info' | 'error'
}>

/** A caller-owned observer. It may return a thenable; nothing it does reaches the emitter. */
export type DiagnosticObserver = (event: TransportDiagnostic) => unknown

export type DiagnosticCounters = Readonly<{
  /** Deliveries that threw synchronously or whose thenable rejected. */
  failed: number
  /** Deliveries whose thenable has not settled yet. */
  pending: number
  /** Events not delivered because `pending` had reached `maxPending`. */
  dropped: number
}>

export interface IsolatedDiagnostics {
  /** Delivers a frozen copy of the event. Never throws and never waits. */
  emit(event: TransportDiagnostic): void
  counters(): DiagnosticCounters
}

/**
 * Isolates a diagnostic observer from transport work: a throw, a rejection or a thenable that
 * never settles only changes the counters. `maxPending` bounds the unsettled deliveries.
 */
export function createDiagnosticSink(
  observer: DiagnosticObserver,
  options: Readonly<{ maxPending: number }>,
): IsolatedDiagnostics {
  const { maxPending } = options
  if (!Number.isSafeInteger(maxPending) || maxPending < 1)
    throw new RangeError('maxPending must be a positive integer')
  let failed = 0
  let pending = 0
  let dropped = 0

  const settled = (): void => {
    pending -= 1
  }
  const rejected = (): void => {
    pending -= 1
    failed += 1
  }

  /** Counts the completion that the observer returned. Reading `then` may itself throw. */
  function watch(completion: unknown): void {
    let thenable: boolean
    try {
      thenable = isThenable(completion)
    } catch {
      failed += 1
      return
    }
    if (!thenable) return
    pending += 1
    // Both handlers only update counters and cannot throw, so the derived promise never rejects.
    void Promise.resolve(completion).then(settled, rejected)
  }

  return {
    emit(event) {
      if (pending >= maxPending) {
        dropped += 1
        return
      }
      let completion: unknown
      try {
        completion = observer(Object.freeze({ kind: event.kind, level: event.level }))
      } catch {
        failed += 1
        return
      }
      watch(completion)
    },
    counters() {
      return Object.freeze({ failed, pending, dropped })
    },
  }
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    (typeof value === 'object' || typeof value === 'function') &&
    value !== null &&
    'then' in value &&
    typeof value.then === 'function'
  )
}
