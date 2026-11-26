import {
  createGoals,
  type Clock,
  type GoalAuthority,
  type GoalCalls,
  type GoalCards,
  type GoalDecisions,
  type GoalHistory,
  type GoalChanges,
  type GoalJudging,
  type GoalSessions,
} from '@omne-harness/goal'
import type { GoalChecking, GoalReconciling, Goals } from '@omne-harness/goal-contract'
import { parsePolicy } from './policy.ts'
import { createSqlGoalStore, type GoalSqlOptions } from './storage/store.ts'

export type Timers = Readonly<{ after(delayMs: number, fire: () => void): () => void }>

export type GoalLocalOptions = Readonly<{
  /** Parsed against the policy schema. A missing or invalid value refuses to load. */
  policy: unknown
  sql: GoalSqlOptions &
    Readonly<{
      /** Every tenant that may hold goals now. Null: not known now, so nothing is scanned. */
      tenants(): Promise<readonly string[] | null>
    }>
  ports: Readonly<{
    authority: GoalAuthority
    sessions: GoalSessions
    cards: GoalCards
    calls: GoalCalls
    history: GoalHistory
    decisions: GoalDecisions
    judging: GoalJudging
    changes?: GoalChanges
  }>
  clock: Clock
  timers: Timers
  report?: (error: unknown) => void
}>

export type GoalLocalApplication = Readonly<{
  goals: Goals
  checking: GoalChecking
  reconciling: GoalReconciling
  /** Hands over what every tenant's goals still owe. Runs at start and on an interval, so a lost wake-up is made up. */
  scan(): Promise<void>
  /** Stops admitting, lets what is in flight end, then stops the scans. No goal is settled by closing. */
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

export async function createGoalLocalApplication(
  options: GoalLocalOptions,
): Promise<GoalLocalApplication> {
  const policy = parsePolicy(options.policy)
  const report = options.report ?? (() => {})
  const { timers } = options
  const lifetime = createLifetime()
  const store = createSqlGoalStore(options.sql)
  const woken = new Set<string>()

  /** One pass per tenant at a time: a wake-up that comes while one is asked for is covered by it. */
  function wake(tenant: string): void {
    if (lifetime.stopping || woken.has(tenant)) return
    woken.add(tenant)
    timers.after(policy.reconcileIntervalMs, () => {
      woken.delete(tenant)
      if (!lifetime.stopping) lifetime.track(registry.reconcile(tenant)).catch(report)
    })
  }

  const registry = createGoals({ ...options.ports, store, clock: options.clock, hints: { wake } })
  const { reconcile, observe, compacted, ...goals } = registry

  async function scan(): Promise<void> {
    const tenants = await options.sql.tenants()
    if (tenants === null) return
    await Promise.all(tenants.map(tenant => lifetime.track(reconcile(tenant))))
  }

  let cancelPeriodic = (): void => {}
  const schedule = () => {
    cancelPeriodic = timers.after(policy.reconcileIntervalMs, () => {
      if (lifetime.stopping) return
      lifetime.track(scan()).catch(report)
      schedule()
    })
  }

  let closing: Promise<void> | undefined
  await scan()
  schedule()
  return {
    goals: guarded(goals, lifetime, STOPPED),
    checking: guarded({ observe, compacted }, lifetime, STOPPED),
    reconciling: {
      reconcile: tenant =>
        lifetime.stopping ? Promise.resolve() : lifetime.track(reconcile(tenant)),
    },
    scan,
    close() {
      closing ??= (async () => {
        await lifetime.drain()
        cancelPeriodic()
      })()
      return closing
    },
  }
}
