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

export type BoundKind = 'section' | 'build' | 'join' | 'listing' | 'task'

export type StartBound = (milliseconds: number, kind: BoundKind) => AbortSignal

export const startTimeout: StartBound = milliseconds => AbortSignal.timeout(milliseconds)

export type Bounded<T> = Readonly<{ kind: 'answered'; value: T }> | Readonly<{ kind: 'expired' }>

const EXPIRED: Bounded<never> = { kind: 'expired' }

export type Settle<T> = (late: T) => Promise<void>

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

export function waitAtMost<T>(
  work: Promise<T>,
  bound: AbortSignal | undefined,
): Promise<Bounded<T>> {
  return race(work, bound, () => undefined)
}

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
