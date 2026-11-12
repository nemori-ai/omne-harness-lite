// The bounded waiting list of one admission point (sql-contract SPEC 准入等待; the model is
// sql-contract verification/models/admission-wait). A request that cannot get its reservation
// waits in arrival order until returned room lets it in, its deadline passes, its signal aborts
// or the provider closes. Nothing is sent while it waits. Every change of what is held or who
// waits ends with `scan`, which is the model's `Scan`.

/** Whether a need fits what is held now, is blocked by its own domain only, or by a global bound. */
export type Fit = 'fits' | 'domain' | 'global'

/**
 * The configuration relations make every need that reaches the point fit once enough is returned
 * (sql-contract SPEC 准入等待 rule 1), so there is no need that waits for room that cannot come.
 */
export type Resource<N> = Readonly<{
  fit(need: N): Fit
  /** Takes what the need holds; returns the function that gives it back. */
  take(need: N): () => void
}>

export type Granted = Readonly<{ kind: 'granted'; release(): void }>
export type Acquired =
  | Granted
  | Readonly<{ kind: 'full' }>
  | Readonly<{ kind: 'expired' }>
  | Readonly<{ kind: 'aborted' }>
  | Readonly<{ kind: 'closing' }>

/** The waiters of one point: at most `perDomain` per domain and `global` in all. */
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

  /**
   * Arrives with `need`. It joins the end of the list and takes part in the scan, so it never
   * takes room before an earlier waiter. An answer known at the call (granted by the first scan,
   * refused, `waitMs` 0) is returned as a value, so an uncontended caller goes on in the same
   * turn, as it did before the waiting list; only a waiter gets a promise.
   */
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

  /** Every waiter ends with `closing`; later arrivals too. */
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

  /** Grants what fits, skips what only its own domain blocks, stops at a global bound. */
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
    // Only a waiter leaves: settle clears its timer and its abort listener when it is granted.
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
