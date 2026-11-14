type Entry = {
  readonly kind: 'write' | 'barrier'
  grant: (() => void) | null
}

export type BarrierWait = Readonly<{
  signal?: AbortSignal
  timeoutMs?: number
}>

export type WithdrawnCause = 'aborted' | 'expired'

export type BarrierOutcome =
  | Readonly<{ kind: 'granted'; release(): void }>
  | Readonly<{ kind: 'withdrawn'; cause: WithdrawnCause }>

export class WriteBarrier {
  private readonly gates = new Map<string, Entry[]>()

  enterWrite(domain: string, wait: BarrierWait): Promise<BarrierOutcome> {
    return this.join(domain, 'write', wait)
  }

  acquire(domain: string, wait: BarrierWait): Promise<BarrierOutcome> {
    return this.join(domain, 'barrier', wait)
  }

  private join(domain: string, kind: Entry['kind'], wait: BarrierWait): Promise<BarrierOutcome> {
    if (wait.signal?.aborted === true)
      return Promise.resolve({ kind: 'withdrawn', cause: 'aborted' })
    return new Promise(resolve => {
      const entry: Entry = { kind, grant: null }
      let timer: NodeJS.Timeout | null = null
      const stopWaiting = (): void => {
        if (timer !== null) clearTimeout(timer)
        timer = null
        wait.signal?.removeEventListener('abort', onAbort)
        entry.grant = null
      }
      const withdraw = (cause: WithdrawnCause): void => {
        stopWaiting()
        this.remove(domain, entry)
        resolve({ kind: 'withdrawn', cause })
      }
      const onAbort = (): void => withdraw('aborted')
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
      wait.signal?.addEventListener('abort', onAbort, { once: true })
      if (wait.timeoutMs !== undefined)
        timer = setTimeout(() => withdraw('expired'), wait.timeoutMs)
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
