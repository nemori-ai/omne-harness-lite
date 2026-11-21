import type { CallContext, Dispatch, Outcome } from '@omne-harness/dispatch-contract'
import { createDispatching } from '@omne-harness/dispatch'
import {
  createMemoryDispatchStore,
  fakeAuthority,
  fakeClock,
  fakeCopies,
  fakeDefinitions,
  fakeSessions,
  fakeWaits,
  sessionNamed,
  tenantOf,
} from '@omne-harness/dispatch/testing'

export const TENANT = tenantOf('1')
export const PARENT = sessionNamed('parent')

/** One tenant with one main session, every port a fake, and the registry over the memory store. */
export function world(maxOpen = 4) {
  const store = createMemoryDispatchStore()
  const sessions = fakeSessions()
  const waits = fakeWaits()
  const authority = fakeAuthority()
  const definitions = fakeDefinitions()
  const copies = fakeCopies()
  const clock = fakeClock()
  const woken: string[] = []
  const deps = {
    authority,
    store,
    sessions,
    waits,
    copies,
    definitions,
    clock,
    limits: { maxOpen },
    hints: { wake: (tenant: string) => void woken.push(tenant) },
  }
  sessions.seat(TENANT, { session: PARENT })
  const registry = createDispatching(deps)
  const ctx = (session = PARENT, tenant = TENANT): CallContext => ({
    tenant,
    subject: { verified: session },
    session,
  })
  /** The registry a process builds after a restart: the same store and world, nothing kept in memory. */
  const rebuilt = () => createDispatching(deps)
  return {
    store,
    sessions,
    waits,
    authority,
    definitions,
    copies,
    clock,
    registry,
    ctx,
    rebuilt,
    woken,
  }
}

export type World = ReturnType<typeof world>

export function valueOf<T>(outcome: Outcome<T, string>): T {
  if (outcome.kind !== 'done') throw new Error(`expected done, got ${JSON.stringify(outcome)}`)
  return outcome.value
}

/** A delegate of the parent session, started: its session exists and its run goes on. */
export async function started(w: World, call = 'call-1', mode: Dispatch['mode'] = 'delegate') {
  const dispatch = valueOf(
    await w.registry.dispatch(w.ctx(), {
      mode,
      agent: 'helper',
      instruction: 'look into it',
      call,
    }),
  )
  if (dispatch.state !== 'started') throw new Error(`expected started, got ${dispatch.state}`)
  return dispatch
}

export const read = async (w: World, id: Dispatch['id']): Promise<Dispatch> =>
  valueOf(await w.registry.show(w.ctx(), id))
