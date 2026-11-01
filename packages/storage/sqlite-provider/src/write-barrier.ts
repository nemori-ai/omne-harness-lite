// The read barrier of a domain (SPEC 9.3, domain-serial). Writes that are already sent count as
// admitted. A barrier request waits for them, and from the moment it queues, later writes and
// later barriers wait behind it. The barrier is held until the read transaction has ended or the
// exit of the read Worker is observed. The first version covers the whole physical domain.
type DomainGate = {
  /** Writes that entered and have not left. */
  writes: number
  held: boolean
  /** Barrier requests in arrival order. */
  queued: number
  watchers: (() => void)[]
}

export class WriteBarrier {
  private readonly gates = new Map<string, DomainGate>()

  private gate(domain: string): DomainGate {
    let gate = this.gates.get(domain)
    if (gate === undefined) {
      gate = { writes: 0, held: false, queued: 0, watchers: [] }
      this.gates.set(domain, gate)
    }
    return gate
  }

  private changed(gate: DomainGate): void {
    for (const watcher of gate.watchers.splice(0)) watcher()
  }

  private wait(gate: DomainGate): Promise<void> {
    return new Promise(resolve => gate.watchers.push(resolve))
  }

  /** A write enters when no barrier is held or queued. The returned function leaves. */
  async enterWrite(domain: string): Promise<() => void> {
    const gate = this.gate(domain)
    while (gate.held || gate.queued > 0) await this.wait(gate)
    gate.writes += 1
    let left = false
    return () => {
      if (left) return
      left = true
      gate.writes -= 1
      this.changed(gate)
    }
  }

  /** Waits for its turn and for the admitted writes to end. The returned function releases. */
  async acquire(domain: string): Promise<() => void> {
    const gate = this.gate(domain)
    gate.queued += 1
    while (gate.held || gate.writes > 0) await this.wait(gate)
    gate.queued -= 1
    gate.held = true
    let released = false
    return () => {
      if (released) return
      released = true
      gate.held = false
      this.changed(gate)
    }
  }
}
