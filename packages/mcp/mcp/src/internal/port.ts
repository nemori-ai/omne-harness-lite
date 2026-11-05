// How this package waits on a port. Every port call goes through `ask`: a port answers, or it
// breaches its contract by rejecting or by throwing when it is called. Both breaches read the same
// way, as the answer SPEC MC-15 gives that port (`whenBreached`), so no port failure leaves this
// package as an exception and no port promise is left without a handler. A wait under a bound is
// `waitAtMost` for work that another caller owns, and `within` for work the caller owns: when the
// bound fires first, the caller answers; `within` hands the work on to the table's scope, which
// settles what it hands over.
import type { Spawn } from './scope.ts'

export function ask<T>(call: () => Promise<T>, whenBreached: T): Promise<T> {
  try {
    return call().then(
      answer => answer,
      () => whenBreached,
    )
  } catch {
    return Promise.resolve(whenBreached)
  }
}

/**
 * What a bound is for: the critical section of an `ensure`, a build, a wait on the build of
 * another call (`join`), a listing (SPEC MC-5, invariant 5), or a task request (MC-17).
 */
export type BoundKind = 'section' | 'build' | 'join' | 'listing' | 'task'

/** Starts a bound of `milliseconds`. The table's one source of bounds, so a test can fire them. */
export type StartBound = (milliseconds: number, kind: BoundKind) => AbortSignal

export const startTimeout: StartBound = milliseconds => AbortSignal.timeout(milliseconds)

export type Bounded<T> = Readonly<{ kind: 'answered'; value: T }> | Readonly<{ kind: 'expired' }>

const EXPIRED: Bounded<never> = { kind: 'expired' }

/** How what a port hands over after its bound is closed, stopped or released. */
export type Settle<T> = (late: T) => Promise<void>

/**
 * The race of `work` against `bound`. `onExpire` runs at the moment the bound wins, before any
 * other continuation can touch the work. A bound that fired already wins at once, without a look
 * at the work. An error of the work before the bound rejects the race.
 */
function race<T>(
  work: Promise<T>,
  bound: AbortSignal | undefined,
  onExpire: () => void,
): Promise<Bounded<T>> {
  const answered = (value: T): Bounded<T> => ({ kind: 'answered', value })
  if (bound === undefined) return work.then(answered)
  const expire = (): Bounded<T> => {
    onExpire()
    return EXPIRED
  }
  if (bound.aborted) return Promise.resolve(expire())
  return new Promise((resolve, reject) => {
    const onAbort = () => resolve(expire())
    bound.addEventListener('abort', onAbort, { once: true })
    work.then(
      value => {
        bound.removeEventListener('abort', onAbort)
        resolve(answered(value))
      },
      (error: unknown) => {
        bound.removeEventListener('abort', onAbort)
        reject(error)
      },
    )
  })
}

/**
 * Waits for `work` that another caller owns, until `bound` fires. Past the bound the work goes
 * on for its owner, who handles its result and its error; this wait only stops looking. Used to
 * join the build of another call and to wait for a close or teardown in flight.
 */
export function waitAtMost<T>(
  work: Promise<T>,
  bound: AbortSignal | undefined,
): Promise<Bounded<T>> {
  return race(work, bound, () => undefined)
}

/**
 * Waits for `work` that the caller owns, until `bound` fires; no bound waits for the work. When
 * the bound comes first, the work goes on in `scope`, which keeps an error it raises. `onExpiry`
 * runs at that moment, before anything else can happen to the work, and answers how to settle
 * what the work hands over later.
 */
export function within<T>(
  work: Promise<T>,
  bound: AbortSignal | undefined,
  scope: Spawn,
  onExpiry?: () => Settle<T>,
): Promise<Bounded<T>> {
  return race(work, bound, () => {
    scope.spawn(onExpiry === undefined ? work : work.then(onExpiry()))
  })
}
