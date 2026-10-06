import { symbols, type Context, type Fiber } from '@deepseek-ai/cordis'
import type {
  AssemblyCloseReport,
  AssemblyLifetime,
  AssemblyLifetimePort,
  OwnedWork,
  RetainedCloseControl,
} from '@omne-harness-lite/assembly-lifecycle'
import {
  ASSEMBLY_LIFETIME_SERVICE,
  AssemblyLifetimeService,
} from '@omne-harness-lite/assembly-lifecycle/cordis'
import { FIBER_STATE } from '@omne-harness-lite/kernel-basis/cordis'
import { PluginTreeStartError, PluginTreeUsageError, type PluginTreeStartCode } from './errors.ts'
import { preparedState, type PreparedRow, type PreparedState } from './prepared.ts'
import type { PluginTreeHandle, PreparedPluginTree } from './types.ts'

export interface PluginTreeInspection {
  readonly id: string
  readonly fiber: Fiber
}
interface LoadingRow {
  readonly prepared: PreparedRow
  readonly scope: Context
  port?: Fiber
  fiber?: Fiber
  workReady?: Promise<void>
}
class RowLifetime extends AssemblyLifetimeService {
  constructor(
    ctx: Context,
    private readonly port: AssemblyLifetimePort,
  ) {
    super(ctx)
  }
  isCurrent = (): boolean => this.port.isCurrent()
  register = (work: OwnedWork) => this.port.register(work)
  retainClose = (control: RetainedCloseControl) => this.port.retainClose(control)
}
const inspections = new WeakMap<PluginTreeHandle, readonly LoadingRow[]>()
export function inspectPluginTree(handle: PluginTreeHandle): readonly PluginTreeInspection[] {
  const rows = inspections.get(handle)
  if (rows === undefined) throw new TypeError('Invalid plugin tree handle')
  return Object.freeze(
    rows.flatMap(row =>
      row.fiber === undefined ? [] : [Object.freeze({ id: row.prepared.row.id, fiber: row.fiber })],
    ),
  )
}

class TreeRun {
  readonly #ready = Promise.withResolvers<void>()
  readonly #terminal = Promise.withResolvers<void>()
  readonly #loaded: LoadingRow[] = []
  readonly #errors = new Set<AssemblyCloseReport['assemblyErrors'][number]>()
  readonly #listeners: (() => void)[] = []
  readonly #visibility = new Map<string, unknown>()
  #failure?: PluginTreeStartError
  readonly handle: PluginTreeHandle

