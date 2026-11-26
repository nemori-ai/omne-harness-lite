import type { Context, Fiber } from '@deepseek-ai/cordis'
import {
  superviseRow,
  type RowAction,
  type RowEdges,
  type RowEvent,
  type RowExit,
  type RowStanding,
  type SwapWay,
} from '@omne-harness/assembly'
import { fiberItself } from './entry.ts'

type CordisFiberState = typeof import('@deepseek-ai/cordis').FiberState

const LOADING = 1 satisfies CordisFiberState['LOADING']
const ACTIVE = 2 satisfies CordisFiberState['ACTIVE']
const FAILED = 3 satisfies CordisFiberState['FAILED']
const UNLOADING = 5 satisfies CordisFiberState['UNLOADING']

export type SupervisedHandle = Readonly<{
  row: string
  start?: () => Promise<void>
  stop: (deadline: number) => Promise<unknown>
}>

export type SupervisionTimer = Readonly<{ promise: Promise<void>; cancel: () => void }>
export type SupervisionClock = Readonly<{
  now: () => number
  after: (ms: number) => SupervisionTimer
}>

export type SupervisionRefusal = 'stopping' | 'duplicate'

export class SupervisionRefused extends Error {
  override readonly name = 'SupervisionRefused'
  readonly reason: SupervisionRefusal
  readonly row: string
  constructor(reason: SupervisionRefusal, row: string) {
    super(`row registration refused: ${reason} (row ${row})`)
    this.reason = reason
    this.row = row
  }
}

export type HandleEntry<H> = { readonly handle: H; stopCalled: boolean }
export type WithdrawnEntry<H> = { readonly handle: H; detail: string }
export type StartFailure = Readonly<{ row: string; detail: string }>

export type FrozenRows<H> = Readonly<{
  live: ReadonlyMap<string, HandleEntry<H>>
  withdrawn: ReadonlyMap<string, WithdrawnEntry<H>>
}>

/** `after`: for each row, the rows that start before it. `last`: the rows that start once every other has. */
export type StartOrder = Readonly<{
  after: ReadonlyMap<string, readonly string[]>
  last: ReadonlySet<string>
}>

export type WatchedRow = Readonly<{ id: string; fiber: Fiber; swap: SwapWay }>

export type SupervisedExit = RowExit & Readonly<{ row: string }>

export type WatchOptions = Readonly<{
  dependencyDeadlineMs: number
  startDeadlineMs: number
  exit: (exit: SupervisedExit) => void
  moved?: (row: string, standing: RowStanding) => void
}>

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

/** A fiber passes through `UNLOADING` on its way out and on its way to `FAILED`: only where it lands counts. */
function eventOf(state: number): RowEvent | undefined {
  if (state === UNLOADING) return undefined
  if (state === LOADING) return 'returning'
  if (state === ACTIVE) return 'started'
  return state === FAILED ? 'threw' : 'left'
}

export class RowSupervisor<H extends SupervisedHandle, Report = unknown> {
  readonly #clock: SupervisionClock
  readonly #withdrawalDeadlineMs: number
  readonly #live = new Map<string, HandleEntry<H>>()
  readonly #withdrawn = new Map<string, WithdrawnEntry<H>>()
  readonly #standings = new Map<string, RowStanding>()
  #state: 'running' | 'stopping' = 'running'
  #started = false
  #frozen = false
  #shutdown: Promise<Report> | undefined
  #startFailure: StartFailure | undefined

  constructor(options: Readonly<{ clock: SupervisionClock; withdrawalDeadlineMs?: number }>) {
    this.#clock = options.clock
    this.#withdrawalDeadlineMs = options.withdrawalDeadlineMs ?? 1000
  }

  get state(): 'running' | 'stopping' {
    return this.#state
  }

  get startFailure(): StartFailure | undefined {
    return this.#startFailure
  }

