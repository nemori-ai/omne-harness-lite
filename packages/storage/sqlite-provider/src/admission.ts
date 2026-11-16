import type { SqliteStorageConfig } from './config.ts'
import { WaitingQueue, type Acquired, type Fit, type Resource } from './waiting.ts'

export type { Acquired } from './waiting.ts'

class Pool {
  private readonly perDomain = new Map<string, number>()
  private total = 0
  readonly limitPerDomain: number
  readonly limitGlobal: number

  constructor(limitPerDomain: number, limitGlobal: number) {
    this.limitPerDomain = limitPerDomain
    this.limitGlobal = limitGlobal
  }

  fit(domain: string): Fit {
    if ((this.perDomain.get(domain) ?? 0) >= this.limitPerDomain) return 'domain'
    return this.total < this.limitGlobal ? 'fits' : 'global'
  }

  take(domain: string): () => void {
    this.perDomain.set(domain, (this.perDomain.get(domain) ?? 0) + 1)
    this.total += 1
    return () => {
      const left = (this.perDomain.get(domain) ?? 1) - 1
      if (left <= 0) this.perDomain.delete(domain)
      else this.perDomain.set(domain, left)
      this.total -= 1
    }
  }
}

type Slot = Readonly<{ domain: string }>
type Write = Readonly<{ domain: string; requestBytes: number }>

function countedQueue(pool: Pool): WaitingQueue<Slot> {
  const resource: Resource<Slot> = {
    fit: need => pool.fit(need.domain),
    take: need => pool.take(need.domain),
  }
  return new WaitingQueue(resource, { perDomain: pool.limitPerDomain, global: pool.limitGlobal })
}

export class Admission {
  private readonly writes: WaitingQueue<Write>
  private readonly controls: WaitingQueue<Slot>
  private readonly queries: WaitingQueue<Slot>
  private inFlightBytes = 0
  private responseBytes = 0
  private readonly config: SqliteStorageConfig

  constructor(config: SqliteStorageConfig) {
    this.config = config
    const writes = new Pool(config.admissionQueueLimit, config.globalAdmissionLimit)
    const { globalInFlightWriteBytes, maxOperationResponseBytes, globalWriteResponseBytes } = config
    const write: Resource<Write> = {
      fit: need => {
        const counted = writes.fit(need.domain)
        if (counted !== 'fits') return counted
        return this.inFlightBytes + need.requestBytes <= globalInFlightWriteBytes &&
          this.responseBytes + maxOperationResponseBytes <= globalWriteResponseBytes
          ? 'fits'
          : 'global'
      },
      take: need => {
        const giveCount = writes.take(need.domain)
        this.inFlightBytes += need.requestBytes
        this.responseBytes += maxOperationResponseBytes
        return () => {
          giveCount()
          this.inFlightBytes -= need.requestBytes
          this.responseBytes -= maxOperationResponseBytes
        }
      },
    }
    this.writes = new WaitingQueue(write, {
      perDomain: config.admissionQueueLimit,
      global: config.globalAdmissionLimit,
    })
    this.controls = countedQueue(new Pool(config.controlQueuePerDomain, config.controlQueueGlobal))
    this.queries = countedQueue(new Pool(config.queryQueuePerDomain, config.queryQueueGlobal))
  }

  reserveWrite(
    domain: string,
    requestBytes: number,
    signal?: AbortSignal,
  ): Acquired | Promise<Acquired> {
    return this.writes.acquire({ domain, requestBytes }, this.config.admissionWaitMs, signal)
  }

  reserveControl(domain: string): Acquired | Promise<Acquired> {
    return this.controls.acquire({ domain }, this.config.admissionWaitMs)
  }

  reserveQuery(domain: string): Acquired | Promise<Acquired> {
    return this.queries.acquire({ domain }, this.config.admissionWaitMs)
  }

  close(): void {
    this.writes.close()
    this.controls.close()
    this.queries.close()
  }
}

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
