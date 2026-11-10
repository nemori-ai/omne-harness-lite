import type { GovernanceRegistrar } from './registrar.ts'
import type { PublicOperationBinding } from './operation-schema.ts'
import type { GovernanceContributionCleanup } from './contribution-cleanup.ts'
import { digest } from './encoding.ts'

type Contribution = GovernanceRegistrar['contribute']
type CloseResult = Readonly<{ kind: 'closed' | 'pending' }>
export type RegisterContributionCleanup = (dispose: () => Promise<CloseResult>) => void
type Call = {
  registrar: GovernanceRegistrar
  state: 'open' | 'closing' | 'closed'
  settled: boolean
  group: Group | null
  done: ReturnType<typeof Promise.withResolvers<void>>
}
type Group = {
  binding: PublicOperationBinding
  members: Set<Call>
  closing: boolean
  work: Promise<void> | null
}
type Options = Readonly<{
  registrar: () => GovernanceRegistrar
  invoke: (call: () => ReturnType<Contribution>) => ReturnType<Contribution>
  cleanup: GovernanceContributionCleanup
  closeTimeoutMs: number
  retryDelayMs: number
  retryBatchSize: number
}>

export class GovernanceContributionLifetime {
  private readonly options: Options
  private readonly calls = new Set<Call>()
  private readonly groups = new Map<string, Group>()
  private readonly queued = new Set<Group>()
  private timer: ReturnType<typeof setTimeout> | undefined
  private accepting = true

  constructor(options: Options) {
    for (const value of [options.retryDelayMs, options.retryBatchSize]) {
      if (!Number.isSafeInteger(value) || value < 1)
        throw new TypeError('Contribution retry budgets must be positive integers')
    }
    if (
      !Number.isSafeInteger(options.closeTimeoutMs) ||
      options.closeTimeoutMs < 0 ||
      options.closeTimeoutMs > 60_000
    )
      throw new TypeError('Contribution close timeout must be between 0 and 60000 milliseconds')
    this.options = { ...options }
  }

  contribute(
    register: RegisterContributionCleanup,
    access: Parameters<Contribution>[0],
    command: Parameters<Contribution>[1],
  ): ReturnType<Contribution> {
    if (!this.accepting)
      return Promise.resolve({ kind: 'unavailable', owner: 'governance-provider' })
    const call: Call = {
      registrar: this.options.registrar(),
      state: 'open',
      settled: false,
      group: null,
      done: Promise.withResolvers<void>(),
    }
    this.calls.add(call)
    try {
      register(() => {
        this.stop(call)
        return this.wait(call.done.promise)
      })
      const result = this.options.invoke(() =>
        call.registrar.contribute(access, command, binding => this.attach(call, binding)),
      )
      void result.then(
        () => this.settled(call),
        () => this.settled(call),
      )
      return result
    } catch (error) {
      this.stop(call)
      this.settled(call)
      return Promise.reject(error)
    }
  }

  get pending() {
    return this.calls.size
  }

  stopAccepting() {
    this.accepting = false
    for (const call of this.calls) this.stop(call)
  }

  close(): Promise<CloseResult> {
    this.stopAccepting()
    return this.wait(Promise.all([...this.calls].map(call => call.done.promise)))
  }

  private async wait(work: Promise<unknown>): Promise<CloseResult> {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([
        work.then(() => ({ kind: 'closed' as const })),
        new Promise<CloseResult>(resolve => {
          timer = setTimeout(() => resolve({ kind: 'pending' }), this.options.closeTimeoutMs)
        }),
      ])
    } finally {
      clearTimeout(timer)
    }
  }

  private attach(call: Call, binding: PublicOperationBinding) {
    const key = digest(binding)
    let group = this.groups.get(key)
    if (!group) {
      group = { binding: structuredClone(binding), members: new Set(), closing: false, work: null }
      this.groups.set(key, group)
    }
    group.members.add(call)
    call.group = group
    if (call.state === 'closing' || group.closing) this.stop(call)
  }

  private stop(call: Call) {
    if (call.state === 'closed') return
    call.state = 'closing'
    call.registrar.stopAccepting()
    const group = call.group
    if (group === null) {
      if (call.settled) this.complete(call)
      return
    }
    group.closing = true
    for (const member of group.members) {
      member.state = 'closing'
      member.registrar.stopAccepting()
    }
    this.enqueue(group)
  }

  private settled(call: Call) {
    call.settled = true
    if (call.state === 'closing') this.stop(call)
  }

  private complete(call: Call) {
    call.state = 'closed'
    this.calls.delete(call)
    call.done.resolve()
  }

  private enqueue(group: Group) {
    this.queued.add(group)
    if (this.timer !== undefined) return
    this.timer = setTimeout(() => this.tick(), this.options.retryDelayMs)
    this.timer.unref()
  }

  private tick() {
    this.timer = undefined
    let count = 0
    for (const group of this.queued) {
      if (count++ === this.options.retryBatchSize) break
      this.queued.delete(group)
      if (group.work !== null) continue
      group.work = this.finish(group)
        .catch(() => this.enqueue(group))
        .finally(() => {
          group.work = null
        })
    }
    const next = this.queued.values().next()
    if (!next.done) this.enqueue(next.value)
  }

  private async finish(group: Group) {
    const count = group.members.size
    const settled = [...group.members].every(member => member.settled)
    const finished = await this.options.cleanup.finish(group.binding, settled)
    if (finished === 'retry' || group.members.size !== count) {
      this.enqueue(group)
      return
    }
    if (finished === 'calls') {
      if ([...group.members].every(member => member.settled)) this.enqueue(group)
      return
    }
    this.queued.delete(group)
    this.groups.delete(digest(group.binding))
    for (const call of group.members) this.complete(call)
  }
}
