// The retry of a send whose request bytes never left. This layer knows it: an exchange reports
// `requestMaySent()`, and only a `connect-failed` result with `false` there is retried. Every other
// result, and every failure once the request may have been written, is final.
import type { ConnectionCapacity, ConnectionReservation } from './capacity.ts'
import type { IsolatedDiagnostics } from './diagnostics.ts'
import type { ExchangeRefusal, ExchangeResult, ExchangeStart, HttpExchange } from './http.ts'

export type ConnectRetryInput = Readonly<{
  capacity: Pick<ConnectionCapacity, 'reserve'>
  diagnostics: Pick<IsolatedDiagnostics, 'emit'>
  /** `true` once the network resources close: no retry starts. */
  closed(): boolean
  /** The exchange that already started: attempt 0. */
  first: HttpExchange
  /** Starts the same request again on a held reservation, as `startExchange` does. */
  startAgain(reservation: ConnectionReservation, signal: AbortSignal): ExchangeStart
  /** The wait before each retry; its length is the most retries. */
  backoffMs: readonly number[]
  /** The caller's signal; a retry exchange gets it too. */
  signal: AbortSignal
}>

/**
 * An exchange that starts again while its attempts fail before the request was written. It has
 * the shape of one exchange: `result` settles with the last attempt (or `stopped`), `stop()` ends
 * the running attempt or the wait between two, and `stopped` settles after the last attempt's
 * physical end. The slot is back in the capacity during a wait, and a retry reserves a new one in
 * the FIFO order. The final result keeps its shape: after the last allowed retry the caller sees
 * the last attempt's `connect-failed`.
 */
export function retryBeforeRequestSent(input: ConnectRetryInput): HttpExchange {
  const { capacity, diagnostics, backoffMs, signal } = input
  const result = deferred<ExchangeResult>()
  const stopped = deferred<void>()
  /** Aborts the wait and the reservation of a retry. */
  const waiting = new AbortController()
  let current = input.first
  let stopRequested = false

  const handle: HttpExchange = {
    result: result.promise,
    stop,
    stopped: stopped.promise,
    requestMaySent: () => current.requestMaySent(),
  }
  // The consumer awaits `result`; a rejection before it does so is not an unhandled one.
  result.promise.catch(noop)
  signal.addEventListener('abort', stop, { once: true })
  void run()
  return handle

  function stop(): void {
    stopRequested = true
    waiting.abort()
    current.stop()
  }

  async function run(): Promise<void> {
    try {
      const final = await attempts()
      result.resolve(final)
    } catch (error) {
      result.reject(error instanceof Error ? error : new Error(String(error)))
    }
    signal.removeEventListener('abort', stop)
    await current.stopped.catch(noop)
    stopped.resolve()
  }

  async function attempts(): Promise<ExchangeResult> {
    for (let retry = 0; ; retry += 1) {
      const outcome = await current.result
      const delayMs = backoffMs[retry]
      if (outcome.kind !== 'connect-failed' || current.requestMaySent() || delayMs === undefined)
        return outcome
      // A stop that came after the failure but before this decision wins: nothing is sent again.
      if (stopRequested) return STOPPED
      diagnostics.emit({
        kind: 'connect-retry',
        level: 'info',
        attempt: retry + 1,
        delayMs,
        reason: outcome.timeout ? 'connect-timeout' : 'connect-failed',
      })
      // The failed attempt is closed and its slot is back before the wait starts.
      await current.stopped
      const next = await startAgain(delayMs)
      if (next === 'stopped') return STOPPED
      current = next
    }
  }

  async function startAgain(delayMs: number): Promise<HttpExchange | 'stopped'> {
    if (!(await sleep(delayMs, waiting.signal))) return 'stopped'
    const reservation = await capacity.reserve(waiting.signal)
    if (reservation === undefined) return 'stopped'
    // `stop()` may have come in the same tick as the grant: the slot goes back unused.
    if (stopRequested || input.closed()) {
      reservation.release()
      return 'stopped'
    }
    const started = input.startAgain(reservation, signal)
    if (started.kind === 'started') return started.exchange
    return endOfRefusal(started.reason)
  }
}

const STOPPED: ExchangeResult = Object.freeze({ kind: 'stopped', responded: false })

/** The refusals of a request that the first attempt already sent through the same checks. */
function endOfRefusal(reason: ExchangeRefusal): 'stopped' {
  switch (reason) {
    case 'cancelled':
    case 'resources-closed':
      return 'stopped'
    case 'invalid-url':
    case 'invalid-header':
    case 'invalid-body':
    case 'invalid-limit':
    case 'reservation-unusable':
      throw new Error(`the retry of a checked send was refused as ${reason}`)
    default: {
      const _exhaustive: never = reason
      return _exhaustive
    }
  }
}

/** Resolves `true` after `ms`, `false` as soon as the signal aborts. The timer never outlives either. */
function sleep(ms: number, signal: AbortSignal): Promise<boolean> {
  return new Promise<boolean>(resolve => {
    if (signal.aborted) {
      resolve(false)
      return
    }
    const onAbort = (): void => {
      clearTimeout(timer)
      resolve(false)
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve(true)
    }, ms)
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason: Error) => void
} {
  let resolve: (value: T) => void = noop
  let reject: (reason: Error) => void = noop
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve
    reject = onReject
  })
  return { promise, resolve, reject }
}

function noop(): void {}
