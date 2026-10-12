import type { OwnedWork, RetainedCloseAttempt, RetainedCloseControl } from './types.ts'

/** Keep the original close pending until its root confirms completion. */
export function createRetainedWork(
  ready: Promise<void>,
  attemptClose: () => Promise<void>,
): { readonly work: OwnedWork; readonly control: RetainedCloseControl } {
  const first = Promise.withResolvers<RetainedCloseAttempt>()
  const completed = Promise.withResolvers<void>()
  let stopping = false
  let closed = false
  let inFlight: Promise<RetainedCloseAttempt> | undefined
  let latest: Promise<RetainedCloseAttempt> | undefined

  function attempt(): Promise<RetainedCloseAttempt> {
    if (closed) return Promise.resolve('closed')
    if (inFlight) return inFlight
    const pending = Promise.resolve()
      .then(attemptClose)
      .then(
        () => {
          closed = true
          completed.resolve()
          return 'closed' as const
        },
        () => 'retained' as const,
      )
    latest = pending
    inFlight = pending
    void pending.then(() => {
      if (inFlight === pending) inFlight = undefined
    })
    return pending
  }

  const work: OwnedWork = Object.freeze({
    ready,
    close() {
      if (!stopping) {
        stopping = true
        void attempt().then(first.resolve)
      }
      return completed.promise
    },
  })
  const control: RetainedCloseControl = Object.freeze({
    closeAttempt() {
      return latest ?? first.promise
    },
    retryClose() {
      return stopping ? attempt() : first.promise
    },
  })
  return Object.freeze({ work, control })
}
