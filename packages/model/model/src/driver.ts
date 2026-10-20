import { randomUUID } from 'node:crypto'
import { tenantCodec } from '@omne-harness/legal-identity'
import {
  decodeDispatchId,
  decodeOutputCursor,
  type ModelCommands,
  type ModelDriver,
  type ModelDriveInput,
  type ModelFailure,
  type ModelInstanceHost,
  type ModelClock,
  type ModelSendBoundary,
  type SendDemand,
  type Publication,
  type ExecutionRef,
  type Termination,
  type Reply,
} from '@omne-harness/model-contract'
import { createObservation } from './observation.ts'
import { createReceiver, newOperation, type TerminalCompetition } from './receive.ts'

type Prepare = Parameters<ModelCommands<unknown>['prepareDispatch']>[0]
type Settle = Parameters<ModelCommands<unknown>['settle']>[0]
type Receiver<P> = ReturnType<typeof createReceiver<P>>
type Finishing<P> = {
  kind: 'finish'
  execution: ExecutionRef
  receiver: Receiver<P> | null
  termination: Termination | null
  receiveFailure: ModelFailure | null
  settlement:
    | { kind: 'ready' }
    | { kind: 'write'; input: Settle; pending: boolean }
    | { kind: 'confirmed' }
}
type Stage<P> =
  | { kind: 'idle' }
  | { kind: 'prepare'; input: Prepare; pending: boolean }
  | { kind: 'send'; demand: SendDemand<P> }
  | { kind: 'receive'; receiver: Receiver<P>; execution: ExecutionRef }
  | Finishing<P>
  | { kind: 'done' }
  | { kind: 'failed'; failure: ModelFailure }
