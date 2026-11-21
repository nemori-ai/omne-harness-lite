import type { DispatchReconciling, Dispatching, TenantId } from '@omne-harness/dispatch-contract'
import {
  createDispatching,
  type AgentDefinitions,
  type Clock,
  type ContextCopies,
  type DispatchAuthority,
  type DispatchSessions,
  type ReportWaits,
} from '@omne-harness/dispatch'
import { parsePolicy } from './policy.ts'
import { createSqlDispatchStore, type DispatchSqlOptions } from './storage/store.ts'

export type Timers = Readonly<{
  set(run: () => void, delayMs: number): unknown
  clear(timer: unknown): void
}>

export const realTimers: Timers = {
  set: (run, delayMs) => setTimeout(run, delayMs),
  clear: timer => clearTimeout(timer as ReturnType<typeof setTimeout>),
}

export type DispatchLocalOptions = Readonly<{
  /** Parsed against the policy schema. A missing or invalid value refuses to load. */
  policy: unknown
  sql: DispatchSqlOptions &
    Readonly<{
      /** Every tenant that may hold dispatches now. Null: not known now, so nothing is scanned. */
      tenants(): Promise<readonly TenantId[] | null>
    }>
  ports: Readonly<{
    authority: DispatchAuthority
    sessions: DispatchSessions
    waits: ReportWaits
    copies: ContextCopies
    definitions: AgentDefinitions
  }>
  clock: Clock
  timers?: Timers
  report?: (error: unknown) => void
}>

export type DispatchLocalApplication = Readonly<{
  dispatching: Dispatching
  reconciling: DispatchReconciling
  /** Takes the steps that are due for every tenant. Runs at start and on an interval, so a lost wake-up is made up. */
  scan(): Promise<void>
  /** Stops admitting, lets what is in flight end, then stops the scans. No dispatch is cancelled and no session is archived. */
  close(): Promise<void>
}>

const STOPPED = { kind: 'basis-unavailable' } as const

function createLifetime() {
  const pending = new Set<Promise<unknown>>()
  let stopping = false
  return {
    get stopping() {
      return stopping
    },
    track<T>(work: Promise<T>): Promise<T> {
      pending.add(work)
      const done = () => void pending.delete(work)
      work.then(done, done)
      return work
    },
    async drain(): Promise<void> {
      stopping = true
      await Promise.allSettled(pending)
    },
  }
}

type Lifetime = ReturnType<typeof createLifetime>

/** Wraps every operation of a face: once the stop began it answers `stopped`, and it is counted while it runs. */
function guarded<F extends object>(face: F, lifetime: Lifetime, stopped: unknown): F {
  const wrapped: Record<string, unknown> = {}
  for (const [name, operation] of Object.entries(face)) {
    const run = operation as (...args: unknown[]) => Promise<unknown>
    wrapped[name] = (...args: unknown[]) =>
      lifetime.stopping ? Promise.resolve(stopped) : lifetime.track(run(...args))
  }
  return wrapped as F
}

export async function createDispatchLocalApplication(
  options: DispatchLocalOptions,
): Promise<DispatchLocalApplication> {
  const policy = parsePolicy(options.policy)
  const report = options.report ?? (() => {})
  const timers = options.timers ?? realTimers
  const lifetime = createLifetime()
  const store = createSqlDispatchStore(options.sql)
  const woken = new Set<TenantId>()

  /** One pass per tenant at a time: a wake-up that comes while one is asked for is covered by it. */
  function wake(tenant: TenantId): void {
    if (lifetime.stopping || woken.has(tenant)) return
    woken.add(tenant)
    timers.set(() => {
      woken.delete(tenant)
      if (!lifetime.stopping) lifetime.track(registry.reconcile(tenant)).catch(report)
    }, 0)
  }

  const registry = createDispatching({
    ...options.ports,
    store,
    clock: options.clock,
    limits: { maxOpen: policy.maxOpen },
    hints: { wake },
  })
  const { advance, reconcile, dispatcherArchived, ...dispatching } = registry

  async function scan(): Promise<void> {
    const tenants = await options.sql.tenants()
    if (tenants === null) return
    await Promise.all(tenants.map(tenant => lifetime.track(reconcile(tenant))))
  }

  let periodic: unknown
  const schedule = () => {
    periodic = timers.set(() => {
      if (lifetime.stopping) return
      lifetime.track(scan()).catch(report)
      schedule()
    }, policy.reconcileIntervalMs)
  }

  let closing: Promise<void> | undefined
  await scan()
  schedule()
  return {
    dispatching: guarded(dispatching, lifetime, STOPPED),
    reconciling: {
      advance: (tenant, id) =>
        lifetime.stopping ? Promise.resolve() : lifetime.track(advance(tenant, id)),
      ...guarded({ reconcile, dispatcherArchived }, lifetime, 'unavailable'),
    },
    scan,
    close() {
      closing ??= (async () => {
        await lifetime.drain()
        timers.clear(periodic)
      })()
      return closing
    },
  }
}
