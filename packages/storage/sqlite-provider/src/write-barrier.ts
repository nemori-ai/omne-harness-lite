// The read barrier of a domain (SQL contract SPEC 9.3, domain-serial). Writes and barrier requests
// of one domain share one arrival order. A write enters when no barrier is ahead of it, so writes
// run side by side. A barrier is held when nothing is ahead of it: it waits for the writes that
// entered before it, and the writes and barriers that arrive later wait behind it. Neither side
// can starve the other. Every wait is bounded by its caller, with a signal, a time limit or both;
// a request that expires or is aborted while it waits is withdrawn and keeps no place in the order.
// The first version covers the whole physical domain.

type Entry = {
  readonly kind: 'write' | 'barrier'
  /** Set while the entry waits. Null once it was granted or withdrawn. */
  grant: (() => void) | null
}

export type BarrierWait = Readonly<{
  /** Withdraws the request while it waits. It has no effect once the request was granted. */
  signal?: AbortSignal
  /** Withdraws the request when it has waited this long. */
  timeoutMs?: number
}>

export type BarrierOutcome =
  /** `release` is the leave of a write or the release of a barrier. The second call does nothing. */
  Readonly<{ kind: 'granted'; release(): void }> | Readonly<{ kind: 'withdrawn' }>

export class WriteBarrier {
  /** Entries of a domain in arrival order: waiting and granted ones. Absent when empty. */
  private readonly gates = new Map<string, Entry[]>()

  /** A write enters when no barrier is ahead of it in the order of its domain. */
  enterWrite(domain: string, wait: BarrierWait): Promise<BarrierOutcome> {
    return this.join(domain, 'write', wait)
  }

  /** A barrier is held when nothing is ahead of it in the order of its domain. */
  acquire(domain: string, wait: BarrierWait): Promise<BarrierOutcome> {
    return this.join(domain, 'barrier', wait)
  }

  private join(domain: string, kind: Entry['kind'], wait: BarrierWait): Promise<BarrierOutcome> {
    if (wait.signal?.aborted === true) return Promise.resolve({ kind: 'withdrawn' })
    return new Promise(resolve => {
      const entry: Entry = { kind, grant: null }
      let timer: NodeJS.Timeout | null = null
      const stopWaiting = (): void => {
        if (timer !== null) clearTimeout(timer)
        timer = null
        wait.signal?.removeEventListener('abort', withdraw)
        entry.grant = null
      }
      const withdraw = (): void => {
        stopWaiting()
        this.remove(domain, entry)
        resolve({ kind: 'withdrawn' })
      }
      entry.grant = () => {
        stopWaiting()
        let released = false
        resolve({
          kind: 'granted',
          release: () => {
            if (released) return
            released = true
            this.remove(domain, entry)
          },
        })
      }
      wait.signal?.addEventListener('abort', withdraw, { once: true })
      if (wait.timeoutMs !== undefined) timer = setTimeout(withdraw, wait.timeoutMs)
      this.gate(domain).push(entry)
      this.advance(domain)
    })
  }

  private gate(domain: string): Entry[] {
    let entries = this.gates.get(domain)
    if (entries === undefined) {
      entries = []
      this.gates.set(domain, entries)
    }
    return entries
  }

  private remove(domain: string, entry: Entry): void {
    const entries = this.gates.get(domain)
    if (entries === undefined) return
    const at = entries.indexOf(entry)
    if (at >= 0) entries.splice(at, 1)
    if (entries.length === 0) this.gates.delete(domain)
    else this.advance(domain)
  }

  /** Grants what the order allows: writes up to the first barrier, that barrier when it is first. */
  private advance(domain: string): void {
    const entries = this.gates.get(domain)
    if (entries === undefined) return
    for (const entry of entries) {
      if (entry.kind === 'barrier') {
        if (entry === entries[0]) entry.grant?.()
        return
      }
      entry.grant?.()
    }
  }
}
