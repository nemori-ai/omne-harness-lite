// Admission counters (SPEC 7.2 step 8, 6.2 step 8, 8). A reservation is taken before an operation
// is sent, and it is returned exactly once when the result owner has the result, or the send
// failed. A caller that stops observing does not return it (SPEC 7.1).
import type { SqliteStorageConfig } from './config.ts'

export type Grant = Readonly<{ release(): void }>

/** A per-domain and a global counter with their limits. */
class Pool {
  private readonly perDomain = new Map<string, number>()
  private total = 0
  private readonly limitPerDomain: number
  private readonly limitGlobal: number

  constructor(limitPerDomain: number, limitGlobal: number) {
    this.limitPerDomain = limitPerDomain
    this.limitGlobal = limitGlobal
  }

  canTake(domain: string): boolean {
    return (this.perDomain.get(domain) ?? 0) < this.limitPerDomain && this.total < this.limitGlobal
  }

  take(domain: string): void {
    this.perDomain.set(domain, (this.perDomain.get(domain) ?? 0) + 1)
    this.total += 1
  }

  give(domain: string): void {
    const left = (this.perDomain.get(domain) ?? 1) - 1
    if (left <= 0) this.perDomain.delete(domain)
    else this.perDomain.set(domain, left)
    this.total -= 1
  }
}

export class Admission {
  private readonly writes: Pool
  private readonly controls: Pool
  private readonly queries: Pool
  private inFlightBytes = 0
  private responseBytes = 0
  private readonly config: SqliteStorageConfig

  constructor(config: SqliteStorageConfig) {
    this.config = config
    this.writes = new Pool(config.admissionQueueLimit, config.globalAdmissionLimit)
    this.controls = new Pool(config.controlQueuePerDomain, config.controlQueueGlobal)
    this.queries = new Pool(config.queryQueuePerDomain, config.queryQueueGlobal)
  }

  /** One commit: a count, the request bytes and the response allowance (SPEC 7.2 step 8). */
  reserveWrite(domain: string, requestBytes: number): Grant | null {
    const { globalInFlightWriteBytes, maxOperationResponseBytes, globalWriteResponseBytes } =
      this.config
    if (
      !this.writes.canTake(domain) ||
      this.inFlightBytes + requestBytes > globalInFlightWriteBytes ||
      this.responseBytes + maxOperationResponseBytes > globalWriteResponseBytes
    )
      return null
    this.writes.take(domain)
    this.inFlightBytes += requestBytes
    this.responseBytes += maxOperationResponseBytes
    return once(() => {
      this.writes.give(domain)
      this.inFlightBytes -= requestBytes
      this.responseBytes -= maxOperationResponseBytes
    })
  }

  /** One control message: a registration (SPEC 6.2 step 8). */
  reserveControl(domain: string): Grant | null {
    return this.reserve(this.controls, domain)
  }

  reserveQuery(domain: string): Grant | null {
    return this.reserve(this.queries, domain)
  }

  private reserve(pool: Pool, domain: string): Grant | null {
    if (!pool.canTake(domain)) return null
    pool.take(domain)
    return once(() => pool.give(domain))
  }
}

function once(release: () => void): Grant {
  let done = false
  return {
    release() {
      if (done) return
      done = true
      release()
    },
  }
}

/** Identities that are queued, sent or waiting for a result (SPEC 8, pending index). */
export class PendingIndex {
  private readonly counts = new Map<string, number>()

  add(key: string): void {
    this.counts.set(key, (this.counts.get(key) ?? 0) + 1)
  }

  remove(key: string): void {
    const left = (this.counts.get(key) ?? 1) - 1
    if (left <= 0) this.counts.delete(key)
    else this.counts.set(key, left)
  }

  has(key: string): boolean {
    return this.counts.has(key)
  }
}
