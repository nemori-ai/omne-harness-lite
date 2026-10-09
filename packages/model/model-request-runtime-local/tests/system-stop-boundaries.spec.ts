// @module-tag slow
// 归慢层：真实Cordis租户装配、SQLite内容与SQL journal验证原调用停止和历史投影。
import { describe, expect, it } from 'vitest'
import { parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'
import { modelValue } from './log-codec-fixture.ts'
import { acknowledgementHost, kinds, type HostOptions } from './acknowledgement-host-fixture.ts'
import {
  controlFactsFromHistory,
  createOriginalSystemStop,
  OwnedReadTracker,
  withOwnedReads,
} from '../src/service-control.ts'
import { readSettlementPrefix, rejectAcknowledgedHistory } from '@omne-harness-lite/model-request-runtime'
import type { SystemStopControl, CallContainerView } from '../src/service-types.ts'
import { ControlledSettlementOwner, deferred } from './settlement-fixture.ts'
import type { SettlementLogBinding, SettlementOwner, SettlementRegistration, SettlementTask } from '@omne-harness-lite/model-request-runtime'
import type { AppendResult, SessionLog } from '@omne-harness-lite/session-log'
import type { TestPlan } from './anchored-invocation-fixture.ts'

type World = Awaited<ReturnType<typeof acknowledgementHost>>
type View = CallContainerView<TestPlan, object>

async function withStop(
  name: string,
  work: (fixture: {
    readonly world: World
    readonly ref: View['key']
    readonly view: () => View
    readonly trace: string[]
    readonly retained: { readonly binding: SettlementLogBinding; readonly owner: SettlementOwner; readonly registration: SettlementRegistration; readonly task: SettlementTask<AppendResult> }[]
    readonly stop: (runtime?: World['construction'], view?: () => View) => ReturnType<ReturnType<typeof createOriginalSystemStop<TestPlan, object>>>
    readonly history: () => Promise<ReturnType<typeof rejectAcknowledgedHistory>>
  }) => Promise<void>,
  options: HostOptions = {},
): Promise<void> {
  const world = await acknowledgementHost(options)
  world.grant('owner', ['read', 'wait', 'settle', 'ack'])
  const retained: { binding: SettlementLogBinding; owner: SettlementOwner; registration: SettlementRegistration; task: SettlementTask<AppendResult> }[] = []
  try {
    const opened = await world.service.openCall(world.request(`p6-stop-${name}`))
    if (!('ref' in opened)) throw new Error('actual original creation')
    const original = world.calls.find(opened.ref)
    if (original === undefined) throw new Error('actual original container')
    const trace: string[] = []
    const view = () => original.view()
    await work({
      world, ref: opened.ref, view, trace, retained,
      stop(runtime = world.construction, readView = view) {
        const systemStop = createOriginalSystemStop(runtime, opened.ref, (binding, owner, registration, task) => {
          trace.push('retain')
          retained.push({ binding, owner, registration, task })
        })
        const control: SystemStopControl<TestPlan, object> = {
          view() { trace.push('view'); expect(this).toBe(control); return readView() },
          publishStopped() { expect(this).toBe(control); trace.push('publish') },
        }
        return systemStop(control)
      },
      async history() {
        const current = view()
        const tracker = new OwnedReadTracker()
        try {
          const read = await withOwnedReads(current.owner, 2, tracker, async registration => {
            const prefix = await readSettlementPrefix({ binding: current.session.log, registration })
            if ('unavailable' in prefix) return { unavailable: true } as const
            return world.construction.history.call(prefix.prefix, opened.callId)
          })
          if ('unavailable' in read || 'unavailable' in read.ok) throw new Error('actual owned history read')
          return rejectAcknowledgedHistory(read.ok)
        } finally {
          expect(await tracker.close()).toEqual({ released: true })
        }
      },
    })
  } finally {
    for (const kept of retained) { kept.task.requestStop(); await kept.task.stopped; kept.registration.release() }
    expect(await world.runtime.close()).toEqual({ released: true })
    await world.host.close()
  }
}

async function withFormedReply(
  name: string,
  work: Parameters<typeof withStop>[1],
  confirmReady = false,
): Promise<void> {
  let readyBatch: Parameters<SessionLog['append']> | undefined
  let refused = false
  let currentWorld: World | undefined
  await withStop(name, async fixture => {
    currentWorld = fixture.world
    expect(await fixture.world.service.dispatch(fixture.ref)).toEqual({ unavailable: true })
    expect(refused).toBe(true)
    expect(fixture.view().operation.phase).toBe('reply_pending')
    if (confirmReady) {
      if (readyBatch === undefined) throw new Error('original ready batch')
      expect(await fixture.world.host.log.append(...readyBatch)).toHaveProperty('positions')
    }
    try {
      await work(fixture)
    } finally {
      const invocation = fixture.view().invocation
      if (invocation === undefined) throw new Error('formed original invocation')
      if (confirmReady) expect(await invocation.close()).toEqual({ released: true })
      else expect(await invocation.settleReply('persisted')).toHaveProperty('settled')
    }
  }, {
    append: real => async (session, entries, fence, condition) => {
      const ready = entries.some(entry => {
        const value = modelValue(entry.payload)
        return value !== null && typeof value === 'object' && 'kind' in value && value.kind === 'model_call_reply_ready'
      })
      if (!refused && ready) {
        refused = true
        readyBatch = [session, entries, fence, condition]
        if (currentWorld === undefined) throw new Error('original world before dispatch')
        const result = await currentWorld.host.log.readSince(session, 0)
        if ('failure' in result) throw new Error('actual tail observation')
        return { failure: 'tailChanged', tail: result.tail }
      }
      return real(session, entries, fence, condition)
    },
  })
}

describe('original system stop and control history boundaries', () => {
  it('projects absent and unavailable without manufacturing a pending operation', () => {
    expect(controlFactsFromHistory({ absent: true }, false)).toEqual({ durable: { absent: true }, localCall: false })
    expect(controlFactsFromHistory({ unavailable: true, reason: 'history' }, true, { phase: 'ready' })).toEqual({ durable: { unavailable: true }, localCall: true, operation: { phase: 'ready' } })
  })

  it('retains the original nonpending operation object from an actual open SQL call', async () => {
    await withStop('projection-open', async f => {
      const history = await f.history()
      const operation = f.view().operation
      const facts = controlFactsFromHistory(history, true, operation)
      expect(facts).toEqual({ durable: { noDispatch: true, intentExists: false }, localCall: true, operation })
      expect(facts.operation).toBe(operation)
      expect(kinds(await f.world.entries())).toEqual(['model_selection_changed', 'model_call_created'])
    })
  })

  it('keeps a matching original formed reply over durable speaking facts, but excludes another response id', async () => {
    await withFormedReply('projection-pending', async f => {
      const history = await f.history()
      if (!('known' in history)) throw new Error('known actual speaking history')
      expect(history.known.phase).toBe('speaking')
      const operation = f.view().operation
      if (operation.phase !== 'reply_pending') throw new Error('actual original pending reply')
      expect(controlFactsFromHistory(history, true, operation).operation).toBe(operation)
      const different = { ...operation, pending: { ...operation.pending, id: 'another-response' } }
      expect(controlFactsFromHistory(history, true, different)).toEqual({ durable: { phase: 'speaking', intentExists: false }, localCall: true })
      const actualDispatch = history.known.dispatches.at(-1)
      expect(actualDispatch?.record.response).toBe(operation.pending.id)
      expect(kinds(await f.world.entries())).toEqual(['model_selection_changed', 'model_call_created', 'model_call_dispatched', 'model_call_opened'])
    })
  })

  it.each(['session', 'call'] as const)('rejects a different view %s before any read or final', async field => {
    await withStop(`wrong-${field}`, async f => {
      const before = await f.world.entries()
      const snapshot = f.view()
      const view = () => ({ ...snapshot, key: field === 'call' ? { ...snapshot.key, callId: 'another-call' } : { ...snapshot.key, session: unwrap(parseOpaqueIdentifier('another-session', 'SessionRef')) } })
      expect(await f.stop(f.world.construction, view)).toEqual({ unavailable: true })
      expect(f.trace).toEqual(['view'])
      expect(await f.world.entries()).toEqual(before)
    })
  })

  it('converts an original view getter throw to unavailable without publication', async () => {
    await withStop('view-throw', async f => {
      const before = await f.world.entries()
      expect(await f.stop(f.world.construction, () => { throw new Error('original view') })).toEqual({ unavailable: true })
      expect(f.trace).toEqual(['view'])
      expect(await f.world.entries()).toEqual(before)
    })
  })

  it('writes one run_cancelled interrupted final without manufacturing user intent', async () => {
    await withStop('normal', async f => {
      expect(await f.stop()).toEqual({ released: true })
      expect(f.trace).toEqual(['view', 'publish'])
      const entries = await f.world.entries()
      expect(kinds(entries)).toEqual(['model_selection_changed', 'model_call_created', 'model_call_ended'])
      expect(modelValue(entries.at(-1)?.payload)).toEqual({ kind: 'model_call_ended', call: f.ref.callId, ending: 'interrupted', initiator: 'run_cancelled' })
    })
  })

  it('uses original callFacts only for inner unavailable history and retains an open call', async () => {
    await withStop('history-unavailable', async f => {
      const before = await f.world.entries()
      const original = f.world.construction
      const runtime = {
        ...original,
        history: { ...original.history, call() { expect(this).toBe(runtime.history); f.trace.push('history'); return { unavailable: true, reason: 'history' } as const } },
        callFacts: { ...original.callFacts, async lookup(input: Parameters<typeof original.callFacts.lookup>[0]) {
          expect(this).toBe(runtime.callFacts)
          expect(input.ref).toEqual(f.ref)
          expect(input.binding).toBe(f.view().session.log)
          f.trace.push('lookup')
          return original.callFacts.lookup(input)
        } },
      }
      expect(await f.stop(runtime)).toEqual({ unavailable: true })
      expect(f.trace).toEqual(['view', 'history', 'lookup'])
      expect(await f.world.entries()).toEqual(before)
    })
  })

  it('a history reader throw remains an outer unavailable read and never invokes fallback', async () => {
    await withStop('history-throw', async f => {
      const before = await f.world.entries()
      const original = f.world.construction
      const runtime = {
        ...original,
        history: { ...original.history, call() { f.trace.push('history'); throw new Error('original reader') } },
        callFacts: { ...original.callFacts, async lookup(input: Parameters<typeof original.callFacts.lookup>[0]) { f.trace.push('lookup'); return original.callFacts.lookup(input) } },
      }
      expect(await f.stop(runtime)).toEqual({ unavailable: true })
      expect(f.trace).toEqual(['view', 'history'])
      expect(await f.world.entries()).toEqual(before)
    })
  })

  it('finishes the same durable-ready invocation and reads again only after actual finish', async () => {
    await withFormedReply('ready-two-reads', async f => {
      const snapshot = f.view()
      if (snapshot.operation.phase !== 'reply_pending' || snapshot.invocation === undefined) throw new Error('actual ready original')
      const before = await f.world.entries()
      const entered = deferred<void>()
      const release = deferred<void>()
      const original = snapshot.invocation
      const invocation: NonNullable<View['invocation']> = {
        ...original,
        async finishReady() {
          expect(this).toBe(invocation)
          f.trace.push('finish-enter')
          entered.resolve()
          await release.promise
          const result = await original.finishReady()
          f.trace.push('finish-complete')
          return result
        },
        async close() { f.trace.push('close'); return original.close() },
      }
      const construction = f.world.construction
      const runtime: World['construction'] = { ...construction,
        history: { ...construction.history, call(...args) {
          expect(this).toBe(runtime.history)
          f.trace.push('history')
          return construction.history.call(...args)
        } },
      }
      let returned = false
      const pending = f.stop(runtime, () => ({ ...snapshot, invocation })).then(result => { returned = true; return result })
      try {
        await entered.promise
        expect(f.trace).toEqual(['view', 'history', 'finish-enter'])
        expect(returned).toBe(false)
        expect(await f.world.entries()).toEqual(before)
      } finally { release.resolve() }
      expect(await pending).toEqual({ released: true })
      expect(f.trace).toEqual(['view', 'history', 'finish-enter', 'finish-complete', 'history', 'publish'])
      expect(await f.world.entries()).toEqual(before)
    }, true)
  })

  it('an original in-flight invocation close refusal prevents the second read and any final', async () => {
    await withStop('close-refusal', async f => {
      const entered = deferred<void>()
      const release = deferred<void>()
      const adapter = f.world.wire.adapter
      const originalRead = adapter.read
      const read: typeof adapter.read = async function* (...args) {
        entered.resolve()
        await release.promise
        return yield* originalRead.apply(adapter, args)
      }
      Object.defineProperty(adapter, 'read', { value: read })
      const dispatching = f.world.service.dispatch(f.ref)
      try {
        await entered.promise
        const snapshot = f.view()
        const before = await f.world.entries()
        const original = snapshot.invocation
        if (original === undefined || snapshot.operation.phase !== 'dispatching') throw new Error('actual in-flight original invocation')
        const invocation: NonNullable<View['invocation']> = { ...original,
          async close() { expect(this).toBe(invocation); f.trace.push('close'); return { unavailable: true } },
        }
        expect(await f.stop(f.world.construction, () => ({ ...snapshot, invocation }))).toEqual({ unavailable: true })
        expect(f.trace).toEqual(['view', 'close'])
        expect(await f.world.entries()).toEqual(before)
      } finally {
        release.resolve()
        expect(await dispatching).toHaveProperty('replyPending')
      }
    })
  })

  it('waits for original small-facts lookup before publishing a completed call', async () => {
    await withStop('fallback-complete', async f => {
      expect(await f.world.service.dispatch(f.ref)).toHaveProperty('replyPending')
      expect(await f.world.service.settleReply({ ...f.ref, disposition: { vetoed: { by: 'p6-original-lock' } } })).toEqual({ callId: f.ref.callId, state: 'complete' })
      const before = await f.world.entries()
      const entered = deferred<void>()
      const release = deferred<void>()
      const construction = f.world.construction
      const runtime: World['construction'] = { ...construction,
        history: { ...construction.history, call() { expect(this).toBe(runtime.history); f.trace.push('history'); return { unavailable: true, reason: 'history' } } },
        callFacts: { ...construction.callFacts, async lookup(input) {
          expect(this).toBe(runtime.callFacts)
          expect(input).toEqual({ binding: f.view().session.log, ref: f.ref })
          f.trace.push('lookup-enter')
          entered.resolve()
          await release.promise
          const result = await construction.callFacts.lookup(input)
          if (!('view' in result)) throw new Error('actual retained final view')
          expect(result.view.state).toBe('complete')
          expect(result.view.result).toBeDefined()
          f.trace.push('lookup-complete')
          return result
        } },
      }
      let returned = false
      const pending = f.stop(runtime).then(result => { returned = true; return result })
      try {
        await entered.promise
        expect(f.trace).toEqual(['view', 'history', 'lookup-enter'])
        expect(returned).toBe(false)
        expect(await f.world.entries()).toEqual(before)
      } finally { release.resolve() }
      expect(await pending).toEqual({ released: true })
      expect(f.trace).toEqual(['view', 'history', 'lookup-enter', 'lookup-complete', 'publish'])
      expect(await f.world.entries()).toEqual(before)
    })
  })

  it('retains the same unknown SQL cancellation task without publishing stopped', async () => {
    await withStop('unknown-cancel', async f => {
      expect(await f.stop()).toEqual({ unavailable: true })
      expect(f.trace).toEqual(['view', 'retain'])
      expect(f.retained).toHaveLength(1)
      expect(f.retained[0]?.binding).toBe(f.view().session.log)
      expect(f.retained[0]?.owner).toBe(f.view().owner)
      const kept = f.retained[0]
      if (kept === undefined) throw new Error('original retained cancellation')
      expect(await kept.task.completion).toEqual({ failure: 'unavailable' })
      expect(kinds(await f.world.entries())).toEqual(['model_selection_changed', 'model_call_created', 'model_call_ended'])
    }, { append: real => async (...args) => {
      const result = await real(...args)
      return args[1].some(entry => {
        const value = modelValue(entry.payload)
        return value !== null && typeof value === 'object' && 'kind' in value && value.kind === 'model_call_ended'
      }) ? { failure: 'unavailable' } : result
    } })
  })

  it('drains a failed read without releasing its actual held registration or publishing', async () => {
    const original = new ControlledSettlementOwner()
    let armed = false
    let held: SettlementRegistration | undefined
    const trace: string[] = []
    const owner: SettlementOwner = { name: original.name,
      admission: original.admission, opened: original.opened, unresolvedWrites: original.unresolvedWrites,
      acquire(limit) {
        const result = original.acquire(limit)
        if ('unavailable' in result) return result
        const registration = result.registration
        if (armed) held = registration
        return { registration: { start: registration.start, release() {
          if (armed) { trace.push('release-refusal'); throw new Error('original owned read release') }
          registration.release()
        } } }
      },
    }
    await withStop('read-drain-failure', async f => {
      const before = await f.world.entries()
      armed = true
      try {
        expect(await f.stop()).toEqual({ unavailable: true })
        expect(f.trace).toEqual(['view'])
        expect(trace).toEqual(['release-refusal'])
        expect(original.active).toBe(1)
        expect(await f.world.entries()).toEqual(before)
      } finally {
        armed = false
        if (held === undefined) throw new Error('actual held read registration')
        held.release()
      }
      expect(original.active).toBe(0)
    }, { owner })
  })

  it('formed reply without durable ready cannot finish, close or manufacture a final', async () => {
    await withFormedReply('unconfirmed-ready', async f => {
      const before = await f.world.entries()
      const snapshot = f.view()
      const original = snapshot.invocation
      if (original === undefined) throw new Error('original invocation')
      const invocation = { ...original,
        async finishReady() { f.trace.push('finish'); return original.finishReady() },
        async close() { f.trace.push('close'); return original.close() },
      }
      expect(await f.stop(f.world.construction, () => ({ ...snapshot, invocation }))).toEqual({ unavailable: true })
      expect(f.trace).toEqual(['view'])
      expect(await f.world.entries()).toEqual(before)
      expect(f.view().operation.phase).toBe('reply_pending')
    })
  })
})
