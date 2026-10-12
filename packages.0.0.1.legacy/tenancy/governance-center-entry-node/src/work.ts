export interface GovernanceCenterLogger {
  debug(message: string, ...values: unknown[]): void
  info(message: string, ...values: unknown[]): void
  error(message: string, ...values: unknown[]): void
}

export interface GovernanceCenterWork {
  setup(): Promise<void>
  close(): Promise<void>
}

export class GovernanceCenterWorkStopped extends Error {
  override readonly name = 'GovernanceCenterWorkStopped'
  constructor() {
    super('Governance center work has stopped')
  }
}

/** Save the result before callbacks can synchronously reenter this owner. */
export function createWork(
  setup: (isCurrent: () => boolean) => Promise<void>,
  stop: () => void,
  release: () => Promise<void>,
  isCurrent: () => boolean,
  unsubscribe: () => void,
): GovernanceCenterWork {
  let started: PromiseWithResolvers<void> | undefined
  let closing: PromiseWithResolvers<void> | undefined
  let stopped = false
  const current = (): boolean => !stopped && isCurrent()
  return {
    setup() {
      if (started !== undefined) return started.promise
      started = Promise.withResolvers<void>()
      void started.promise.catch(() => undefined)
      if (stopped) started.reject(new GovernanceCenterWorkStopped())
      else {
        try {
          void setup(current).then(started.resolve, started.reject)
        } catch (error) {
          started.reject(error)
        }
      }
      return started.promise
    },
    close() {
      if (closing !== undefined) return closing.promise
      closing = Promise.withResolvers<void>()
      void closing.promise.catch(() => undefined)
      stopped = true
      const errors: unknown[] = []
      try {
        stop()
      } catch (error) {
        errors.push(error)
      }
      const cleanup = async (): Promise<void> => {
        await started?.promise.catch(() => undefined)
        try {
          await release()
        } catch (error) {
          errors.push(error)
        }
        try {
          unsubscribe()
        } catch (error) {
          errors.push(error)
        }
        if (errors.length === 1) throw errors[0]
        if (errors.length > 1)
          throw new AggregateError(errors, 'Governance center stop and cleanup failed')
      }
      void cleanup().then(closing.resolve, closing.reject)
      return closing.promise
    },
  }
}

/** Register accepted business before calling a dependency that can request close. */
export function runOwned<T>(jobs: Set<Promise<unknown>>, work: () => Promise<T>): Promise<T> {
  const job = Promise.withResolvers<T>()
  jobs.add(job.promise)
  void job.promise.then(
    () => jobs.delete(job.promise),
    () => jobs.delete(job.promise),
  )
  try {
    job.resolve(work())
  } catch (error) {
    job.reject(error)
  }
  return job.promise
}

export function releaseSubscriptions(subscriptions: (() => void)[]): void {
  const errors: unknown[] = []
  for (const unsubscribe of subscriptions.splice(0).reverse()) {
    try {
      unsubscribe()
    } catch (error) {
      errors.push(error)
    }
  }
  if (errors.length === 1) throw errors[0]
  if (errors.length > 1)
    throw new AggregateError(errors, 'Governance center subscription cleanup failed')
}
