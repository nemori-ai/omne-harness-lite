// 生命周期登记（s0-spec-r2 §9「登记」「预期登记者」）。
// `LifecycleRegistry` 持有句柄与准入规则，不依赖 Cordis；`S0AssemblyLifecycleService` 是它在根上下文的服务面，
// 登记落在调用方 fiber：fiber 撤除即退登记。正式服务定义归 kernel-basis（候选 §4.4），被接受后迁移并删除本私有定义。
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

/** 阶段的关闭次序；启动按相反次序。 */
export const PHASE_ORDER: readonly LifecyclePhase[] = [
  'entry',
  'business',
  'composition',
  'storage',
]

export type LifecycleRefusal =
  | 'stopping' // 已进入停止状态（N-7）
  | 'unexpected-row' // 不在预期登记者名单里（N-7）
  | 'phase-mismatch' // 阶段与发行层写明的不符
  | 'duplicate' // 该行已有在册句柄
  | 'generation-change' // 启动后换代，视为计划停止（N-3）

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

/** 在册句柄。`stopCalled` 保证同一个句柄的 `stop` 只被调用一次（协调者或撤除时的 disposer，谁先到谁调）。 */
export type LifecycleEntry = { readonly handle: LifecycleHandle; stopCalled: boolean }
export type WithdrawnEntry = { readonly handle: LifecycleHandle; detail: string }

export type FrozenRegistry = Readonly<{
  live: ReadonlyMap<RowId, LifecycleEntry>
  withdrawn: ReadonlyMap<RowId, WithdrawnEntry>
}>

export type LifecycleRegistryOptions = Readonly<{
  /** 行 → 预期登记的阶段；发行层 `phase !== null` 的行。 */
  expected: ReadonlyMap<RowId, LifecyclePhase>
  clock: ShutdownClock
  /** 启动后换代时调用，请求计划停止；由装配入口接到 `runShutdown`。 */
  requestStop: (reason: string) => void
  /** 行 fiber 撤除时 disposer 发起的停止所用的期限，默认 1000 毫秒。 */
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

  constructor(options: LifecycleRegistryOptions) {
    this.#options = options
  }

  get state(): 'running' | 'stopping' {
    return this.#state
  }

  liveRows(): RowId[] {
    return [...this.#live.keys()]
  }

  /** 登记一个句柄，返回幂等的退登记函数。拒绝时抛出 `LifecycleRefusedError`，不留任何登记。 */
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
      // N-3：运行状态下该行换代。M2 不重新调用 start，进入停止，新句柄不接纳。
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

  /** 全部行 ACTIVE 后由装配入口调用：按阶段相反次序调用各句柄的 `start`。只做一次。 */
  async startAll(): Promise<void> {
    if (this.#started || this.#state === 'stopping') return
    this.#started = true
    for (const phase of [...PHASE_ORDER].reverse()) {
      const starts = [...this.#live.values()]
        .filter(entry => entry.handle.phase === phase)
        .map(entry => entry.handle.start?.())
      await Promise.all(starts)
    }
  }

  /** 协调者进入停止状态（步骤 1）。幂等。 */
  enterStopping(): void {
    this.#state = 'stopping'
  }

  /** 冻结在册与已撤除名单，供协调者在整个关闭期间使用；此后的撤除不再改变它们。 */
  freeze(): FrozenRegistry {
    this.#frozen = true
    return { live: new Map(this.#live), withdrawn: new Map(this.#withdrawn) }
  }

  /** 幂等：多次停止请求共用同一次关闭与同一份报告对象。 */
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
    if (this.#frozen) return // 关闭已开始：协调者持有自己的快照
    if (this.#live.get(row) !== entry) return
    this.#live.delete(row)
    const withdrawn: WithdrawnEntry = { handle: entry.handle, detail: 'disposer stop not started' }
    this.#withdrawn.set(row, withdrawn)
    if (entry.stopCalled) return
    // disposer 只发起停止，结果只作诊断（§9 预期登记者）。
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

/** 根上下文的服务面。登记落在调用方 fiber（ctx 是调用方的）：该 fiber 撤除时退登记。 */
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