  liveRows(): string[] {
    return [...this.#live.keys()]
  }

  standings(): ReadonlyMap<string, RowStanding> {
    return new Map(this.#standings)
  }

  add(handle: H): () => void {
    const { row } = handle
    if (this.#state === 'stopping') throw new SupervisionRefused('stopping', row)
    if (this.#live.has(row)) throw new SupervisionRefused('duplicate', row)
    const entry: HandleEntry<H> = { handle, stopCalled: false }
    this.#live.set(row, entry)
    this.#withdrawn.delete(row)
    let removed = false
    return () => {
      if (removed) return
      removed = true
      this.#withdraw(row, entry)
    }
  }

  /** Calls `start` of every row: a row after the rows it needs, the last ones after all. The first to throw ends it. */
  async startAll(order?: StartOrder): Promise<StartFailure | undefined> {
    if (this.#started || this.#state === 'stopping') return undefined
    this.#started = true
    const entries = [...this.#live.values()]
    const last = order?.last ?? new Set<string>()
    const failure =
      (await this.#startWave(
        entries.filter(entry => !last.has(entry.handle.row)),
        order?.after,
      )) ??
      (await this.#startWave(
        entries.filter(entry => last.has(entry.handle.row)),
        order?.after,
      ))
    if (failure === undefined) return undefined
    this.#startFailure = failure
    this.#state = 'stopping'
    return failure
  }

  async #startWave(
    entries: readonly HandleEntry<H>[],
    after: StartOrder['after'] | undefined,
  ): Promise<StartFailure | undefined> {
    const starting = new Map<string, Promise<boolean>>()
    const failures = new Map<string, string>()
    const startOf = (entry: HandleEntry<H>): Promise<boolean> => {
      const { row } = entry.handle
      const known = starting.get(row)
      if (known !== undefined) return known
      const first = (after?.get(row) ?? []).flatMap(other => {
        const needed = entries.find(each => each.handle.row === other)
        return needed === undefined ? [] : [startOf(needed)]
      })
      const started = Promise.all(first).then(async ready => {
        if (ready.includes(false) || this.#state === 'stopping') return false
        try {
          await entry.handle.start?.()
          return true
        } catch (error) {
          failures.set(row, messageOf(error))
          return false
        }
      })
      starting.set(row, started)
      return started
    }
    await Promise.all(entries.map(startOf))
    const failed = entries.find(entry => failures.has(entry.handle.row))
    if (failed === undefined) return undefined
    const { row } = failed.handle
    return { row, detail: failures.get(row) ?? '' }
  }

  enterStopping(): void {
    this.#state = 'stopping'
  }

  freeze(): FrozenRows<H> {
    this.#frozen = true
    return { live: new Map(this.#live), withdrawn: new Map(this.#withdrawn) }
  }

  once(run: () => Promise<Report>): Promise<Report> {
    this.#shutdown ??= run()
    return this.#shutdown
  }

  watch(root: Context, rows: readonly WatchedRow[], options: WatchOptions): () => void {
    const watched = new Map(rows.map(row => [fiberItself(row.fiber), row]))
    const timers = new Map<string, SupervisionTimer>()
    let exited = false
    for (const row of rows) this.#standings.set(row.id, 'serving')
    const disarm = (row: string): void => {
      timers.get(row)?.cancel()
      timers.delete(row)
    }
    const act = (row: WatchedRow, action: RowAction): void => {
      if (action.kind === 'disarm') return disarm(row.id)
      if (action.kind === 'exit') {
        if (exited) return
        exited = true
        return options.exit({ code: action.code, reason: action.reason, row: row.id })
      }
      disarm(row.id)
      const ms =
        action.deadline === 'dependency' ? options.dependencyDeadlineMs : options.startDeadlineMs
      const timer = this.#clock.after(ms)
      timers.set(row.id, timer)
      void timer.promise.then(() => {
        if (timers.get(row.id) === timer) on(row, 'deadline')
      })
    }
    const on = (row: WatchedRow, event: RowEvent): void => {
      if (this.#state === 'stopping' || exited) return
      const before = this.#standings.get(row.id) ?? 'serving'
      const step = superviseRow(before, event, row.swap)
      this.#standings.set(row.id, step.standing)
      if (step.standing !== before) options.moved?.(row.id, step.standing)
      for (const action of step.actions) act(row, action)
    }
    const unwatch = root.on('internal/status', fiber => {
      const row = watched.get(fiber)
      const event = eventOf(fiber.state as number)
      if (row === undefined || event === undefined) return
      // A fiber that restarts goes from unloading straight to loading: it left and it returns.
      if (event === 'returning' && this.#standings.get(row.id) === 'serving') on(row, 'left')
      on(row, event)
    })
    return () => {
      unwatch()
      for (const row of timers.keys()) disarm(row)
    }
  }

  #withdraw(row: string, entry: HandleEntry<H>): void {
    if (this.#frozen) return
    if (this.#live.get(row) !== entry) return
    this.#live.delete(row)
    const withdrawn: WithdrawnEntry<H> = {
      handle: entry.handle,
      detail: 'disposer stop not started',
    }
    this.#withdrawn.set(row, withdrawn)
    if (entry.stopCalled) return
    entry.stopCalled = true
    withdrawn.detail = 'disposer stop pending'
    const deadline = this.#clock.now() + this.#withdrawalDeadlineMs
    void Promise.resolve()
      .then(() => entry.handle.stop(deadline))
      .then(
        result => describeStop(result),
        (error: unknown) => `failed: ${messageOf(error)}`,
      )
      .then(text => {
        withdrawn.detail = `disposer stop ${text}`
      })
  }
}

function describeStop(result: unknown): string {
  if (typeof result !== 'object' || result === null) return 'settled'
  const kind = String(Reflect.get(result, 'kind'))
  const detail: unknown = Reflect.get(result, 'detail')
  return typeof detail === 'string' ? `${kind}: ${detail}` : kind
}

/** The edges between rows as the live tree has them: who injected whose service, child fibers included. */
export function liveEdges(
  root: Context,
  rows: readonly Readonly<{ id: string; fiber: Fiber }>[],
): RowEdges {
  const tops = new Map(rows.map(row => [fiberItself(row.fiber), row.id]))
  const ownerOf = (fiber: Fiber): string | undefined => {
    const seen = new Set<Fiber>()
    for (let above = fiber; !seen.has(above); above = above.parent.fiber) {
      const owner = tops.get(above)
      if (owner !== undefined) return owner
      seen.add(above)
    }
    return undefined
  }
  const edges = new Map<string, Set<string>>(rows.map(row => [row.id, new Set<string>()]))
  for (const runtime of root.registry.values())
    for (const fiber of runtime.fibers) {
      const owner = ownerOf(fiber)
      if (owner === undefined) continue
      for (const name of Object.keys(fiber.inject)) {
        const provider = fiber.committed?.[name]?.ctx.fiber
        const needed = provider === undefined ? undefined : ownerOf(provider)
        if (needed !== undefined && needed !== owner) edges.get(owner)?.add(needed)
      }
    }
  return new Map([...edges].map(([row, needed]) => [row, [...needed]]))
}
