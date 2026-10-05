import {
  GovernanceTransportStopped,
  type GovernanceTransport,
  type PublicHealthOptions,
} from '@omne-harness-lite/governance-center-entry-https-json'
import { readPublicHealth } from './health.ts'
import { exchangeGovernance } from './governance.ts'

export interface GovernanceTransportInstance extends GovernanceTransport {
  close(): Promise<void>
}

/** Owns only requests admitted through this instance. */
export function createGovernanceTransport(): GovernanceTransportInstance {
  return new Transport()
}

class Transport implements GovernanceTransportInstance {
  readonly #jobs = new Set<Promise<unknown>>()
  #closing: Promise<void> | undefined

  #admit<T>(work: () => Promise<T>): Promise<T> {
    if (this.#closing) return Promise.reject(new GovernanceTransportStopped())
    const completion = Promise.withResolvers<T>()
    const job = completion.promise
    this.#jobs.add(job)
    void job.then(
      () => this.#jobs.delete(job),
      () => this.#jobs.delete(job),
    )
    try {
      completion.resolve(work())
    } catch (error) {
      completion.reject(error)
    }
    return job
  }

  readPublicHealth(options: PublicHealthOptions) {
    return this.#admit(() => readPublicHealth(options))
  }
  exchangeGovernance(options: PublicHealthOptions, input: unknown) {
    return this.#admit(() => exchangeGovernance(options, input))
  }
  close(): Promise<void> {
    this.#closing ??= Promise.allSettled([...this.#jobs]).then(() => undefined)
    return this.#closing
  }
}
