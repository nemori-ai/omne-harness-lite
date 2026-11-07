import type { GovernanceScopeLifecycle } from './scope-lifecycle.ts'

type ClosePhase = 'isolation' | 'calls' | 'recovery'
export type GovernanceProviderClose =
  | Readonly<{ kind: 'closed' }>
  | Readonly<{ kind: 'pending'; phase: ClosePhase | 'contributions'; inFlight: number }>
type RecoveryCursor = Parameters<GovernanceScopeLifecycle['recoverPage']>[0]
type Closing = {
  kind: 'closing'
  phase: ClosePhase
  cursor: RecoveryCursor
  unsettled: number
  work: Promise<GovernanceProviderClose> | null
}
type State = { kind: 'open' } | Closing | { kind: 'closed' }
type Options = Readonly<{
  lifecycle: Pick<GovernanceScopeLifecycle, 'isolate' | 'recoverPage'>
  stopAccepting: () => void
  recoveryPagesPerPass: number
}>
const unavailable = () => ({ kind: 'unavailable' as const, owner: 'governance-provider' })

export class GovernanceProviderLifetime {
  private state: State = { kind: 'open' }
  private readonly active = new Set<Promise<unknown>>()
  private readonly options: Options

  constructor(options: Options) {
    if (!Number.isSafeInteger(options.recoveryPagesPerPass) || options.recoveryPagesPerPass < 1)
      throw new TypeError('Governance recovery page budget must be a positive integer')
    this.options = { ...options }
  }

  get accepting() {
    return this.state.kind === 'open'
  }

  invoke<T>(call: () => Promise<T>): Promise<T | ReturnType<typeof unavailable>> {
    if (this.state.kind !== 'open') return Promise.resolve(unavailable())
    const pending = Promise.withResolvers<T>()
    this.active.add(pending.promise)
    void pending.promise.then(
      () => this.active.delete(pending.promise),
      () => this.active.delete(pending.promise),
    )
    try {
      pending.resolve(call())
    } catch (error) {
      pending.reject(error)
    }
    return pending.promise
  }

  close(timeoutMs: number): Promise<GovernanceProviderClose> {
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 0 || timeoutMs > 60_000)
      throw new TypeError('Governance close timeout must be between 0 and 60000 milliseconds')
    if (this.state.kind === 'closed') return Promise.resolve({ kind: 'closed' })
    if (this.state.kind === 'open') {
      this.state = { kind: 'closing', phase: 'isolation', cursor: null, unsettled: 0, work: null }
      this.options.stopAccepting()
    }
    const closing = this.state
    closing.work ??= this.finish(closing)
      .catch(() => this.pending(closing))
      .finally(() => {
        closing.work = null
      })
    return this.wait(closing, closing.work, timeoutMs)
  }

  private pending(closing: Closing): GovernanceProviderClose {
    return { kind: 'pending', phase: closing.phase, inFlight: this.active.size }
  }

  private async wait(closing: Closing, work: Promise<GovernanceProviderClose>, timeoutMs: number) {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([
        work,
        new Promise<GovernanceProviderClose>(resolve => {
          timer = setTimeout(() => resolve(this.pending(closing)), timeoutMs)
        }),
      ])
    } finally {
      clearTimeout(timer)
    }
  }

  private async finish(closing: Closing): Promise<GovernanceProviderClose> {
    if (closing.phase === 'isolation') {
      if ((await this.options.lifecycle.isolate()).kind !== 'isolated') return this.pending(closing)
      closing.phase = 'calls'
    }
    if (closing.phase === 'calls') {
      await Promise.allSettled(this.active)
      closing.phase = 'recovery'
    }
    return this.recover(closing)
  }

  private async recover(closing: Closing): Promise<GovernanceProviderClose> {
    for (let page = 0; page < this.options.recoveryPagesPerPass; page++) {
      const result = await this.options.lifecycle.recoverPage(closing.cursor)
      if (result.kind !== 'page') return this.pending(closing)
      closing.unsettled += result.unsettled
      closing.cursor = result.next
      if (result.next !== null) continue
      const unsettled = closing.unsettled
      closing.unsettled = 0
      if (unsettled !== 0) return this.pending(closing)
      this.state = { kind: 'closed' }
      return { kind: 'closed' }
    }
    return this.pending(closing)
  }
}
