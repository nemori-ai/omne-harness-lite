import { requestStopAndWait } from './settlement-stop.ts'
import type { SettlementRegistration, SettlementTask, SettlementOwner } from './settlement-types.ts'

interface ReadScope {
  readonly registration: SettlementRegistration
  readonly tasks: SettlementTask<unknown>[]
  stopRequested: boolean
  finish?: Promise<void>
}

/** Own every admitted read from registration through actual stop, including rejected completions. */
export class OwnedReadTracker {
  readonly #scopes = new Set<ReadScope>()
  #closed = false

  get closed(): boolean {
    return this.#closed
  }

  add(registration: SettlementRegistration): ReadScope | undefined {
    if (this.#closed) return undefined
    const scope: ReadScope = { registration, tasks: [], stopRequested: false }
    this.#scopes.add(scope)
    return scope
  }

  stop(scope: ReadScope): void {
    scope.stopRequested = true
    for (const task of scope.tasks) {
      try {
        task.requestStop()
      } catch {
        // A failed stop request cannot certify the actual stopped promise.
      }
    }
  }

  finish(scope: ReadScope): Promise<void> {
    scope.finish ??= (async () => {
      await Promise.all(scope.tasks.map(requestStopAndWait))
      scope.registration.release()
      this.#scopes.delete(scope)
    })()
    return scope.finish
  }

  async drain(): Promise<{ readonly released: true } | { readonly unavailable: true }> {
    const scopes = [...this.#scopes]
    for (const scope of scopes) this.stop(scope)
    await Promise.allSettled(scopes.map(scope => this.finish(scope)))
    return this.#scopes.size === 0 ? { released: true } : { unavailable: true }
  }

  async close(): Promise<{ readonly released: true } | { readonly unavailable: true }> {
    this.#closed = true
    return await this.drain()
  }
}

/** A read-only operation's backend tasks remain owned until actual stop. */
export async function withOwnedReads<T>(
  owner: SettlementOwner,
  concurrent: import('@omne-harness-lite/content-blocks').JsonNumber,
  tracker: OwnedReadTracker,
  work: (registration: SettlementRegistration) => Promise<T>,
): Promise<{ readonly ok: T } | { readonly unavailable: true }> {
  if (tracker.closed || owner.admission() !== 'open') return { unavailable: true }
  const grant = owner.acquire(concurrent)
  if ('unavailable' in grant) return { unavailable: true }
  const scope = tracker.add(grant.registration)
  if (scope === undefined) {
    grant.registration.release()
    return { unavailable: true }
  }
  const registration: SettlementRegistration = {
    start(kind, operation) {
      if (scope.stopRequested) throw new Error('read scope closing')
      const task = grant.registration.start(kind, operation)
      scope.tasks.push(task)
      return task
    },
    release: grant.registration.release,
  }
  let result: T
  try {
    result = await work(registration)
  } catch {
    tracker.stop(scope)
    tracker.finish(scope).catch(() => {
      // The scope remains owned if actual stop or release failed.
    })
    return { unavailable: true }
  }
  try {
    await tracker.finish(scope)
    return { ok: result }
  } catch {
    return { unavailable: true }
  }
}
