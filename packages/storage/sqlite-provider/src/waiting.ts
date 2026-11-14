export type Fit = 'fits' | 'domain' | 'global'

export type Resource<N> = Readonly<{
  fit(need: N): Fit
  take(need: N): () => void
}>

export type Granted = Readonly<{ kind: 'granted'; release(): void }>
export type Acquired =
  | Granted
  | Readonly<{ kind: 'full' }>
  | Readonly<{ kind: 'expired' }>
  | Readonly<{ kind: 'aborted' }>
  | Readonly<{ kind: 'closing' }>

export type WaitLimits = Readonly<{ perDomain: number; global: number }>

type Waiter<N> = {
  readonly need: N
  resolve: (acquired: Acquired) => void
  timer: NodeJS.Timeout | undefined
  readonly signal: AbortSignal | undefined
  readonly onAbort: () => void
}

export class WaitingQueue<N extends Readonly<{ domain: string }>> {
  private readonly resource: Resource<N>
  private readonly limits: WaitLimits
  private readonly waiters: Waiter<N>[] = []
  private closed = false

  constructor(resource: Resource<N>, limits: WaitLimits) {
    this.resource = resource
    this.limits = limits
  }

  acquire(need: N, waitMs: number, signal?: AbortSignal): Acquired | Promise<Acquired> {
    if (this.closed) return { kind: 'closing' }
    if (signal?.aborted === true) return { kind: 'aborted' }
    if (this.listFull(need.domain)) return { kind: 'full' }
    let answer: Acquired | null = null
    const waiter: Waiter<N> = {
      need,
      resolve: acquired => void (answer = acquired),
      timer: undefined,
      signal,
      onAbort: () => this.leave(waiter, { kind: 'aborted' }),
    }
    this.waiters.push(waiter)
    this.scan()
    if (answer !== null) return answer
    if (waitMs === 0) {
      const expired: Acquired = { kind: 'expired' }
      this.leave(waiter, expired)
      return expired
    }
    return new Promise<Acquired>(resolve => {
      waiter.resolve = resolve
      waiter.timer = setTimeout(() => this.leave(waiter, { kind: 'expired' }), waitMs)
      signal?.addEventListener('abort', waiter.onAbort)
    })
  }

  close(): void {
    this.closed = true
    for (const waiter of this.waiters.splice(0)) this.settle(waiter, { kind: 'closing' })
  }

  private listFull(domain: string): boolean {
    if (this.waiters.length >= this.limits.global) return true
    return (
      this.waiters.filter(waiter => waiter.need.domain === domain).length >= this.limits.perDomain
    )
  }

  private scan(): void {
    let index = 0
    while (index < this.waiters.length) {
      const waiter = this.waiters[index]!
      const fit = this.resource.fit(waiter.need)
      if (fit === 'fits') {
        this.waiters.splice(index, 1)
        this.settle(waiter, { kind: 'granted', release: this.grant(waiter.need) })
      } else if (fit === 'domain') index += 1
      else return
    }
  }

  private grant(need: N): () => void {
    const giveBack = this.resource.take(need)
    let done = false
    return () => {
      if (done) return
      done = true
      giveBack()
      this.scan()
    }
  }

  private leave(waiter: Waiter<N>, acquired: Acquired): void {
    const index = this.waiters.indexOf(waiter)
    if (index < 0) return
    this.waiters.splice(index, 1)
    this.settle(waiter, acquired)
    this.scan()
  }

  private settle(waiter: Waiter<N>, acquired: Acquired): void {
    clearTimeout(waiter.timer)
    waiter.signal?.removeEventListener('abort', waiter.onAbort)
    waiter.resolve(acquired)
  }
}
