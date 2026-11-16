import type { SessionDiagnose, SessionDiagnostic } from './diagnostics.ts'

const FAULT_LIMIT = 64

export class Lifecycle {
  #closed = false
  readonly #faults: unknown[] = []
  readonly #inflight = new Set<Promise<unknown>>()
  readonly #abort = new AbortController()
  readonly #diagnose: SessionDiagnose | undefined

  constructor(diagnose?: SessionDiagnose) {
    this.#diagnose = diagnose
  }

  get closed(): boolean {
    return this.#closed
  }

  get signal(): AbortSignal {
    return this.#abort.signal
  }

  track<T>(work: Promise<T>): Promise<T> {
    this.#inflight.add(work)
    const forget = (): void => {
      this.#inflight.delete(work)
    }
    work.then(forget, forget)
    return work
  }

  spawn(work: () => Promise<void>): void {
    if (this.#closed) return
    this.track(
      work().catch((error: unknown) => {
        if (this.#faults.length < FAULT_LIMIT) this.#faults.push(error)
      }),
    ).catch(() => undefined)
  }

  diagnose(diagnostic: SessionDiagnostic): void {
    if (this.#faults.length < FAULT_LIMIT) this.#faults.push(diagnostic)
    try {
      this.#diagnose?.(diagnostic)
    } catch {}
  }

  get faults(): readonly unknown[] {
    return [...this.#faults]
  }

  async close(): Promise<void> {
    this.#closed = true
    this.#abort.abort()
    while (this.#inflight.size > 0) await Promise.allSettled(this.#inflight)
  }
}
