import type { CallKey, SessionRef } from '@omne-harness-lite/messages'
import type {
  ModelRuntimeExecutionObservation,
  ModelRuntimeExecutionSource,
  PlannedSemantics,
} from '@omne-harness-lite/model-request-runtime'
import type { CallContainer, CallContainerStore } from './service-types.ts'

/** Private transfer at the physical store's synchronous acceptance boundary. */
export function retainRuntimeExecutions<P extends PlannedSemantics, R>(
  store: CallContainerStore<P, R>,
  closeConfirmed: () => boolean,
): { readonly calls: CallContainerStore<P, R>; readonly source: ModelRuntimeExecutionSource } {
  const retained = new Map<string, Map<string, Set<CallContainer<P, R>>>>()

  function candidates(ref: CallKey): Set<CallContainer<P, R>> | undefined {
    return retained.get(ref.session)?.get(ref.callId)
  }

  function retain(container: CallContainer<P, R>): boolean {
    const key = container.key
    let session = retained.get(key.session)
    if (session === undefined) {
      session = new Map()
      retained.set(key.session, session)
    }
    let calls = session.get(key.callId)
    if (calls === undefined) {
      calls = new Set()
      session.set(key.callId, calls)
    }
    const existing = calls.has(container)
    calls.add(container)
    return existing
  }

  function discard(container: CallContainer<P, R>): void {
    const key = container.key
    const session = retained.get(key.session)
    const calls = session?.get(key.callId)
    calls?.delete(container)
    if (calls?.size === 0) session?.delete(key.callId)
    if (session?.size === 0) retained.delete(key.session)
  }

  function observe(container: CallContainer<P, R>): ModelRuntimeExecutionObservation {
    const view = container.view()
    return Object.freeze({
      key: Object.freeze({ ...container.key }),
      session: view.session,
      owner: view.owner,
      executionGeneration: view.executionGeneration,
      ...(view.invocation === undefined ? {} : { invocation: view.invocation }),
      registered: store.find(container.key) === container,
      released: container.canRemove(),
    })
  }

  function snapshot(session: SessionRef): readonly ModelRuntimeExecutionObservation[] {
    return Object.freeze(
      [...(retained.get(session)?.values() ?? [])].flatMap(calls => [...calls].map(observe)),
    )
  }

  function lookup(ref: CallKey, generation?: object) {
    const records = [...(candidates(ref) ?? [])].map(observe)
    const generations = new Set(records.map(record => record.executionGeneration))
    const registered = records.filter(record => record.registered)
    if (generations.size !== records.length || registered.length > 1)
      return { unknown: true } as const
    const selected =
      generation !== undefined
        ? records.filter(record => record.executionGeneration === generation)
        : registered.length === 1
          ? registered
          : records
    const execution = selected.length === 1 ? selected[0] : undefined
    return execution === undefined ? ({ unknown: true } as const) : { execution }
  }

  const calls = Object.freeze<CallContainerStore<P, R>>({
    find: key => store.find(key),
    reserve: key => store.reserve(key),
    waitReserve: (key, input) => store.waitReserve(key, input),
    insert(reservation, prepared) {
      // Allocation happens before acceptance. A thrown insert keeps its original candidate.
      const existing = retain(prepared)
      const accepted = store.insert(reservation, prepared)
      if (!accepted && !existing) discard(prepared)
      return accepted
    },
    remove: reservation => store.remove(reservation),
    close: () => store.close(),
  })
  const source: ModelRuntimeExecutionSource = Object.freeze({
    lookup,
    snapshot,
    release() {
      if (!closeConfirmed()) return { unavailable: true } as const
      retained.clear()
      return { released: true } as const
    },
  })
  return Object.freeze({ calls, source })
}
