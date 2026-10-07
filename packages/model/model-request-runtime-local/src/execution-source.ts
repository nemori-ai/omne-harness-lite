import type { CallKey, SessionRef } from '@omne-harness-lite/messages'
import type {
  AckPendingReason,
  ModelRuntimeCapturedExecution,
  ModelRuntimeExecutionCapture,
  ModelRuntimeExecutionObservation,
  ModelRuntimeExecutionSource,
  PlannedSemantics,
  SettlementLogBinding,
} from '@omne-harness-lite/model-request-runtime'
import type { CallContainer, CallContainerStore, CallContainerView } from './service-types.ts'

interface ExecutionRecord<P extends PlannedSemantics, R> {
  readonly key: CallKey
  container: CallContainer<P, R> | undefined
  witness: ModelRuntimeExecutionObservation | undefined
  pins: number
}

/** Private transfer at the physical store's synchronous acceptance boundary. */
export function retainRuntimeExecutions<P extends PlannedSemantics, R>(
  store: CallContainerStore<P, R>,
  closeConfirmed: () => boolean,
) {
  type Record = ExecutionRecord<P, R>
  const retained = new Map<string, Map<string, Set<Record>>>()
  const originals = new WeakMap<CallContainer<P, R>, Record>()
  const sealed = new Set<string>()
  const empty = Object.freeze([])
  let frames = 0
  let released = false
  const keyOf = (key: CallKey) => JSON.stringify([key.session, key.callId])

  function candidates(ref: CallKey): Set<Record> | undefined {
    return retained.get(ref.session)?.get(ref.callId)
  }

  function retain(container: CallContainer<P, R>): { record: Record; existing: boolean } {
    const original = originals.get(container)
    if (original !== undefined) return { record: original, existing: true }
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
    const record: Record = { key, container, witness: undefined, pins: 0 }
    originals.set(container, record)
    calls.add(record)
    return { record, existing: false }
  }

  function discard(record: Record): void {
    const session = retained.get(record.key.session)
    const calls = session?.get(record.key.callId)
    calls?.delete(record)
    if (calls?.size === 0) session?.delete(record.key.callId)
    if (session?.size === 0) retained.delete(record.key.session)
    if (record.container !== undefined) originals.delete(record.container)
  }

  function metadata(
    container: CallContainer<P, R>,
    view: CallContainerView<P, R>,
  ): ModelRuntimeExecutionObservation {
    return Object.freeze({
      key: Object.freeze({ ...container.key }),
      session: view.session,
      owner: view.owner,
      executionGeneration: view.executionGeneration,
      registered: store.find(container.key) === container,
      released: container.canRemove(),
      copyReleased: false,
    })
  }

  function observe(record: Record): ModelRuntimeExecutionObservation {
    if (record.witness !== undefined) return record.witness
    const container = record.container
    if (container === undefined) throw new Error('execution source lost its original')
    return metadata(container, container.view())
  }

  function sessionRecords(session: SessionRef): Record[] {
    return [...(retained.get(session)?.values() ?? [])].flatMap(calls => [...calls])
  }

  function snapshot(session: SessionRef): readonly ModelRuntimeExecutionObservation[] {
    return Object.freeze(sessionRecords(session).map(observe))
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

  function capture(session: SessionRef) {
    if (released) return { unavailable: true } as const
    // All allocations and original reads precede publication of any pin.
    let pinned: Record[] = []
    let executions: readonly ModelRuntimeCapturedExecution[] = Object.freeze(
      sessionRecords(session).map(record => {
        const container = record.container
        if (container === undefined || sealed.has(keyOf(record.key))) return observe(record)
        const view = container.view()
        pinned.push(record)
        return Object.freeze({
          ...metadata(container, view),
          ...(view.invocation === undefined ? {} : { invocation: view.invocation }),
        })
      }),
    )
    let frameReleased = false
    const frame = Object.freeze<ModelRuntimeExecutionCapture>({
      get executions() {
        return executions
      },
      release() {
        if (frameReleased) return
        frameReleased = true
        executions = empty
        for (const record of pinned) record.pins--
        pinned = []
        frames--
      },
    })
    for (const record of pinned) record.pins++
    frames++
    return { capture: frame }
  }

  /** Called only by this factory's custody after original durable ACK confirmation. */
  function stopCapture(ref: CallKey): void {
    sealed.add(keyOf(ref))
  }

  function copyObstacle(
    record: Record,
    binding: SettlementLogBinding,
  ): AckPendingReason | undefined {
    const observation = observe(record)
    if (observation.session.log !== binding) return 'receipt_unknown'
    if (!observation.released || observation.registered) return 'writer_in_flight'
    if (record.pins !== 0) return 'external_retention'
    return undefined
  }

  function releaseCopies(binding: SettlementLogBinding, ref: CallKey): readonly AckPendingReason[] {
    const records = [...(candidates(ref) ?? [])]
    const obstacles = records.flatMap(record => {
      const reason = copyObstacle(record, binding)
      return reason === undefined ? [] : [reason]
    })
    if (obstacles.length !== 0) return [...new Set(obstacles)]
    // Prepare all small witnesses before erasing any original private copy.
    const witnesses = records.map(record => ({
      record,
      witness: Object.freeze({ ...observe(record), copyReleased: true }),
    }))
    for (const { record, witness } of witnesses) {
      record.witness = witness
      record.container = undefined
    }
    return []
  }

  const calls = Object.freeze<CallContainerStore<P, R>>({
    find: key => store.find(key),
    reserve: key => store.reserve(key),
    waitReserve: (key, input) => store.waitReserve(key, input),
    insert(reservation, prepared) {
      // A thrown insert keeps the original candidate, even if its return was lost.
      const held = retain(prepared)
      const accepted = store.insert(reservation, prepared)
      if (!accepted && !held.existing) discard(held.record)
      return accepted
    },
    remove: reservation => store.remove(reservation),
    close: () => store.close(),
  })
  const source: ModelRuntimeExecutionSource = Object.freeze({
    lookup,
    snapshot,
    capture,
    release() {
      if (!closeConfirmed() || frames !== 0) return { unavailable: true } as const
      retained.clear()
      sealed.clear()
      released = true
      return { released: true } as const
    },
  })
  return Object.freeze({
    calls,
    source,
    runtimeCopies: Object.freeze({ stopCapture, releaseCopies }),
  })
}
