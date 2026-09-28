import { describe, expect, it } from 'vitest'
import { parseOpaqueIdentifier } from '@omne-harness-lite/identity-values'
import type { AppendResult } from '@omne-harness-lite/session-log-jsonl'
import type { SettlementTask } from '../src/settlement-types.ts'
import type { CreateCallContainerInput, SessionRuntimeBinding } from '../src/service-types.ts'
import { createCallContainer, createCallContainerStore } from '../src/service-container.ts'
import type { PlannedSemantics } from '../src/types.ts'

function deferred() {
  let resolve: (() => void) | undefined
  const promise = new Promise<void>(accept => {
    resolve = accept
  })
  return {
    promise,
    finish: () => {
      if (resolve === undefined) throw new Error('deferred unresolved')
      resolve()
    },
  }
}

function sessionRef(value: string) {
  const parsed = parseOpaqueIdentifier(value, 'SessionRef')
  if ('invalidInput' in parsed) throw new Error('invalid test session')
  return parsed.ok
}

function fixture(sessionId: string, callId: string) {
  const generation = {}
  const log = { session: sessionId, tenant: { organization: 'test', account: 'test' }, generation }
  const selectionLog = { ...log, tenant: { ...log.tenant } }
  // Unused provider members belong to the host; this test exercises only local resource ownership.
  const session = { log, selection: { binding: selectionLog } } as unknown as SessionRuntimeBinding
  const oldWrites: SettlementTask<AppendResult>[] = []
  let opened: ReturnType<CreateCallContainerInput<PlannedSemantics, never>['owner']['opened']> = {
    confirmed: true,
  }
  let leaseReleases = 0
  let coordinatorCloses = 0
  const input = {
    key: { session: sessionId, callId },
    session,
    binding: {
      profile: { origin: 'official', routeName: 'model' },
      snapshot: {},
      parameters: {},
      selectedBy: 'session',
      lease: {
        release: () => {
          leaseReleases++
        },
      },
    },
    request: {
      session: sessionId,
      messages: [],
      target: 'model',
      basis: {},
      tools: [],
      host: session,
    },
    owner: { opened: () => opened, unresolvedWrites: () => oldWrites },
    coordinator: {
      close: async () => {
        coordinatorCloses++
      },
    },
  } as unknown as CreateCallContainerInput<PlannedSemantics, never>
  const container = createCallContainer(input)
  return {
    container,
    oldWrites,
    get leaseReleases() {
      return leaseReleases
    },
    get coordinatorCloses() {
      return coordinatorCloses
    },
    setOpened(value: typeof opened) {
      opened = value
    },
  }
}

describe('call container admission and retention', () => {
  it('serializes one session/call key without blocking another session', () => {
    const store = createCallContainerStore<PlannedSemantics, never>()
    const first = store.reserve({ session: sessionRef('session-a'), callId: 'same-call' })
    if (!('reservation' in first)) throw new Error('first reservation')
    expect(store.reserve({ session: sessionRef('session-a'), callId: 'same-call' })).toEqual({
      occupied: true,
    })
    const other = store.reserve({ session: sessionRef('session-b'), callId: 'same-call' })
    if (!('reservation' in other)) throw new Error('other reservation')
    const a = fixture('session-a', 'same-call')
    const b = fixture('session-b', 'same-call')
    expect(store.insert(first.reservation, a.container)).toBe(true)
    expect(store.insert(other.reservation, b.container)).toBe(true)
    expect(store.find({ session: sessionRef('session-a'), callId: 'same-call' })).toBe(a.container)
    expect(store.find({ session: sessionRef('session-b'), callId: 'same-call' })).toBe(b.container)
    expect(store.remove(first.reservation)).toBe(false)
    first.reservation.release()
    expect(store.remove(first.reservation)).toBe(false)
    expect(() => first.reservation.view()).toThrow('reservation released')
    expect(() => first.reservation.publish({ phase: 'ready' })).toThrow('reservation released')
    other.reservation.release()
  })

  it('allows interrupt admission during a stream and retains unknown writers and lease', async () => {
    const store = createCallContainerStore<PlannedSemantics, never>()
    const f = fixture('session', 'call')
    const opening = store.reserve(f.container.key)
    if (!('reservation' in opening)) throw new Error('opening reservation')
    expect(store.insert(opening.reservation, f.container)).toBe(true)
    const stop = deferred()
    f.container.retainStopped(stop.promise)
    let aborts = 0
    opening.reservation.publish({
      phase: 'dispatching',
      abort: () => {
        aborts++
      },
    })
    opening.reservation.release()

    const interrupt = store.reserve(f.container.key)
    if (!('reservation' in interrupt)) throw new Error('interrupt reservation')
    const state = interrupt.reservation.view()?.operation
    if (state?.phase !== 'dispatching') throw new Error('stream not visible')
    state.abort()
    expect(aborts).toBe(1)
    interrupt.reservation.release()

    f.setOpened({
      unknown: { completion: Promise.resolve(), stopped: stop.promise, requestStop() {} },
    })
    const closing = f.container.close()
    await Promise.resolve()
    expect(f.leaseReleases).toBe(0)
    const duringClose = store.reserve(f.container.key)
    if (!('reservation' in duringClose)) throw new Error('reservation during close')
    duringClose.reservation.release()
    f.container.publish({ phase: 'ready' })
    stop.finish()
    expect(await closing).toEqual({ unavailable: true })
    expect(store.find(f.container.key)).toBe(f.container)
    expect(f.leaseReleases).toBe(0)
    f.setOpened({ confirmed: true })
    expect(await f.container.close()).toEqual({ released: true })
    expect(f.leaseReleases).toBe(1)
    const removing = store.reserve(f.container.key)
    if (!('reservation' in removing)) throw new Error('removal reservation')
    expect(store.remove(removing.reservation)).toBe(true)
    removing.reservation.release()
    expect(store.find(f.container.key)).toBeUndefined()
  })

  it('does not release a lease while an old response writer remains unresolved', async () => {
    const f = fixture('session', 'call')
    f.oldWrites.push({
      completion: Promise.resolve({} as AppendResult),
      stopped: Promise.resolve(),
      requestStop() {},
    })
    expect(await f.container.close()).toEqual({ unavailable: true })
    expect(f.container.canRemove()).toBe(false)
    expect(f.leaseReleases).toBe(0)
    f.oldWrites.length = 0
    expect(await f.container.close()).toEqual({ released: true })
    expect(f.container.canRemove()).toBe(true)
    expect(f.leaseReleases).toBe(1)
    expect(f.coordinatorCloses).toBe(2)
  })
})
