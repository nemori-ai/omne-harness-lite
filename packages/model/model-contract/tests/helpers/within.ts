// A bound on the wait for a promise of a test double. Every await on a double goes through it, so
// a lost wake-up (a resolver that is never called) fails fast with the name of the stalled wait
// instead of hanging until the test time limit. It changes nothing in the doubles' own timing.

/** How long a double may take to settle a promise; its work is in-memory, so this is generous. */
const LIMIT_MS = 1000

/** The failure of a wait that a double never settled. */
export class StalledWaitError extends Error {
  constructor(label: string, ms: number) {
    super(`${label} did not settle within ${ms} ms`)
    this.name = 'StalledWaitError'
  }
}

/** `promise`, or a `StalledWaitError` named `label` when it does not settle within `ms`. */
export function within<T>(promise: PromiseLike<T>, label: string, ms = LIMIT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const stalled = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new StalledWaitError(label, ms)), ms)
  })
  return Promise.race([Promise.resolve(promise), stalled]).finally(() => clearTimeout(timer))
}
