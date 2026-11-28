import type { CallContext, SessionRef, TenantId } from '@omne-harness/dispatch-contract'
import {
  createDispatchLocalApplication,
  type DispatchLocalOptions,
  type DispatchPolicy,
  type Timers,
} from '@omne-harness/dispatch-local'
import {
  fakeAuthority,
  fakeClock,
  fakeCopies,
  fakeDefinitions,
  fakeSessions,
  fakeWaits,
} from '@omne-harness/dispatch/testing'
import type { SqlWorld } from './storage/world.ts'

export const T1 = 't1' as TenantId
export const PARENT = 'parent' as SessionRef
export const ASK = {
  mode: 'delegate',
  agent: 'helper',
  instruction: 'look into it',
  call: 'call-1',
} as const

export const policy = (overrides: Partial<DispatchPolicy> = {}): DispatchPolicy => ({
  maxOpen: 4,
  reconcileIntervalMs: 60_000,
  ...overrides,
})

/** Waits that fire only when a test says so. */
export function manualTimers() {
  const pending = new Map<number, { run: () => void; delayMs: number }>()
  let next = 0
  const timers: Timers = {
    after(delayMs, run) {
      next += 1
      const id = next
      pending.set(id, { run, delayMs })
      return () => void pending.delete(id)
    },
  }
  return {
    timers,
    delays: () => [...pending.values()].map(entry => entry.delayMs).sort((a, b) => a - b),
    /** Fires every timer of this delay that is pending now. */
    fire(delayMs: number): number {
      const due = [...pending].filter(([, entry]) => entry.delayMs === delayMs)
      for (const [id, entry] of due) {
        pending.delete(id)
        entry.run()
      }
      return due.length
    },
  }
}

/** The ports of one process lifetime of the world: they outlive an application, as the real ones do. */
export function fakePorts() {
  const sessions = fakeSessions()
  sessions.seat(T1, { session: PARENT })
  return {
    authority: fakeAuthority(),
    sessions,
    waits: fakeWaits(),
    copies: fakeCopies(),
    definitions: fakeDefinitions(),
  }
}

export type Ports = ReturnType<typeof fakePorts>

export function optionsOf(
  world: SqlWorld,
  ports: Ports,
  change: Partial<DispatchLocalOptions> = {},
): DispatchLocalOptions & Readonly<{ manual: ReturnType<typeof manualTimers> }> {
  const manual = manualTimers()
  return {
    policy: policy(),
    sql: {
      storage: world.storage,
      bind: tenant => world.bind(tenant),
      tenants: async () => [T1],
    },
    ports,
    clock: fakeClock(),
    timers: manual.timers,
    manual,
    ...change,
  }
}

export async function openApplication(
  world: SqlWorld,
  ports: Ports,
  change: Partial<DispatchLocalOptions> = {},
) {
  const { manual, ...options } = optionsOf(world, ports, change)
  const application = await createDispatchLocalApplication(options)
  return { application, manual, options }
}

export const ctx = (session: SessionRef = PARENT): CallContext => ({
  tenant: T1,
  subject: { verified: session },
  session,
  asking: null,
})

/** Lets the promises a fired timer started run to their end. */
export const settled = () => new Promise<void>(resolve => setTimeout(resolve, 50))
