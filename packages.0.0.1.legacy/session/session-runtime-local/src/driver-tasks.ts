import {
  checkSessionDriverPolicy,
  type SessionDriverControl,
  type SessionDriverPolicy,
  type SessionRunAdmissionBlock,
} from '@omne-harness-lite/session-runtime'

export interface DriverTask {
  /** Released includes actual borrow return, not native execution completion. */
  readonly completion: Promise<'released' | 'retained' | 'admissionBlocked'>
  readonly admission?: () => SessionRunAdmissionBlock | null
  readonly requestStop: () => void
  /** Stop local waits; external original work returns pending instead of blocking withdrawal. */
  readonly close: () => Promise<'released' | 'pending'>
}

export function createDriverTaskOwner(
  requested: SessionDriverPolicy,
  diagnostic: (error: unknown) => void,
): SessionDriverControl & {
  readonly admit: (session: string, create: () => Promise<DriverTask>) => boolean
  readonly readRunAdmission: (session: string) => SessionRunAdmissionBlock | null
} {
  const checked = checkSessionDriverPolicy(requested)
  if (!('policy' in checked) || typeof diagnostic !== 'function')
    throw new TypeError('complete driver policy and diagnostic required')
  const owner = new DriverTasks(checked.policy, diagnostic)
  return Object.freeze({
    admit: owner.admit,
    requestStop: owner.requestStop,
    close: owner.close,
    readRunAdmission: owner.readRunAdmission,
  })
}

type SlotState =
  | { readonly kind: 'starting' }
  | { readonly kind: 'active' | 'retained' | 'admissionBlocked'; readonly task: DriverTask }
  | { readonly kind: 'failed'; readonly task?: DriverTask }
interface Slot {
  readonly session: string
  state: SlotState
  closing?: Promise<void>
}

class DriverTasks {
  readonly slots = new Map<string, Slot>()
  readonly stopped = new WeakSet<DriverTask>()
  readonly failures: unknown[] = []
  additionalFailures = 0
  phase: 'open' | 'stopping' | 'closed' = 'open'
  closing?: ReturnType<SessionDriverControl['close']>
  constructor(
    readonly policy: SessionDriverPolicy,
    readonly diagnostic: (error: unknown) => void,
  ) {}
  admit = (session: string, create: () => Promise<DriverTask>) => {
    if (!this.canAdmit(session)) return false
    const slot: Slot = { session, state: { kind: 'starting' } }
    this.slots.set(session, slot)
    void this.start(slot, create).catch(error => this.fail(error))
    return true
  }
  readRunAdmission = (session: string): SessionRunAdmissionBlock | null => {
    const state = this.slots.get(session)?.state
    return state && state.kind !== 'starting' ? (state.task?.admission?.() ?? null) : null
  }
  canAdmit(session: string) {
    const active = [...this.slots.values()].filter(
      slot => slot.state.kind === 'starting' || slot.state.kind === 'active',
    ).length
    return (
      this.phase === 'open' &&
      (!this.slots.has(session) || this.slots.get(session)?.state.kind === 'admissionBlocked') &&
      (this.slots.has(session) || this.slots.size < this.policy.maxHeld) &&
      active < this.policy.maxTasks
    )
  }
  async start(slot: Slot, create: () => Promise<DriverTask>) {
    try {
      const task = await create()
      slot.state = { kind: 'active', task }
      void task.completion.then(
        result => {
          if (result === 'released') this.slots.delete(slot.session)
          else slot.state = { kind: result, task }
        },
        error => {
          slot.state = { kind: 'failed', task }
          this.fail(error)
        },
      )
      if (this.phase !== 'open') {
        this.stopTask(task)
      }
    } catch (error) {
      const task = slot.state.kind === 'starting' ? undefined : slot.state.task
      slot.state = { kind: 'failed', ...(task ? { task } : {}) }
      throw error
    }
  }
  requestStop = () => {
    if (this.phase !== 'open') return
    this.phase = 'stopping'
    for (const slot of this.slots.values()) {
      if (slot.state.kind !== 'starting' && slot.state.task) this.stopTask(slot.state.task)
    }
  }
  stopTask(task: DriverTask) {
    if (this.stopped.has(task)) return
    this.stopped.add(task)
    try {
      task.requestStop()
    } catch (error) {
      this.fail(error)
    }
  }
  fail(error: unknown) {
    this.requestStop()
    this.record(error)
    try {
      this.diagnostic(error)
    } catch (diagnostic) {
      this.record(diagnostic)
    }
  }
  record(error: unknown) {
    if (this.failures.includes(error)) return
    if (this.failures.length < this.policy.maxFailures) this.failures.push(error)
    else this.additionalFailures++
  }
  async closeSlot(slot: Slot) {
    if (slot.state.kind === 'starting' || !slot.state.task) return
    if (slot.closing) return slot.closing
    const task = slot.state.task
    slot.closing = task.close().then(result => {
      if (result === 'released') this.slots.delete(slot.session)
    })
    try {
      await slot.closing
    } finally {
      delete slot.closing
    }
  }
  close = (): ReturnType<SessionDriverControl['close']> => {
    this.requestStop()
    if (!this.closing) {
      this.closing = this.finishClose().finally(() => {
        delete this.closing
      })
    }
    return this.closing
  }
  async finishClose(): ReturnType<SessionDriverControl['close']> {
    const ends = await Promise.allSettled(
      [...this.slots.values()].map(slot => this.closeSlot(slot)),
    )
    const reported = this.returnFailures(ends)
    if (reported.errors.length)
      throw new AggregateError(
        reported.errors,
        `driver task ownership failed; ${reported.additional} additional failures; originals retained`,
      )
    if (this.slots.size) return { pending: true, held: this.slots.size }
    this.phase = 'closed'
    return { closed: true }
  }
  returnFailures(ends: readonly PromiseSettledResult<void>[]) {
    const errors = [...this.failures]
    let additional = this.additionalFailures
    const limit = this.policy.maxFailures
    function record(error: unknown) {
      if (errors.includes(error)) return
      if (errors.length < limit) errors.push(error)
      else additional++
    }
    for (const end of ends) {
      if (end.status !== 'rejected') continue
      record(end.reason)
      try {
        this.diagnostic(end.reason)
      } catch (diagnostic) {
        record(diagnostic)
      }
    }
    return { errors, additional }
  }
}
