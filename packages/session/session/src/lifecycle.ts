// The run state of one instance (SPEC「资源与替换」): whether it is closed, the work in flight, and the
// signal that cancels clock waits. `close` stops new triggers first, then lets the work in flight
// end; it rolls nothing back and sends nothing. It also keeps the named diagnostics of the
// coordinators and hands each to the observer of the factory, if one was given.
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

  /** Aborted at close: every clock wait of a scheduler ends as `cancelled`. */
  get signal(): AbortSignal {
    return this.#abort.signal
  }

  /** Keeps `work` until it settles, so `close` can wait for it. Its rejection stays with the caller. */
  track<T>(work: Promise<T>): Promise<T> {
    this.#inflight.add(work)
    const forget = (): void => {
      this.#inflight.delete(work)
    }
    work.then(forget, forget)
    return work
  }

  /**
   * Runs `work` in the background. A rejection is a defect of this member: it is kept in `faults`
   * (the dependencies have no diagnostics channel yet) and never becomes an unhandled rejection.
   */
  spawn(work: () => Promise<void>): void {
    if (this.#closed) return
    this.track(
      work().catch((error: unknown) => {
        if (this.#faults.length < FAULT_LIMIT) this.#faults.push(error)
      }),
    ).catch(() => undefined)
  }

  /**
   * Records a step that stopped on a failure (SPEC C2 失败分支「停止并记诊断」). It is kept in
   * `faults` with the defects and handed to the observer; an observer that throws changes nothing.
   */
  diagnose(diagnostic: SessionDiagnostic): void {
    if (this.#faults.length < FAULT_LIMIT) this.#faults.push(diagnostic)
    try {
      this.#diagnose?.(diagnostic)
    } catch {
      // The observer's own failure leaves no trace (SessionDiagnose).
    }
  }

  /** The defects and diagnostics of background work, oldest first, at most FAULT_LIMIT. */
  get faults(): readonly unknown[] {
    return [...this.#faults]
  }

  async close(): Promise<void> {
    this.#closed = true
    this.#abort.abort()
    while (this.#inflight.size > 0) await Promise.allSettled(this.#inflight)
  }
}
