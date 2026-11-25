import type { GoalCaller, DirectWrite } from '@omne-harness/goal-contract'
import {
  createGoalLocalApplication,
  type GoalLocalOptions,
  type Timers,
} from '@omne-harness/goal-local'
import { fakeAuthority, fakeCards, fakeSessions } from '@omne-harness/goal/testing'
import type { SqlWorld } from './storage/world.ts'

export const T1 = 't1'
export const SESSION = 'session-1'
export const OWNER: GoalCaller = { tenant: T1, subject: 'owner' }
export const SET: DirectWrite = {
  session: SESSION,
  operation: 'op-1',
  proposal: {
    kind: 'set',
    draft: {
      purpose: '把事做完',
      criteria: [{ statement: '做完了', evidence: { kind: 'person' } }],
    },
  },
  words: null,
  draftedBy: 'person',
  by: 'acc-1',
}
export const INTERVAL = 60_000

/** Waits that fire only when a test says so. */
export function manualTimers() {
  const pending = new Map<number, () => void>()
  let next = 0
  const timers: Timers = {
    after(_delayMs, run) {
      next += 1
      const id = next
      pending.set(id, run)
      return () => void pending.delete(id)
    },
  }
  return {
    timers,
    pending: () => pending.size,
    fire(): void {
      const due = [...pending]
      pending.clear()
      for (const [, run] of due) run()
    },
  }
}

/** The ports of one process lifetime of the world: they outlive an application, as the real ones do. */
export function fakePorts() {
  const sessions = fakeSessions()
  sessions.add(SESSION, 'attended')
  return { authority: fakeAuthority(), sessions, cards: fakeCards() }
}
export type Ports = ReturnType<typeof fakePorts>

export function optionsOf(world: SqlWorld, ports: Ports, change: Partial<GoalLocalOptions> = {}) {
  const manual = manualTimers()
  const options: GoalLocalOptions = {
    policy: { reconcileIntervalMs: INTERVAL },
    sql: { storage: world.storage, bind: tenant => world.bind(tenant), tenants: async () => [T1] },
    ports,
    clock: { now: () => '2026-11-25T00:00:00.000Z' },
    timers: manual.timers,
    ...change,
  }
  return { options, manual }
}

export async function openApplication(world: SqlWorld, ports: Ports) {
  const { options, manual } = optionsOf(world, ports)
  return { application: await createGoalLocalApplication(options), manual }
}

/** Lets the promises a fired timer started run to their end. */
export const settled = () => new Promise<void>(resolve => setTimeout(resolve, 50))
