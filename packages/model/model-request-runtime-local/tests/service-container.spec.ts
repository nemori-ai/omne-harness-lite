import { describe, expect, it } from 'vitest'
import { parseOpaqueIdentifier } from '@omne-harness-lite/identity-values'
import type { AppendResult } from '@omne-harness-lite/session-log'
import type { SettlementTask } from '../src/settlement-types.ts'
import type {
  CreateCallContainerInput,
  OpenCallInput,
  ModelCallHost,
  CallObserverBinding,
  ModelObserverQueue,
  SessionRuntimeBinding,
} from '../src/service-types.ts'
import {
  createCallContainer,
  createCallContainerStore,
  createCallPreparationOwner,
} from '../src/service-container.ts'
import type {PlannedSemantics} from '@omne-harness-lite/model-request-runtime'
import type { AnchoredInvocationHandle } from '../src/anchored-invocation-types.ts'
import type { PendingModelResponse } from '@omne-harness-lite/model-response'

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

function fixture(
  sessionId: string,
  callId: string,
  systemStop: CreateCallContainerInput<PlannedSemantics, never>['systemStop'] = async () => ({
    released: true,
  }),
  observer?: Omit<CallObserverBinding, 'queue'>,
) {
  const generation = {}
  const log = { session: sessionId, tenant: { organization: 'test', account: 'test' }, generation }
  const selectionLog = { ...log, tenant: { ...log.tenant } }
  // Unused provider members belong to the host; this test exercises only local resource ownership.
  const session = { log, selection: { binding: selectionLog } } as unknown as SessionRuntimeBinding
  const oldWrites: SettlementTask<AppendResult>[] = []
  const host: ModelCallHost = {
    signal: new AbortController().signal,
    stopping: () => false,
    register: () => ({ registration: { unregister() {} } }),
  }
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
      parameters: { marker: 'old' },
      basis: {},
      tools: [],
      host,
    },
    owner: { opened: () => opened, unresolvedWrites: () => oldWrites },
    coordinator: {
      close: async () => {
        coordinatorCloses++
      },
    },
    systemStop,
    ...(observer === undefined ? {} : { observer }),
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
  it('requests other owners even when semantic stop throws, and retries without releasing early', async () => {
    let fail = true
    const f = fixture('session', 'call', async () => {
      if (fail) throw new Error('semantic stop unavailable')
      return { released: true }
    })
    expect(await f.container.close()).toEqual({ unavailable: true })
    expect(f.coordinatorCloses).toBe(1)
    expect(f.leaseReleases).toBe(0)
    fail = false
    expect(await f.container.close()).toEqual({ released: true })
    expect(f.leaseReleases).toBe(1)
  })

  it('registers before preparation and retains a late call until actual stop', async () => {
    const controller = new AbortController()
    const pending = deferred()
    let registered:
      (() => Promise<{ readonly released: true } | { readonly unavailable: true }>) | undefined
    let unregisters = 0
    const host: ModelCallHost = {
      signal: controller.signal,
      stopping: () => controller.signal.aborted,
      register(close) {
        registered = close
        return {
          registration: {
            unregister: () => {
              unregisters += 1
            },
          },
        }
      },
    }
    const prepared = createCallPreparationOwner<PlannedSemantics, never>(host)
    if (!('owner' in prepared)) throw new Error('host registration failed')
    expect(registered).toBeTypeOf('function')
    prepared.owner.retainStopped(pending.promise)
    controller.abort()
    expect(prepared.owner.signal.aborted).toBe(true)
    expect(await prepared.owner.close()).toEqual({ unavailable: true })
    const container = fixture('session', 'call').container
    prepared.owner.attach(container)
    expect(await prepared.owner.close()).toEqual({ unavailable: true })
    pending.finish()
    await Promise.resolve()
    expect(await container.close()).toEqual({ released: true })
    expect(unregisters).toBe(1)
    expect(await registered?.()).toEqual({ released: true })
    expect(unregisters).toBe(1)
  })

  it('retains early observer authorization through failed preparation and retries its close', async () => {
    let canClose = false
    let closes = 0
    let unregisters = 0
    const host: ModelCallHost = {
      signal: new AbortController().signal,
      stopping: () => false,
      register: () => ({
        registration: {
          unregister: () => {
            unregisters += 1
          },
        },
      }),
    }
    const prepared = createCallPreparationOwner<PlannedSemantics, never>(host)
    if (!('owner' in prepared)) throw new Error('host registration failed')
    const observer = prepared.owner.retainObserver({
      check: () => ({ valid: true }),
      open: () => ({ unavailable: true }),
      close: async () => {
        closes += 1
        return canClose ? { released: true } : { unavailable: true }
      },
    })
    expect(await prepared.owner.discard()).toEqual({ unavailable: true })
    expect(unregisters).toBe(0)
    canClose = true
    expect(await observer.close()).toEqual({ released: true })
    expect(await prepared.owner.close()).toEqual({ released: true })
    expect(closes).toBe(2)
    expect(unregisters).toBe(1)
  })

  it('transfers the same authorized observer to the published call without double close', async () => {
    let closes = 0
    let unregisters = 0
    const host: ModelCallHost = {
      signal: new AbortController().signal,
      stopping: () => false,
      register: () => ({
        registration: {
          unregister: () => {
            unregisters += 1
          },
        },
      }),
    }
    const prepared = createCallPreparationOwner<PlannedSemantics, never>(host)
    if (!('owner' in prepared)) throw new Error('host registration failed')
    const authorization = prepared.owner.retainObserver({
      check: () => ({ valid: true }),
      open: () => ({ unavailable: true }),
      close: async () => {
        closes += 1
        return { released: true }
      },
    })
    const observer: Omit<CallObserverBinding, 'queue'> = {
      request: {
        session: sessionRef('session'),
        endpoint: {
          open: () => ({
            receive: () => ({ completion: Promise.resolve(), stopped: Promise.resolve() }),
            stop() {},
            stopped: Promise.resolve(),
          }),
        },
        observer_max_buffered_events: 1,
        observer_max_buffered_bytes: 100,
      },
      authorization,
    }
    const call = fixture('session', 'call', async () => ({ released: true }), observer)
    prepared.owner.attach(call.container)
    expect(await call.container.close()).toEqual({ released: true })
    expect(await prepared.owner.close()).toEqual({ released: true })
    expect(closes).toBe(1)
    expect(unregisters).toBe(1)
  })

  it('keeps the old observer until its receiver actually stops before the next dispatch', async () => {
    let oldStopped = false
    let nextConstructed = 0
    let authorizationCloses = 0
    const observer: Omit<CallObserverBinding, 'queue'> = {
      request: {
        session: sessionRef('session'),
        endpoint: {
          open: () => ({
            receive: () => ({ completion: Promise.resolve(), stopped: Promise.resolve() }),
            stop() {},
            stopped: Promise.resolve(),
          }),
        },
        observer_max_buffered_events: 1,
        observer_max_buffered_bytes: 100,
      },
      authorization: {
        check: () => ({ valid: true }),
        open: () => ({ unavailable: true }),
        close: async () => {
          authorizationCloses += 1
          return { released: true }
        },
      },
    }
    const f = fixture('session', 'call', async () => ({ released: true }), observer)
    const store = createCallContainerStore<PlannedSemantics, never>()
    const admitted = store.reserve(f.container.key)
    if (!('reservation' in admitted)) throw new Error('reservation absent')
    expect(store.insert(admitted.reservation, f.container)).toBe(true)
    const oldQueue: ModelObserverQueue = {
      offer: () => ({ accepted: true }),
      start: () => ({ accepted: true }),
      close: async () => (oldStopped ? { released: true } : { unavailable: true }),
    }
    const nextQueue: ModelObserverQueue = {
      offer: () => ({ accepted: true }),
      start: () => ({ accepted: true }),
      close: async () => ({ released: true }),
    }
    expect(await admitted.reservation.replaceObserverQueue(() => oldQueue)).toEqual({
      queue: oldQueue,
    })
    expect(
      await admitted.reservation.replaceObserverQueue(() => {
        nextConstructed += 1
        return nextQueue
      }),
    ).toEqual({ unavailable: true })
    expect(nextConstructed).toBe(0)
    expect(f.container.view().observer?.queue).toBe(oldQueue)
    oldStopped = true
    expect(
      await admitted.reservation.replaceObserverQueue(() => {
        nextConstructed += 1
        return nextQueue
      }),
    ).toEqual({ queue: nextQueue })
    expect(nextConstructed).toBe(1)
    admitted.reservation.release()
    expect(await store.close()).toEqual({ released: true })
    expect(authorizationCloses).toBe(1)
    expect(f.leaseReleases).toBe(1)
  })

  it('retains a newly authorized resume observer when the old receiver cannot stop', async () => {
    let canStop = false
    let incomingCloses = 0
    const observer: Omit<CallObserverBinding, 'queue'> = {
      request: {
        session: sessionRef('session'),
        endpoint: {
          open: () => ({
            receive: () => ({ completion: Promise.resolve(), stopped: Promise.resolve() }),
            stop() {},
            stopped: Promise.resolve(),
          }),
        },
        observer_max_buffered_events: 1,
        observer_max_buffered_bytes: 100,
      },
      authorization: {
        check: () => ({ valid: true }),
        open: () => ({ unavailable: true }),
        close: async () => ({ released: true }),
      },
    }
    const f = fixture('session', 'call', async () => ({ released: true }), observer)
    const store = createCallContainerStore<PlannedSemantics, never>()
    const admitted = store.reserve(f.container.key)
    if (!('reservation' in admitted)) throw new Error('reservation absent')
    expect(store.insert(admitted.reservation, f.container)).toBe(true)
    const oldQueue: ModelObserverQueue = {
      offer: () => ({ accepted: true }),
      start: () => ({ accepted: true }),
      close: async () => (canStop ? { released: true } : { unavailable: true }),
    }
    expect(await admitted.reservation.replaceObserverQueue(() => oldQueue)).toEqual({
      queue: oldQueue,
    })
    const incoming: Omit<CallObserverBinding, 'queue'> = {
      request: observer.request,
      authorization: {
        check: () => ({ valid: true }),
        open: () => ({ unavailable: true }),
        close: async () => {
          incomingCloses += 1
          return canStop ? { released: true } : { unavailable: true }
        },
      },
    }
    expect(await admitted.reservation.replaceObserverBinding(incoming)).toEqual({
      unavailable: true,
    })
    expect(f.container.view().observer?.authorization).toBe(observer.authorization)
    expect(f.container.view().observerReplacementPending).toBe(true)
    expect(await admitted.reservation.refreshObserverReplacement()).toEqual({ unavailable: true })
    canStop = true
    expect(await admitted.reservation.refreshObserverReplacement()).toEqual({ ready: true })
    expect(f.container.view().observerReplacementPending).toBe(false)
    expect(incomingCloses).toBe(3)
    admitted.reservation.release()
    expect(await store.close()).toEqual({ released: true })
  })
  it('closes every session call while retaining only the unresolved owner for retry', async () => {
    const store = createCallContainerStore<PlannedSemantics, never>()
    const blocked = fixture('session-a', 'same-call')
    const healthy = fixture('session-b', 'same-call')
    for (const item of [blocked, healthy]) {
      const admitted = store.reserve(item.container.key)
      if (!('reservation' in admitted)) throw new Error('reservation absent')
      expect(store.insert(admitted.reservation, item.container)).toBe(true)
      admitted.reservation.release()
    }
    blocked.setOpened({
      unknown: { completion: Promise.resolve(), stopped: Promise.resolve(), requestStop() {} },
    })
    const first = store.close()
    expect(store.reserve(blocked.container.key)).toEqual({ closed: true })
    expect(await first).toEqual({ unavailable: true })
    expect(blocked.leaseReleases).toBe(0)
    expect(healthy.leaseReleases).toBe(1)
    expect(store.find(blocked.container.key)).toBe(blocked.container)
    expect(store.find(healthy.container.key)).toBeUndefined()
    blocked.setOpened({ confirmed: true })
    expect(await store.close()).toEqual({ released: true })
    expect(await store.close()).toEqual({ released: true })
    expect(blocked.leaseReleases).toBe(1)
    expect(healthy.leaseReleases).toBe(1)
  })

  it('closes admission before a late insert or invocation replacement can publish', async () => {
    const store = createCallContainerStore<PlannedSemantics, never>()
    const item = fixture('session', 'call')
    const admitted = store.reserve(item.container.key)
    if (!('reservation' in admitted)) throw new Error('reservation absent')
    const closing = store.close()
    expect(store.insert(admitted.reservation, item.container)).toBe(false)
    expect(() => admitted.reservation.attachInvocation({} as AnchoredInvocationHandle)).toThrow(
      'reservation admission closed',
    )
    expect(() => admitted.reservation.updateRequest(item.container.view().request)).toThrow(
      'reservation admission closed',
    )
    let created = 0
    expect(
      await admitted.reservation.replaceInvocation(() => {
        created++
        return {} as AnchoredInvocationHandle
      }),
    ).toEqual({ unavailable: true })
    expect(created).toBe(0)
    expect(await closing).toEqual({ unavailable: true })
    admitted.reservation.release()
    expect(await store.close()).toEqual({ released: true })
    expect(item.leaseReleases).toBe(0)
  })

  it('does not invoke a delayed replacement factory after close begins', async () => {
    const store = createCallContainerStore<PlannedSemantics, never>()
    const item = fixture('session', 'call')
    const first = store.reserve(item.container.key)
    if (!('reservation' in first)) throw new Error('reservation absent')
    expect(store.insert(first.reservation, item.container)).toBe(true)
    const gate = deferred()
    const old: AnchoredInvocationHandle = {
      outcome: Promise.resolve({ unavailable: true }),
      snapshot: () => ({ blocks: [], position: 0 }),
      observedFacts: () => ({ unavailable: true }),
      abort() {},
      borrowControl: () => ({ unavailable: true }),
      interrupt() {},
      async close() {
        await gate.promise
        return { released: true } as const
      },
      async settleReply() {
        return { unavailable: true, reason: 'candidate' } as const
      },
      finishReady: async () => ({ unavailable: true as const }),
    }
    first.reservation.attachInvocation(old)
    first.reservation.release()
    const current = store.reserve(item.container.key)
    if (!('reservation' in current)) throw new Error('reservation absent')
    let created = 0
    const replacing = current.reservation.replaceInvocation(() => {
      created++
      return old
    })
    const closing = store.close()
    gate.finish()
    expect(await replacing).toEqual({ unavailable: true })
    expect(created).toBe(0)
    expect(await closing).toEqual({ unavailable: true })
    current.reservation.release()
    expect(await store.close()).toEqual({ released: true })
    expect(item.leaseReleases).toBe(1)
  })

  it('replaces a released send only under a still-owned ready reservation', async () => {
    const store = createCallContainerStore<PlannedSemantics, never>()
    const f = fixture('session', 'call')
    const first = store.reserve(f.container.key)
    if (!('reservation' in first)) throw new Error('first reservation absent')
    expect(store.insert(first.reservation, f.container)).toBe(true)
    const gate = deferred()
    let closes = 0
    const old = {
      outcome: Promise.resolve({ unavailable: true }),
      snapshot: () => ({ blocks: [], position: 0 }),
      observedFacts: () => ({ unavailable: true }),
      abort() {},
      borrowControl: () => ({ unavailable: true }),
      interrupt() {},
      async close() {
        closes++
        await gate.promise
        return { released: true } as const
      },
      async settleReply() {
        return { unavailable: true, reason: 'candidate' } as const
      },
      finishReady: async () => ({ unavailable: true as const }),
    } as AnchoredInvocationHandle
    const next = {
      outcome: Promise.resolve({ unavailable: true }),
      snapshot: () => ({ blocks: [], position: 0 }),
      observedFacts: () => ({ unavailable: true }),
      abort() {},
      borrowControl: () => ({ unavailable: true }),
      interrupt() {},
      async close() {
        return { released: true } as const
      },
      async settleReply() {
        return { unavailable: true, reason: 'candidate' } as const
      },
      finishReady: async () => ({ unavailable: true as const }),
    } as AnchoredInvocationHandle
    first.reservation.attachInvocation(old)
    first.reservation.release()
    let created = 0
    const create = () => {
      created++
      return next
    }
    const pending = store.reserve(f.container.key)
    if (!('reservation' in pending)) throw new Error('pending reservation absent')
    pending.reservation.publish({ phase: 'reply_pending', pending: {} as PendingModelResponse })
    expect(await pending.reservation.replaceInvocation(create)).toEqual({ unavailable: true })
    expect(created).toBe(0)
    pending.reservation.publish({ phase: 'ready' })
    f.setOpened({
      unknown: { completion: Promise.resolve(), stopped: Promise.resolve(), requestStop() {} },
    })
    expect(await pending.reservation.replaceInvocation(create)).toEqual({ unavailable: true })
    expect(created).toBe(0)
    f.setOpened({ confirmed: true })
    const interrupted = pending.reservation.replaceInvocation(create)
    await Promise.resolve()
    pending.reservation.release()
    gate.finish()
    expect(await interrupted).toEqual({ unavailable: true })
    expect(created).toBe(0)
    expect(f.container.view().invocation).toBe(old)
    expect(f.leaseReleases).toBe(0)
    const retry = store.reserve(f.container.key)
    if (!('reservation' in retry)) throw new Error('retry reservation absent')
    expect(
      await retry.reservation.replaceInvocation(() => {
        throw new Error('construction failed')
      }),
    ).toEqual({ unavailable: true })
    expect(retry.reservation.view()?.invocation).toBe(old)
    expect(await retry.reservation.replaceInvocation(create)).toEqual({ attached: next })
    expect(created).toBe(1)
    expect(closes).toBe(3)
    expect(retry.reservation.view()?.invocation).toBe(next)
    expect(f.leaseReleases).toBe(0)
    retry.reservation.release()
  })
  it('updates only the same call resume request without carrying old optional fields', () => {
    const store = createCallContainerStore<PlannedSemantics, never>()
    const f = fixture('session', 'call')
    const first = store.reserve(f.container.key)
    if (!('reservation' in first)) throw new Error('first reservation absent')
    expect(store.insert(first.reservation, f.container)).toBe(true)
    const old = f.container.view().request
    const originalBinding = f.container.view().binding
    const messages: OpenCallInput['messages'] = []
    const tools: OpenCallInput['tools'] = []
    const next = {
      session: old.session,
      callId: f.container.key.callId,
      host: old.host,
      messages,
      target: old.target,
      basis: old.basis,
      tools,
    } as OpenCallInput
    first.reservation.updateRequest(next)
    expect(f.container.view().request).not.toBe(old)
    expect(f.container.view().request.messages).not.toBe(messages)
    expect(f.container.view().request.tools).not.toBe(tools)
    expect(f.container.view().request.parameters).toBeUndefined()
    expect(f.container.view().binding).toBe(originalBinding)
    expect(() => first.reservation.updateRequest({ ...next, callId: 'other' })).toThrow(
      'call request ownership mismatch',
    )
    expect(() => first.reservation.updateRequest({ ...next, host: { ...old.host } })).toThrow(
      'call request ownership mismatch',
    )
    first.reservation.publish({
      phase: 'dispatching',
      target: { kind: 'model_call', callId: f.container.key.callId, dispatch: 1 },
      abort() {},
      interrupt() {},
    })
    expect(() => first.reservation.updateRequest(next)).toThrow('cannot update request')
    first.reservation.release()
    expect(() => first.reservation.updateRequest(next)).toThrow('reservation released')
  })
  it('binds only the original invocation under a reservation and keeps it through close', async () => {
    const store = createCallContainerStore<PlannedSemantics, never>()
    const f = fixture('session', 'call')
    const reservation = store.reserve(f.container.key)
    if (!('reservation' in reservation)) throw new Error('reservation absent')
    expect(store.insert(reservation.reservation, f.container)).toBe(true)
    let closes = 0
    let canStop = false
    const original = {
      close: async () => {
        closes++
        return canStop ? { released: true } : { unavailable: true }
      },
    } as AnchoredInvocationHandle
    reservation.reservation.attachInvocation(original)
    reservation.reservation.attachInvocation(original)
    expect(reservation.reservation.view()?.invocation).toBe(original)
    expect(() =>
      reservation.reservation.attachInvocation({
        close: async () => ({ released: true }),
      } as AnchoredInvocationHandle),
    ).toThrow('original invocation already attached')
    reservation.reservation.release()
    expect(() => reservation.reservation.attachInvocation(original)).toThrow('reservation released')
    expect(await f.container.close()).toEqual({ unavailable: true })
    expect(f.leaseReleases).toBe(0)
    expect(store.find(f.container.key)?.view().invocation).toBe(original)
    canStop = true
    expect(await f.container.close()).toEqual({ released: true })
    expect(closes).toBe(2)
    expect(f.leaseReleases).toBe(1)
  })
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
      target: { kind: 'model_call', callId: f.container.key.callId, dispatch: 1 },
      abort: () => {
        aborts++
      },
      interrupt: () => {
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
