// How this package waits on a port. Every port call goes through `ask`: a port answers, or it
// breaches its contract by rejecting or by throwing when it is called. Both breaches read the same
// way, as the answer SPEC MC-15 gives that port (`whenBreached`), so no port failure leaves this
// package as an exception and no port promise is left without a handler. A wait under a bound is
// `within`: when the bound fires first, the caller answers and the work goes on in the table's
// scope, which settles what it hands over.
import type { TaskScope } from './scope.ts'

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
 * another call (`join`), or a listing (SPEC MC-5, invariant 5).
 */
export type BoundKind = 'section' | 'build' | 'join' | 'listing'

/** Starts a bound of `milliseconds`. The table's one source of bounds, so a test can fire them. */
export type StartBound = (milliseconds: number, kind: BoundKind) => AbortSignal

export const startTimeout: StartBound = milliseconds => AbortSignal.timeout(milliseconds)

export type Bounded<T> = Readonly<{ kind: 'answered'; value: T }> | Readonly<{ kind: 'expired' }>

const EXPIRED: Bounded<never> = { kind: 'expired' }

/** How what a port hands over after its bound is closed, stopped or released. */
export type Settle<T> = (late: T) => Promise<void>

/**
 * Waits for `work` until `bound` fires; no bound waits for the work. A bound that fired already
 * answers `expired` at once, without a look at the work. When the bound comes first, `work` goes
 * on in `scope`. `onExpiry` runs at that moment, before anything else can happen to the work,
 * and answers how to settle what the work hands over later.
 */
export function within<T>(
  work: Promise<T>,
  bound: AbortSignal | undefined,
  scope: TaskScope,
  onExpiry?: () => Settle<T>,
): Promise<Bounded<T>> {
  const answered = (value: T): Bounded<T> => ({ kind: 'answered', value })
  if (bound === undefined) return work.then(answered)
  const expire = (): Bounded<T> => {
    scope.spawn(onExpiry === undefined ? work : work.then(onExpiry()))
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