type Activity<P> = {
  claim: ModelDriveInput<P>
  view: ReturnType<typeof createObservation<P>>
  publication: Publication
  stage: Stage<P>
}
const blocked = (diagnostic: string) => ({
  failure: { kind: 'unavailable', dependency: 'model-runtime', diagnostic } as const,
})
function generated<T>(value: { ok: T } | { failure: unknown }): T {
  if ('ok' in value) return value.ok
  throw new Error('invalid generated Model identity')
}
export function createModelDriver<P>(
  commands: ModelCommands<P>,
  instances: ModelInstanceHost<P>,
  clock: ModelClock,
  configuration: {
    observerBufferBytes: number
    observerCheckIntervalMs: number
    outputBatchBytes: number
    outputBatchDelayMs: number
  },
  send: ModelSendBoundary<P>,
) {
  const activities = new Map<string, Activity<P>>()
  const running = new Set<string>()
  const refreshes = new Map<string, { requested: boolean; completion: Promise<void> }>()
  function keyOf(input: Pick<ModelDriveInput<P>, 'tenant' | 'call'>) {
    const tenant = tenantCodec.encode(input.tenant)
    return tenant.ok ? JSON.stringify([tenant.value, input.call]) : null
  }
  async function refresh(input: Pick<ModelDriveInput<P>, 'tenant' | 'call'>) {
    const key = keyOf(input)
    const active = key && activities.get(key)
    if (!active) return
    const epoch = active.view.epoch()
    const current = await commands.loadRecovery(active.claim)
    if ('ok' in current) active.view.refresh(current.ok.state, epoch)
  }
  function refreshProjection(input: Pick<ModelDriveInput<P>, 'tenant' | 'call'>) {
    requestRefresh(input, 'receive')
  }
  function requestRefresh(
    input: Pick<ModelDriveInput<P>, 'tenant' | 'call'>,
    source: 'control' | 'receive' = 'control',
  ) {
    const callKey = keyOf(input)
    if (!callKey) return
    const key = JSON.stringify([callKey, source])
    const pending = refreshes.get(key)
    if (pending) {
      pending.requested = true
      return
    }
    const work = { requested: true, completion: Promise.resolve() }
    refreshes.set(key, work)
    work.completion = (async () => {
      try {
        while (work.requested) {
          work.requested = false
          try {
            await refresh(input)
          } catch {
            /* Confirmed writes survive an unavailable projection read. */
          }
        }
      } finally {
        refreshes.delete(key)
      }
    })()
  }
  async function settle(
    active: Activity<P>,
    entry: Finishing<P>,
    competition: TerminalCompetition,
  ): Reply<void> {
    if (!entry.termination) return blocked('original-terminal-control-unavailable')
    while (entry.settlement.kind !== 'confirmed') {
      if (entry.settlement.kind === 'ready') {
        const current = await commands.loadRecovery(active.claim)
        if ('failure' in current) return current
        if (current.ok.state.phase === 'settled') {
          entry.settlement = { kind: 'confirmed' }
          break
        }
        if (
          current.ok.execution?.instance !== entry.execution.instance ||
          current.ok.execution.generation !== entry.execution.generation
        )
          return blocked('pending-settle-generation-changed')
        entry.settlement = {
          kind: 'write',
          pending: false,
          input: {
            ...entry.execution,
            operation: newOperation(),
            expected: current.ok.state.revision,
            termination: entry.termination,
          },
        }
      }
      const write = entry.settlement
      let committed = false
      if (write.pending) {
        const known = await commands.query({ ...active.claim, operation: write.input.operation })
        if ('failure' in known) return known
        if (known.ok.kind === 'unknown')
          return { failure: { kind: 'commit-unknown', operation: write.input.operation } }
        committed = known.ok.kind === 'committed'
      }
      write.pending = true
      const result = await commands.settle(write.input)
      if ('ok' in result) {
        // Fix the confirmed phase before an optional projection read can fail.
        entry.settlement = { kind: 'confirmed' }
        refreshProjection(active.claim)
        break
      }
      if (
        committed ||
        result.failure.kind !== 'conflict' ||
        result.failure.operation !== write.input.operation ||
        result.failure.revision === write.input.expected
      )
        return result
      const known = await commands.query({ ...active.claim, operation: write.input.operation })
      if ('failure' in known) return known
      if (known.ok.kind === 'unknown')
        return { failure: { kind: 'commit-unknown', operation: write.input.operation } }
      if (known.ok.kind === 'committed') return result
      const current = await commands.loadRecovery(active.claim)
      if ('failure' in current) return current
      if (current.ok.state.phase === 'settled') {
        entry.settlement = { kind: 'confirmed' }
        refreshProjection(active.claim)
        break
      }
      if (
        competition.replaced ||
        current.ok.execution?.instance !== write.input.instance ||
        current.ok.execution.generation !== write.input.generation
      )
        return result
      competition.replaced = true
      entry.settlement = {
        kind: 'write',
        pending: false,
        input: { ...write.input, operation: newOperation(), expected: current.ok.state.revision },
      }
    }
    return { ok: undefined }
  }
  async function finish(
    active: Activity<P>,
    entry: Finishing<P>,
    competition: TerminalCompetition,
  ): Reply<void> {
    // Start releasing the sole stream, but let settlement progress independently.
    const releasing = entry.receiver?.release() ?? Promise.resolve({ ok: undefined })
    let result: Awaited<Reply<void>>
    try {
      result = await settle(active, entry, competition)
    } catch {
      result = blocked('settle-unconfirmed')
    }
    const released = await releasing
    if ('failure' in result) return result
    if ('failure' in released) return released
    return entry.receiveFailure ? { failure: entry.receiveFailure } : { ok: undefined }
  }
  const driver: ModelDriver<P> = {
    async drive(original, signal) {
      const { principal, tenant, call, instance, operation, continuity } = original
      const input = {
        principal,
        tenant,
        ...structuredClone({ call, instance, operation, continuity }),
      }
      if (signal.aborted) return { ok: undefined }
      const key = keyOf(input)
      if (!key) return { failure: { kind: 'denied', action: 'tenant' } }
      try {
        const initial = await commands.loadRecovery(input)
        if ('failure' in initial) return initial
        if (signal.aborted) return { ok: undefined }
        if (running.has(key)) return blocked('drive-already-running')
        running.add(key)
        try {
          const competition: TerminalCompetition = { replaced: false }
          let active = activities.get(key)
          const previous = active
          if (
            previous &&
            previous.stage.kind !== 'idle' &&
            previous.stage.kind !== 'done' &&
            previous.stage.kind !== 'failed' &&
            (previous.claim.operation !== input.operation ||
              previous.claim.instance !== input.instance ||
              (['owner', 'record', 'revision', 'digest'] as const).some(
                field => previous.claim.continuity[field] !== input.continuity[field],
              ))
          )
            return blocked('pending-work-requires-original-claim')
          // Each owner replays its own fixed write. Sender-private operations must reach sender.
          for (const unresolved of initial.ok.unresolved) {
            const owned =
              unresolved === input.operation ||
              (active?.stage.kind === 'prepare' && unresolved === active.stage.input.operation) ||
              active?.stage.kind === 'send' ||
              (active?.stage.kind === 'receive' &&
                unresolved === active.stage.receiver.pendingOperation()) ||
              (active?.stage.kind === 'finish' &&
                active.stage.settlement.kind === 'write' &&
                unresolved === active.stage.settlement.input.operation)
            if (owned) continue
            const known = await commands.query({ ...input, operation: unresolved })
            if ('failure' in known) return known
            if (known.ok.kind === 'unknown')
              return { failure: { kind: 'commit-unknown', operation: unresolved } }
            return blocked('unresolved-operation-without-original-input')
          }
          const execution = await commands.claim(input)
          if ('failure' in execution) return execution
          if (signal.aborted) return { ok: undefined }
          const recovery = await commands.loadRecovery(input)
          if ('failure' in recovery) return recovery
          const records = await commands.dispatches(input)
          if ('failure' in records) return records
          if (!active || active.view.handle.instance !== input.instance) {
            const view = createObservation({
              access: input,
              instance: input.instance,
              directory: instances.directory,
              clock,
              bufferBytes: configuration.observerBufferBytes,
              checkIntervalMs: configuration.observerCheckIntervalMs,
              initial:
                !records.ok.length && !recovery.ok.unresolved.length
                  ? {
                      call,
                      cursor: generated(decodeOutputCursor('0')),
                      blocks: [],
                      state: recovery.ok.state,
                    }
                  : null,
            })
            const published = await instances.publish(execution.ok, view.handle)
            if ('failure' in published) return published
            active = {
              claim: input,
              view,
              publication: published.ok,
              stage: records.ok.length ? { kind: 'done' } : { kind: 'idle' },
            }
            activities.set(key, active)
          }
          if (active.stage.kind === 'idle') {
            if (records.ok.length || recovery.ok.state.phase === 'settled') return { ok: undefined }
            if (recovery.ok.state.control.kind === 'requested')
              active.stage = {
                kind: 'finish',
                execution: execution.ok,
                receiver: null,
                termination: { kind: 'interrupted', control: recovery.ok.state.control.operation },
                receiveFailure: null,
                settlement: { kind: 'ready' },
              }
            else
              active.stage = {
                kind: 'prepare',
                pending: false,
                input: {
                  ...execution.ok,
                  expected: recovery.ok.state.revision,
                  operation: newOperation(),
                  dispatch: generated(decodeDispatchId(`mdisp_${randomUUID()}`)),
                  supplier: structuredClone(recovery.ok.request.suppliers[0]),
                  policyDecision: null,
                },
              }
          }
          if (active.stage.kind === 'prepare') {
            const entry = active.stage
            if (execution.ok.generation !== entry.input.generation)
              return blocked('pending-prepare-generation-changed')
            let committed = false
            if (entry.pending) {
              const known = await commands.query({ ...input, operation: entry.input.operation })
              if ('failure' in known) return known
              committed = known.ok.kind === 'committed'
              if (known.ok.kind === 'unknown')
                return { failure: { kind: 'commit-unknown', operation: entry.input.operation } }
            }
            entry.pending = true
            const prepared = await commands.prepareDispatch(entry.input)
            if ('failure' in prepared) {
              if (!committed && definitelyRefused(prepared.failure)) active.stage = { kind: 'idle' }
              return prepared
            }
            active.stage = {
              kind: 'send',
              demand: {
                principal,
                tenant,
                call,
                execution: execution.ok,
                dispatch: entry.input.dispatch,
                request: recovery.ok.request,
                supplier: entry.input.supplier,
                consumer: recovery.ok.state.consumer,
                initiator: recovery.ok.initiator,
              },
            }
            refreshProjection(input)
          }
          if (active.stage.kind === 'send') {
            const demand = active.stage.demand
            const sent = await send.send(demand, signal)
            if (sent.kind === 'unknown') {
              refreshProjection(input)
              return blocked(sent.diagnostic)
            }
            if (sent.kind === 'not-started') {
              active.stage = { kind: 'failed', failure: sent.failure }
              refreshProjection(input)
              return { failure: sent.failure }
            }
            const view = active.view
            active.stage = {
              kind: 'receive',
              execution: demand.execution,
              receiver: createReceiver({
                commands,
                clock,
                demand,
                window: sent.window,
                facts: sent.facts,
                batchBytes: configuration.outputBatchBytes,
                batchDelayMs: configuration.outputBatchDelayMs,
                beginContent: () => view.beginContent(),
                rejectContent: () => view.rejectContent(),
                confirm: snapshot => view.confirm(snapshot),
                refresh: () => refreshProjection(input),
              }),
            }
            refreshProjection(input)
          }
          if (active.stage.kind === 'receive') {
            const entry = active.stage
            const received = await entry.receiver.run(signal, competition)
            if ('failure' in received) return received
            if (!received.ok) return { ok: undefined }
            active.stage = {
              kind: 'finish',
              execution: entry.execution,
              receiver: entry.receiver,
              termination: received.ok.termination,
              receiveFailure: received.ok.failure,
              settlement: { kind: 'ready' },
            }
          }
          if (active.stage.kind === 'finish') return await finish(active, active.stage, competition)
          if (active.stage.kind === 'failed') return { failure: active.stage.failure }
          return { ok: undefined }
        } finally {
          running.delete(key)
        }
      } catch {
        return blocked('drive-unconfirmed')
      }
    },
  }
  return { driver, requestRefresh }
}
function definitelyRefused(failure: ModelFailure): boolean {
  return failure.kind !== 'commit-unknown' && failure.kind !== 'unavailable'
}