  constructor(
    private readonly ctx: Context,
    private readonly prepared: PreparedPluginTree,
    private readonly state: PreparedState,
    private readonly lifetime: AssemblyLifetime,
  ) {
    void this.#ready.promise.catch(() => undefined)
    const started = Promise.resolve()
      .then(() => this.#start())
      .catch(() => this.#stop('apply-failed', this.#loaded.at(-1)?.prepared.row.id))
    const closed = lifetime.closed.then(async report => {
      await started
      return this.#finish(report)
    })
    void closed.catch(() => undefined)
    this.handle = Object.freeze({
      rows: prepared.rows,
      ready: this.#ready.promise,
      closed,
      dispose: () => {
        this.#stop('stopped')
        return closed
      },
    })
    inspections.set(this.handle, this.#loaded)
  }

  #stop(code: PluginTreeStartCode, rowId?: string): void {
    if (this.#failure !== undefined) return
    this.#failure = new PluginTreeStartError(code, rowId)
    this.#ready.reject(this.#failure)
    this.#terminal.resolve()
    void this.lifetime.close()
  }
  #assertCurrent(rowId?: string): void {
    if (!this.lifetime.isCurrent()) this.#stop('stopped', rowId)
    if (this.#failure !== undefined) throw this.#failure
  }
  #untilStopped<T>(work: PromiseLike<T>): Promise<T> {
    return Promise.race([
      work,
      this.#terminal.promise.then(() => {
        throw this.#failure
      }),
    ])
  }
  #owner(fiber: Fiber): LoadingRow | undefined {
    return this.#loaded.find(row => row.port?.ctx.fiber === fiber || row.fiber?.ctx.fiber === fiber)
  }
  #visible(key: string): unknown {
    const service = this.ctx.get(key)
    return service !== null && (typeof service === 'object' || typeof service === 'function')
      ? (Reflect.get(service, symbols.original) ?? service)
      : service
  }
  #watch(): void {
    for (const key of this.state.externalServices) this.#visibility.set(key, this.#visible(key))
    this.#listeners.push(
      this.ctx.on('internal/status', (fiber, oldState) => {
        if (this.#failure !== undefined) return
        const row = this.#owner(fiber)
        if (row === undefined) return
        const state = fiber.state as number,
          previous = oldState as number
        if (previous === FIBER_STATE.ACTIVE && state !== FIBER_STATE.ACTIVE)
          this.#stop('dependency-unavailable', row.prepared.row.id)
        else if (
          state === FIBER_STATE.FAILED ||
          (previous === FIBER_STATE.LOADING && state === FIBER_STATE.UNLOADING)
        ) {
          const missing = row.prepared.declaration.requires.some(
            key => key !== ASSEMBLY_LIFETIME_SERVICE && row.scope.get(key) === undefined,
          )
          this.#stop(missing ? 'dependency-unavailable' : 'apply-failed', row.prepared.row.id)
        }
      }),
    )
    this.#listeners.push(
      this.ctx.on('internal/service', key => {
        if (this.#failure !== undefined || !this.#visibility.has(key)) return
        const visible = this.#visible(key)
        if (visible !== this.#visibility.get(key)) this.#stop('dependency-unavailable')
      }),
    )
  }
  async #start(): Promise<void> {
    this.#assertCurrent()
    this.#watch()
    for (const prepared of this.state.rows) {
      this.#assertCurrent(prepared.row.id)
      await this.#startRow(prepared)
    }
    this.#assertCurrent()
    this.#ready.resolve()
  }
  #port(row: LoadingRow): AssemblyLifetimePort {
    const target = this.lifetime.port(row.prepared.row.id)
    return {
      isCurrent: () => target.isCurrent(),
      retainClose: control => target.retainClose(control),
      register: work => {
        // Observe before delegation: the lifetime also observes failure and may start draining.
        row.workReady = work.ready
        void work.ready.catch(() => this.#stop('apply-failed', row.prepared.row.id))
        const receipt = target.register(work)
        return {
          closed: receipt.closed,
          requestStop: () => {
            receipt.requestStop()
            // A ready rejection queued by the same action wins over this fallback stop.
            queueMicrotask(() => this.#stop('stopped', row.prepared.row.id))
          },
        }
      },
    }
  }
  async #startRow(prepared: PreparedRow): Promise<void> {
    const { id } = prepared.row
    const scope = this.ctx.isolate(ASSEMBLY_LIFETIME_SERVICE)
    const row: LoadingRow = { prepared, scope }
    this.#loaded.push(row)
    for (const key of [...prepared.declaration.requires, ...prepared.declaration.optional]) {
      if (key !== ASSEMBLY_LIFETIME_SERVICE) this.#visibility.set(key, this.#visible(key))
    }
    if (
      prepared.declaration.requires.some(
        key => key !== ASSEMBLY_LIFETIME_SERVICE && scope.get(key) === undefined,
      )
    ) {
      this.#stop('dependency-unavailable', id)
      return
    }
    const port = this.#port(row)
    row.port = scope.plugin(ctx => {
      new RowLifetime(ctx, port)
    })
    await this.#untilStopped(Promise.resolve(row.port))
    this.#assertCurrent(id)
    // The port fiber owns even a child whose synchronous publication throws.
    row.fiber = row.port.ctx.plugin(prepared.plugin, prepared.row.config)
    if ((row.fiber.state as number) === FIBER_STATE.PENDING)
      this.#stop('dependency-unavailable', id)
    await this.#untilStopped(Promise.resolve(row.fiber))
    if (row.workReady === undefined) {
      this.#assertCurrent(id)
      this.#errors.add('assembly-protocol-failed')
      this.#stop('missing-registration', id)
      return
    }
    await this.#untilStopped(row.workReady)
    this.#assertCurrent(id)
    if ((row.fiber.state as number) !== FIBER_STATE.ACTIVE) {
      this.#stop('dependency-unavailable', id)
      return
    }
    if (prepared.declaration.provides.some(key => scope.get(key) === undefined)) {
      this.#stop('provided-service-missing', id)
      return
    }
    for (const key of prepared.declaration.provides) this.#visibility.set(key, this.#visible(key))
  }
  async #finish(report: AssemblyCloseReport): Promise<AssemblyCloseReport> {
    for (const code of report.assemblyErrors) this.#errors.add(code)
    for (const row of [...this.#loaded].reverse()) {
      try {
        await row.fiber?.dispose()
      } catch {
        this.#errors.add('assembly-fiber-dispose-failed')
      }
    }
    for (const row of [...this.#loaded].reverse()) {
      try {
        await row.port?.dispose()
      } catch {
        this.#errors.add('assembly-port-dispose-failed')
      }
    }
    for (const dispose of this.#listeners.reverse()) {
      try {
        dispose()
      } catch {
        this.#errors.add('assembly-port-dispose-failed')
      }
    }
    return Object.freeze({
      complete: report.complete && this.#errors.size === 0,
      assemblyErrors: Object.freeze([...this.#errors]),
      rows: report.rows,
    })
  }
}

export function loadPluginTree(
  ctx: Context,
  prepared: PreparedPluginTree,
  lifetime: AssemblyLifetime,
): PluginTreeHandle {
  const state = preparedState(prepared)
  if (state === undefined) throw new PluginTreeUsageError('invalid-prepared')
  if (
    lifetime.ids.length !== prepared.ids.length ||
    lifetime.ids.some((id, index) => id !== prepared.ids[index])
  )
    throw new PluginTreeUsageError('lifetime-mismatch')
  if (!lifetime.isPristine()) throw new PluginTreeUsageError('lifetime-used')
  if (state.externalServices.some(key => ctx.get(key) === undefined))
    throw new PluginTreeUsageError('missing-external-service')
  if (!lifetime.tryClaim()) throw new PluginTreeUsageError('lifetime-used')
  return new TreeRun(ctx, prepared, state, lifetime).handle
}
