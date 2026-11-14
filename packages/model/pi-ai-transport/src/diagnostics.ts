export type TransportDiagnostic =
  | Readonly<{
      kind: 'exchange-started' | 'connect-failed' | 'error-body-too-large' | 'exchange-stopped'
      level: 'info' | 'error'
    }>
  | Readonly<{
      kind: 'connect-retry'
      level: 'info'
      attempt: number
      delayMs: number
      reason: 'connect-failed' | 'connect-timeout'
    }>

export type DiagnosticObserver = (event: TransportDiagnostic) => unknown

export type DiagnosticCounters = Readonly<{
  failed: number
  pending: number
  dropped: number
}>

export interface IsolatedDiagnostics {
  emit(event: TransportDiagnostic): void
  counters(): DiagnosticCounters
}

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
        completion = observer(copyOf(event))
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

function copyOf(event: TransportDiagnostic): TransportDiagnostic {
  if (event.kind === 'connect-retry') {
    const { kind, level, attempt, delayMs, reason } = event
    return Object.freeze({ kind, level, attempt, delayMs, reason })
  }
  return Object.freeze({ kind: event.kind, level: event.level })
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    (typeof value === 'object' || typeof value === 'function') &&
    value !== null &&
    'then' in value &&
    typeof value.then === 'function'
  )
}

export type ConnectRetryDiagnostic = Extract<TransportDiagnostic, { kind: 'connect-retry' }>
