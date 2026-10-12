import { combineFailure } from './failure.ts'
import { StorageDefect } from '@omne-harness-lite/storage'

interface Resource {
  readonly close: () => void | Promise<void>
  readonly isClosed?: () => boolean
  pending: Promise<void> | undefined
}

/** A failed close must not let GC silently discard the remaining resource owner. */
const retainedScopes = new Set<SnapshotResources>()

export class SnapshotResources {
  readonly #resources = new Set<Resource>()
  #accepting = true
  #closeFailed = false
  #failure: unknown

  get closeFailed(): boolean {
    return this.#closeFailed
  }

  assertClean(): void {
    if (this.#closeFailed) throw this.#failure
  }

  get settled(): boolean {
    return this.#resources.size === 0
  }

  own(close: () => void | Promise<void>, isClosed?: () => boolean): () => Promise<void> {
    if (!this.#accepting) throw new StorageDefect('snapshot resource scope has ended')
    const resource: Resource = {
      close,
      pending: undefined,
      ...(isClosed === undefined ? {} : { isClosed }),
    }
    this.#resources.add(resource)
    retainedScopes.add(this)
    return () => this.#release(resource)
  }

  #forget(resource: Resource): void {
    this.#resources.delete(resource)
    if (this.settled) retainedScopes.delete(this)
  }

  #release(resource: Resource): Promise<void> {
    if (!this.#resources.has(resource)) return Promise.resolve()
    resource.pending ??= (async () => {
      try {
        await resource.close()
        if (resource.isClosed?.() === false)
          throw new StorageDefect('resource close returned while still open')
        this.#forget(resource)
      } catch (error) {
        this.#failure = this.#closeFailed ? combineFailure(this.#failure, error) : error
        this.#closeFailed = true
        // Some APIs can throw after the resource has actually closed. Preserve the
        // error, but use an explicit API observation rather than guessing ownership.
        if (resource.isClosed?.() === true) this.#forget(resource)
        throw error
      }
    })().finally(() => {
      resource.pending = undefined
    })
    return resource.pending
  }

  /** Retry is explicit resource cleanup; it never replays an export or publication. */
  async close(): Promise<void> {
    this.#accepting = false
    let firstFailure: unknown
    let failed = false
    for (const resource of [...this.#resources].reverse()) {
      try {
        await this.#release(resource)
      } catch (error) {
        firstFailure = failed ? combineFailure(firstFailure, error) : error
        failed = true
      }
    }
    if (failed) throw firstFailure
  }
}
