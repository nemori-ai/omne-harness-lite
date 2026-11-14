import { Service, type Context } from '@deepseek-ai/cordis'
import type {
  AssemblyLifecycle,
  LifecycleHandle,
  LifecyclePhase,
  RowId,
  StopResult,
} from './types.ts'
import type { ShutdownClock, ShutdownReport } from './shutdown.ts'

export const S0_ASSEMBLY_LIFECYCLE_KEY = 's0.assemblyLifecycle'

export const PHASE_ORDER: readonly LifecyclePhase[] = [
  'entry',
  'business',
  'composition',
  'storage',
]

export type LifecycleRefusal =
  | 'stopping'
  | 'unexpected-row'
  | 'phase-mismatch'
  | 'duplicate'
  | 'generation-change'

export class LifecycleRefusedError extends Error {
  readonly reason: LifecycleRefusal
  readonly row: RowId
  constructor(reason: LifecycleRefusal, row: RowId) {
    super(`lifecycle registration refused: ${reason} (row ${row})`)
    this.name = 'LifecycleRefusedError'
    this.reason = reason
    this.row = row
  }
}

export type LifecycleEntry = { readonly handle: LifecycleHandle; stopCalled: boolean }
export type WithdrawnEntry = { readonly handle: LifecycleHandle; detail: string }

export type StartFailure = Readonly<{ row: RowId; detail: string }>

export type FrozenRegistry = Readonly<{
  live: ReadonlyMap<RowId, LifecycleEntry>
  withdrawn: ReadonlyMap<RowId, WithdrawnEntry>
}>

export type LifecycleRegistryOptions = Readonly<{
  expected: ReadonlyMap<RowId, LifecyclePhase>
  clock: ShutdownClock
  requestStop: (reason: string) => void
  withdrawalDeadlineMs?: number
}>

function describeStop(result: StopResult): string {
  return result.kind === 'settled' ? 'settled' : `${result.kind}: ${result.detail}`
}

export class LifecycleRegistry {
  readonly #options: LifecycleRegistryOptions
  readonly #live = new Map<RowId, LifecycleEntry>()
  readonly #withdrawn = new Map<RowId, WithdrawnEntry>()
  readonly #seen = new Set<RowId>()
  #state: 'running' | 'stopping' = 'running'
  #started = false
  #frozen = false
  #stopRequested = false
  #shutdown: Promise<ShutdownReport> | undefined
  #startFailure: StartFailure | undefined

  constructor(options: LifecycleRegistryOptions) {
    this.#options = options
  }

  get state(): 'running' | 'stopping' {
    return this.#state
  }

  liveRows(): RowId[] {
    return [...this.#live.keys()]
  }

  add(handle: LifecycleHandle): () => void {
    const { row } = handle
    const refuse = (reason: LifecycleRefusal): never => {
      throw new LifecycleRefusedError(reason, row)
    }
    if (this.#state === 'stopping') refuse('stopping')
    const phase = this.#options.expected.get(row)
    if (phase === undefined) refuse('unexpected-row')
    if (phase !== handle.phase) refuse('phase-mismatch')
    if (this.#live.has(row)) refuse('duplicate')
    if (this.#started && this.#seen.has(row)) {
      this.#state = 'stopping'
      this.#requestStop(`generation-change: ${row}`)
      refuse('generation-change')
    }
    const entry: LifecycleEntry = { handle, stopCalled: false }
    this.#live.set(row, entry)
    this.#seen.add(row)
    this.#withdrawn.delete(row)
    let removed = false
    return () => {
      if (removed) return
      removed = true
      this.#withdraw(row, entry)
    }
  }

  async startAll(): Promise<StartFailure | undefined> {
    if (this.#started || this.#state === 'stopping') return undefined
    this.#started = true
    for (const phase of [...PHASE_ORDER].reverse()) {
      const calls: { row: RowId; settled: Promise<void> }[] = []
      for (const entry of this.#live.values()) {
        if (this.#isStopping()) break
        if (entry.handle.phase !== phase) continue
        calls.push({ row: entry.handle.row, settled: (async () => entry.handle.start?.())() })
      }
      const results = await Promise.allSettled(calls.map(call => call.settled))
      const index = results.findIndex(result => result.status === 'rejected')
      const rejected = results[index]
      if (rejected?.status === 'rejected') {
        const row = calls[index]!.row
        const detail =
          rejected.reason instanceof Error ? rejected.reason.message : String(rejected.reason)
        this.#startFailure = { row, detail }
        this.#state = 'stopping'
        return this.#startFailure
      }
    }
    return undefined
  }

  #isStopping(): boolean {
    return this.#state === 'stopping'
  }

  get startFailure(): StartFailure | undefined {
    return this.#startFailure
  }

  enterStopping(): void {
    this.#state = 'stopping'
  }

  freeze(): FrozenRegistry {
    this.#frozen = true
    return { live: new Map(this.#live), withdrawn: new Map(this.#withdrawn) }
  }

  once(run: () => Promise<ShutdownReport>): Promise<ShutdownReport> {
    this.#shutdown ??= run()
    return this.#shutdown
  }

  #requestStop(reason: string): void {
    if (this.#stopRequested) return
    this.#stopRequested = true
    this.#options.requestStop(reason)
  }

  #withdraw(row: RowId, entry: LifecycleEntry): void {
    if (this.#frozen) return
    if (this.#live.get(row) !== entry) return
    this.#live.delete(row)
    const withdrawn: WithdrawnEntry = { handle: entry.handle, detail: 'disposer stop not started' }
    this.#withdrawn.set(row, withdrawn)
    if (entry.stopCalled) return
    entry.stopCalled = true
    withdrawn.detail = 'disposer stop pending'
    const deadline = this.#options.clock.now() + (this.#options.withdrawalDeadlineMs ?? 1000)
    void Promise.resolve()
      .then(() => entry.handle.stop(deadline))
      .then(
        result => describeStop(result),
        (error: unknown) => `failed: ${error instanceof Error ? error.message : String(error)}`,
      )
      .then(text => {
        withdrawn.detail = `disposer stop ${text}`
      })
  }
}

/**
 * 根上下文的服务面。登记落在调用方 fiber（ctx 是调用方的）：该 fiber 撤除时退登记。
 *
 * @owner apps/harness-server
 * 私有键 `s0.assemblyLifecycle` 是临时定义；kernel-basis 正式定义该服务并被接受后迁移，本私有定义随之删除
 * （s0-spec-r2 §9 末段）。
 */
export class S0AssemblyLifecycleService extends Service implements AssemblyLifecycle {
  private readonly registry: LifecycleRegistry

  constructor(ctx: Context, registry: LifecycleRegistry) {
    super(ctx, S0_ASSEMBLY_LIFECYCLE_KEY)
    this.registry = registry
  }

  register(handle: LifecycleHandle): void {
    this.ctx.effect(() => this.registry.add(handle), 'assemblyLifecycle.register')
  }
}
