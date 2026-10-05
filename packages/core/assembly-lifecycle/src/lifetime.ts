import type {
  AssemblyCloseReport,
  AssemblyLifetime,
  AssemblyLifetimePort,
  CloseResult,
  LifetimeRegistration,
  OwnedWork,
  RetainedCloseControl,
} from './types.ts'

interface RegisteredWork {
  readonly work: OwnedWork
  readonly ready: Promise<boolean>
  readonly completion: PromiseWithResolvers<CloseResult>
  completed: boolean
}

interface Slot {
  readonly id: string
  readonly port: AssemblyLifetimePort
  registration?: RegisteredWork
  control?: RetainedCloseControl
}

class Lifetime implements AssemblyLifetime {
  readonly ids: readonly string[]
  readonly #slots = new Map<string, Slot>()
  readonly #completion = Promise.withResolvers<AssemblyCloseReport>()
  readonly #onStopping: () => void
  readonly closed = this.#completion.promise
  #claimed = false
  #current = true

  constructor(ids: readonly string[], onStopping: () => void) {
    this.#onStopping = onStopping
    this.ids = Object.freeze([...ids])
    for (const id of this.ids) {
      const slot: Slot = {
        id,
        port: Object.freeze({
          isCurrent: () => this.isCurrent(),
          register: (work: OwnedWork) => this.#register(slot, work),
          retainClose: (control: RetainedCloseControl) => this.#retainClose(slot, control),
        }),
      }
      this.#slots.set(id, slot)
    }
  }

  isPristine(): boolean {
    return !this.#claimed && this.#current
  }

  tryClaim(): boolean {
    if (!this.isPristine()) return false
    this.#claimed = true
    return true
  }

  isCurrent(): boolean {
    return this.#current
  }

  port(id: string): AssemblyLifetimePort {
    const slot = this.#slots.get(id)
    if (!slot) throw new Error('assembly-lifecycle: unknown row')
    return slot.port
  }

  close(): Promise<AssemblyCloseReport> {
    this.#requestStop()
    return this.closed
  }

  closeControl(id: string): RetainedCloseControl | undefined {
    const slot = this.#slots.get(id)
    if (!slot) throw new Error('assembly-lifecycle: unknown row')
    return slot.control
  }

  #retainClose(slot: Slot, control: RetainedCloseControl): void {
    if (
      !slot.registration ||
      slot.registration.completed ||
      !validControl(control) ||
      (slot.control !== undefined && slot.control !== control)
    ) {
      this.#requestStop()
      throw new Error('assembly-lifecycle: close control cannot be retained')
    }
    slot.control = control
  }

  #register(slot: Slot, work: OwnedWork): LifetimeRegistration {
    if (!this.#current || slot.registration) {
      this.#requestStop()
      throw new Error('assembly-lifecycle: row already registered or stopping')
    }
    if (!this.#claimed) throw new Error('assembly-lifecycle: assembly not claimed')
    const completion = Promise.withResolvers<CloseResult>()
    // Observe setup now, even when an upper row keeps the drain pending.
    const ready = work.ready.then(
      () => true,
      () => {
        this.#requestStop()
        return false
      },
    )
    slot.registration = { work, ready, completion, completed: false }
    return Object.freeze({
      closed: completion.promise,
      requestStop: () => this.#requestStop(),
    })
  }

  #requestStop(): void {
    if (!this.#current) return
    this.#current = false
    const errors: AssemblyCloseReport['assemblyErrors'][number][] = []
    try {
      this.#onStopping()
    } catch {
      errors.push('assembly-stop-failed')
    }
    // This task does not wait for Cordis effect disposal. Effects wait for its receipts.
    void this.#drain(errors).then(this.#completion.resolve, this.#completion.reject)
  }

  async #drain(errors: AssemblyCloseReport['assemblyErrors']): Promise<AssemblyCloseReport> {
    const rows: { readonly id: string; readonly result: CloseResult }[] = []
    for (const slot of [...this.#slots.values()].reverse()) {
      const registration = slot.registration
      if (!registration) continue
      const result = await closeWork(registration)
      registration.completed = true
      registration.completion.resolve(result)
      rows.push(Object.freeze({ id: slot.id, result }))
    }
    return Object.freeze({
      complete: errors.length === 0 && rows.every(row => row.result.kind === 'closed'),
      assemblyErrors: Object.freeze([...errors]),
      rows: Object.freeze(rows),
    })
  }
}

function validControl(value: RetainedCloseControl): boolean {
  try {
    return (
      value !== null &&
      typeof value === 'object' &&
      typeof value.closeAttempt === 'function' &&
      typeof value.retryClose === 'function'
    )
  } catch {
    return false
  }
}

async function closeWork(registration: RegisteredWork): Promise<CloseResult> {
  const codes: ('setup' | 'close')[] = []
  if (!(await registration.ready)) codes.push('setup')
  try {
    await registration.work.close()
  } catch {
    // The public protocol classifies all resource failures without exposing their text.
    codes.push('close')
  }
  return codes.length === 0
    ? Object.freeze({ kind: 'closed' })
    : Object.freeze({ kind: 'failed', codes: Object.freeze(codes) })
}

export function createAssemblyLifetime(
  ids: readonly string[],
  onStopping: () => void,
): AssemblyLifetime {
  if (
    ids.length === 0 ||
    ids.some(id => typeof id !== 'string' || id.length === 0) ||
    new Set(ids).size !== ids.length
  ) {
    throw new TypeError('assembly-lifecycle: row ids must be nonempty and unique')
  }
  return new Lifetime(ids, onStopping)
}
