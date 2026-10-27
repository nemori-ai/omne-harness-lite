import { randomUUID } from 'node:crypto'
import { tenantCodec } from '@omne-harness/legal-identity'
import {
  decodeDispatchId,
  decodeOutputCursor,
  type ModelFailure,
  type Termination,
  type Reply,
} from '@omne-harness/model-contract'
import {
  type ModelCommands,
  type ModelDriver,
  type ModelDriveInput,
  type ModelInstanceHost,
  type ModelClock,
  type ModelSendBoundary,
  type SendDemand,
  type Publication,
  type ExecutionRef,
} from '@omne-harness/model-contract/provider'
import { createObservation } from './observation.ts'
import { createReceiver, newOperation, type TerminalCompetition } from './receive.ts'

type Prepare = Parameters<ModelCommands<unknown>['prepareDispatch']>[0]
type Settle = Parameters<ModelCommands<unknown>['settle']>[0]
type Receiver<P> = ReturnType<typeof createReceiver<P>>
type Recovery<P> = Extract<
  Awaited<ReturnType<ModelCommands<P>['loadRecovery']>>,
  { ok: unknown }
>['ok']
type SettlementWrite<P> = Extract<Finishing<P>['settlement'], { kind: 'write' }>
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
  async function prepareSettlement(
    active: Activity<P>,
    entry: Finishing<P>,
    termination: Termination,
  ): Reply<void> {
    const current = await commands.loadRecovery(active.claim)
    if ('failure' in current) return current
    if (current.ok.state.phase === 'settled') {
      entry.settlement = { kind: 'confirmed' }
      return { ok: undefined }
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
        termination,
      },
    }
    return { ok: undefined }
  }
  async function replaceSettlement(
    active: Activity<P>,
    entry: Finishing<P>,
    write: SettlementWrite<P>,
    result: { failure: ModelFailure },
    competition: TerminalCompetition,
  ): Reply<void> {
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
      return { ok: undefined }
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
    return { ok: undefined }
  }
  async function writeSettlement(
    active: Activity<P>,
    entry: Finishing<P>,
    write: SettlementWrite<P>,
    competition: TerminalCompetition,
  ): Reply<void> {
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
      return { ok: undefined }
    }
    if (
      committed ||
      result.failure.kind !== 'conflict' ||
      result.failure.operation !== write.input.operation ||
      result.failure.revision === write.input.expected
    )
      return result
    return replaceSettlement(active, entry, write, result, competition)
  }
  async function settle(
    active: Activity<P>,
    entry: Finishing<P>,
    competition: TerminalCompetition,
  ): Reply<void> {
    if (!entry.termination) return blocked('original-terminal-control-unavailable')
    while (entry.settlement.kind !== 'confirmed') {
      const result =
        entry.settlement.kind === 'ready'
          ? await prepareSettlement(active, entry, entry.termination)
          : await writeSettlement(active, entry, entry.settlement, competition)
      if ('failure' in result) return result
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
  function requiresOriginalClaim(
    previous: Activity<P> | undefined,
    input: ModelDriveInput<P>,
  ): boolean {
    return (
      previous !== undefined &&
      previous.stage.kind !== 'idle' &&
      previous.stage.kind !== 'done' &&
      previous.stage.kind !== 'failed' &&
      (previous.claim.operation !== input.operation ||
        previous.claim.instance !== input.instance ||
        (['owner', 'record', 'revision', 'digest'] as const).some(
          field => previous.claim.continuity[field] !== input.continuity[field],
        ))
    )
  }
  function ownsOperation(
    active: Activity<P> | undefined,
    input: ModelDriveInput<P>,
    unresolved: Recovery<P>['unresolved'][number],
  ): boolean {
    return (
      unresolved === input.operation ||
      (active?.stage.kind === 'prepare' && unresolved === active.stage.input.operation) ||
      active?.stage.kind === 'send' ||
      (active?.stage.kind === 'receive' &&
        unresolved === active.stage.receiver.pendingOperation()) ||
      (active?.stage.kind === 'finish' &&
        active.stage.settlement.kind === 'write' &&
        unresolved === active.stage.settlement.input.operation)
    )
  }
  async function recoverUnowned(
    active: Activity<P> | undefined,
    input: ModelDriveInput<P>,
    operations: Recovery<P>['unresolved'],
  ): Reply<void> {
    // Each owner replays its own fixed write. Sender-private operations must reach sender.
    for (const unresolved of operations) {
      if (ownsOperation(active, input, unresolved)) continue
      const known = await commands.query({ ...input, operation: unresolved })
      if ('failure' in known) return known
      if (known.ok.kind === 'unknown')
        return { failure: { kind: 'commit-unknown', operation: unresolved } }
      return blocked('unresolved-operation-without-original-input')
    }
    return { ok: undefined }
  }
  function beginActivity(
    active: Activity<P>,
    execution: ExecutionRef,
    recovery: Recovery<P>,
  ): void {
    if (recovery.state.control.kind === 'requested')
      active.stage = {
        kind: 'finish',
        execution,
        receiver: null,
        termination: { kind: 'interrupted', control: recovery.state.control.operation },
        receiveFailure: null,
        settlement: { kind: 'ready' },
      }
    else
      active.stage = {
        kind: 'prepare',
        pending: false,
        input: {
          ...execution,
          expected: recovery.state.revision,
          operation: newOperation(),
          dispatch: generated(decodeDispatchId(`mdisp_${randomUUID()}`)),
          supplier: structuredClone(recovery.request.suppliers[0]),
          policyDecision: null,
        },
      }
  }
  async function publishActivity(
    key: string,
    input: ModelDriveInput<P>,
    execution: ExecutionRef,
    recovery: Recovery<P>,
    hasDispatches: boolean,
  ): Reply<Activity<P>> {
    const view = createObservation({
      access: input,
      instance: input.instance,
      directory: instances.directory,
      clock,
      bufferBytes: configuration.observerBufferBytes,
      checkIntervalMs: configuration.observerCheckIntervalMs,
      initial:
        !hasDispatches && !recovery.unresolved.length
          ? {
              call: input.call,
              cursor: generated(decodeOutputCursor('0')),
              blocks: [],
              state: recovery.state,
            }
          : null,
    })
    const published = await instances.publish(execution, view.handle)
    if ('failure' in published) return published
    const active: Activity<P> = {
      claim: input,
      view,
      publication: published.ok,
      stage: hasDispatches ? { kind: 'done' } : { kind: 'idle' },
    }
    activities.set(key, active)
    return { ok: active }
  }
  async function restoreActivity(
    input: ModelDriveInput<P>,
    execution: ExecutionRef,
    key: string,
    active: Activity<P> | undefined,
  ): Reply<{ active: Activity<P>; recovery: Recovery<P> } | null> {
    const recovery = await commands.loadRecovery(input)
    if ('failure' in recovery) return recovery
    const records = await commands.dispatches(input)
    if ('failure' in records) return records
    if (!active || active.view.handle.instance !== input.instance) {
      const published = await publishActivity(
        key,
        input,
        execution,
        recovery.ok,
        records.ok.length > 0,
      )
      if ('failure' in published) return published
      active = published.ok
    }
    if (active.stage.kind === 'idle') {
      if (records.ok.length || recovery.ok.state.phase === 'settled') return { ok: null }
      beginActivity(active, execution, recovery.ok)
    }
    return { ok: { active, recovery: recovery.ok } }
  }
  async function prepareDispatch(
    active: Activity<P>,
    entry: Extract<Stage<P>, { kind: 'prepare' }>,
    input: ModelDriveInput<P>,
    execution: ExecutionRef,
    recovery: Recovery<P>,
  ): Reply<void> {
    if (execution.generation !== entry.input.generation)
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
        principal: input.principal,
        tenant: input.tenant,
        call: input.call,
        execution,
        dispatch: entry.input.dispatch,
        request: recovery.request,
        supplier: entry.input.supplier,
        consumer: recovery.state.consumer,
        initiator: recovery.initiator,
      },
    }
    refreshProjection(input)
    return { ok: undefined }
  }
  async function sendDispatch(
    active: Activity<P>,
    demand: SendDemand<P>,
    input: ModelDriveInput<P>,
    signal: AbortSignal,
  ): Reply<void> {
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
    return { ok: undefined }
  }
  async function receiveDispatch(
    active: Activity<P>,
    entry: Extract<Stage<P>, { kind: 'receive' }>,
    signal: AbortSignal,
    competition: TerminalCompetition,
  ): Reply<boolean> {
    const received = await entry.receiver.run(signal, competition)
    if ('failure' in received) return received
    if (!received.ok) return { ok: false }
    active.stage = {
      kind: 'finish',
      execution: entry.execution,
      receiver: entry.receiver,
      termination: received.ok.termination,
      receiveFailure: received.ok.failure,
      settlement: { kind: 'ready' },
    }
    return { ok: true }
  }
  async function runStages(
    active: Activity<P>,
    input: ModelDriveInput<P>,
    execution: ExecutionRef,
    recovery: Recovery<P>,
    signal: AbortSignal,
    competition: TerminalCompetition,
  ): Reply<void> {
    if (active.stage.kind === 'prepare') {
      const prepared = await prepareDispatch(active, active.stage, input, execution, recovery)
      if ('failure' in prepared) return prepared
    }
    if (active.stage.kind === 'send') {
      const sent = await sendDispatch(active, active.stage.demand, input, signal)
      if ('failure' in sent) return sent
    }
    if (active.stage.kind === 'receive') {
      const received = await receiveDispatch(active, active.stage, signal, competition)
      if ('failure' in received) return received
      if (!received.ok) return { ok: undefined }
    }
    if (active.stage.kind === 'finish') return finish(active, active.stage, competition)
    if (active.stage.kind === 'failed') return { failure: active.stage.failure }
    return { ok: undefined }
  }
  async function resume(
    input: ModelDriveInput<P>,
    initial: Recovery<P>,
    key: string,
    signal: AbortSignal,
    competition: TerminalCompetition,
  ): Reply<void> {
    const previous = activities.get(key)
    if (requiresOriginalClaim(previous, input))
      return blocked('pending-work-requires-original-claim')
    const recovered = await recoverUnowned(previous, input, initial.unresolved)
    if ('failure' in recovered) return recovered
    const execution = await commands.claim(input)
    if ('failure' in execution) return execution
    if (signal.aborted) return { ok: undefined }
    const restored = await restoreActivity(input, execution.ok, key, previous)
    if ('failure' in restored) return restored
    if (!restored.ok) return { ok: undefined }
    return runStages(
      restored.ok.active,
      input,
      execution.ok,
      restored.ok.recovery,
      signal,
      competition,
    )
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
          return await resume(input, initial.ok, key, signal, competition)
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
