import { createRuntimeReads } from './service-reads.ts'
import { createServiceCalls } from './service-calls.ts'
import { createServiceDispatch } from './service-dispatch.ts'
import { createServiceControl } from './service-control.ts'
import { createRuntimeReconcile, createRuntimeSettleReply } from './service-reconcile.ts'
import type {
  ModelRuntimeService,
  RuntimeCloseResult,
  RuntimeConstruction,
} from './service-types.ts'
import type { PlannedSemantics } from './types.ts'

const ownedStores = new WeakSet<object>()
const unavailable = Object.freeze({ unavailable: true } as const)
const runtimeStopped = Object.freeze({ runtimeStopped: true } as const)

/** One process owner for all thirteen operations and their shared call store. */
export function createModelRuntime<P extends PlannedSemantics, R>(
  construction: RuntimeConstruction<P, R>,
): {
  readonly service: ModelRuntimeService
  readonly close: () => Promise<RuntimeCloseResult>
} {
  if (ownedStores.has(construction.calls)) throw new TypeError('call store already owned')
  // These constructors only create local closures; host resource acquisition precedes this factory.
  const reads = createRuntimeReads(construction)
  const calls = createServiceCalls(construction)
  const dispatch = createServiceDispatch(construction)
  const control = createServiceControl(construction)
  const settleReply = createRuntimeSettleReply({
    calls: construction.calls,
    recovery: construction.recovery,
    contention: construction.settlementContention,
    scheduler: construction.settlementScheduler,
    reservationWaitPolicy: construction.reservationWaitPolicy,
  })
  const reconcile = createRuntimeReconcile({
    recovery: construction.recovery,
    contention: construction.settlementContention,
    scheduler: construction.settlementScheduler,
    now: construction.policy.now,
    diagnostic: construction.diagnostic,
  })
  ownedStores.add(construction.calls)

  const inFlight = new Set<Promise<void>>()
  let admissionClosed = false
  let released = false
  let closing: Promise<RuntimeCloseResult> | undefined

  function guarded<I, O>(operation: (input: I) => Promise<O>, halted: O): (input: I) => Promise<O> {
    return async input => {
      if (admissionClosed) return halted
      let complete = () => {}
      const done = new Promise<void>(resolve => {
        complete = resolve
      })
      inFlight.add(done)
      try {
        return await operation(input)
      } finally {
        inFlight.delete(done)
        complete()
      }
    }
  }

  const service: ModelRuntimeService = Object.freeze({
    legalTargets: guarded(reads.methods.legalTargets, unavailable),
    displayList: guarded(reads.methods.displayList, unavailable),
    effectiveModel: guarded(reads.methods.effectiveModel, unavailable),
    selectModel: guarded(reads.methods.selectModel, unavailable),
    openCall: guarded(calls.openCall, runtimeStopped),
    dispatch: guarded(dispatch.dispatch, runtimeStopped),
    dispatchAgain: guarded(dispatch.dispatchAgain, runtimeStopped),
    interrupt: guarded(control.interrupt, unavailable),
    releaseCall: guarded(control.releaseCall, unavailable),
    reconcile: guarded(reconcile.reconcile, unavailable),
    readAttempts: guarded(reads.methods.readAttempts, unavailable),
    settleReply: guarded(settleReply, unavailable),
    canDispatchAgain: guarded(reads.methods.canDispatchAgain, unavailable),
  })

  const owners = [
    ['reads', reads.close],
    ['calls', calls.close],
    ['dispatch', dispatch.close],
    ['control', control.close],
    ['reconcile', reconcile.close],
    ['store', construction.calls.close],
  ] as const
  async function closeOwners(): Promise<{ readonly released: boolean; readonly threw: boolean }> {
    const attempts = owners.map(([, close]) => {
      try {
        return close()
      } catch (error) {
        return Promise.reject(error)
      }
    })
    const outcomes = await Promise.allSettled(attempts)
    for (const [index, outcome] of outcomes.entries()) {
      if (outcome?.status !== 'rejected') continue
      try {
        construction.policy.diagnostic({
          kind: 'model_runtime.close_component_failed',
          detail: { component: owners[index]?.[0] ?? 'unknown' },
        })
      } catch {
        // Diagnostics do not settle or release the failed owner.
      }
    }
    return {
      released: outcomes.every(
        outcome => outcome.status === 'fulfilled' && 'released' in outcome.value,
      ),
      threw: outcomes.some(outcome => outcome.status === 'rejected'),
    }
  }

  async function closeOnce(): Promise<RuntimeCloseResult> {
    const first = await closeOwners()
    await Promise.allSettled([...inFlight])
    const second = await closeOwners()
    return !first.threw && !second.threw && second.released && inFlight.size === 0
      ? { released: true }
      : unavailable
  }

  function close(): Promise<RuntimeCloseResult> {
    if (released) return Promise.resolve({ released: true })
    if (closing !== undefined) return closing
    admissionClosed = true
    const attempt = closeOnce()
    closing = attempt
      .then(result => {
        if ('released' in result) released = true
        return result
      })
      .catch(() => unavailable)
      .finally(() => {
        closing = undefined
      })
    return closing
  }

  return Object.freeze({ service, close })
}
