import { randomUUID } from 'node:crypto'
import { tenantCodec } from '@omne-harness/legal-identity'
import {
  decodeDispatchId,
  decodeOutputCursor,
  type DispatchRecord,
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
  type ModelRetryPolicy,
  type SendDemand,
  type Publication,
  type ExecutionRef,
} from '@omne-harness/model-contract/provider'
import { createObservation } from './observation.ts'
import { executionFailure, verdictOf } from './commands/execution-write.ts'
import { createReceiver, newOperation, type TerminalCompetition } from './receive.ts'
import { createRetryStage } from './retry-stage.ts'

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
  driveFailure: ModelFailure | null
  // False while the retry policy may still decide how the failed dispatch ends.
  resolved: boolean
  settlement:
    | { kind: 'ready' }
    | { kind: 'write'; input: Settle; pending: boolean }
    | { kind: 'confirmed' }
}
type Stage<P> =
  | { kind: 'idle' }
  | { kind: 'prepare'; input: Prepare; pending: boolean }
  | { kind: 'send'; demand: SendDemand<P> }
  | { kind: 'not-sent'; demand: SendDemand<P>; refusal: ModelFailure }
  | { kind: 'unsent'; demand: SendDemand<P> }
  | { kind: 'receive'; receiver: Receiver<P>; execution: ExecutionRef }
  | Finishing<P>
  | { kind: 'done' }
  | { kind: 'failed'; failure: ModelFailure }
type Activity<P> = {
  claim: ModelDriveInput<P>
  view: ReturnType<typeof createObservation<P>>
  publication: Publication
  stage: Stage<P>
  spent: Receiver<P>[]
}

const RUNTIME_LOST: Termination = {
  kind: 'failed',
  fault: {
    cause: 'runtime-lost',
    diagnostic: 'transport-gone-with-its-process',
    upstreamStatus: null,
  },
}
const blocked = (diagnostic: string) => ({
  failure: { kind: 'unavailable', dependency: 'model-runtime', diagnostic } as const,
})
function generated<T>(value: { ok: T } | { failure: unknown }): T {
  if ('ok' in value) return value.ok
  throw new Error('invalid generated Model identity')
}
function requiresOriginalClaim<P>(
  previous: Activity<P> | undefined,
  input: ModelDriveInput<P>,
): boolean {
  return (
    previous !== undefined &&
    previous.stage.kind !== 'idle' &&
    previous.stage.kind !== 'unsent' &&
    previous.stage.kind !== 'done' &&
    previous.stage.kind !== 'failed' &&
    (previous.claim.operation !== input.operation ||
      previous.claim.instance !== input.instance ||
      (['owner', 'record', 'revision', 'digest'] as const).some(
        field => previous.claim.continuity[field] !== input.continuity[field],
      ))
  )
}
function ownsOperation<P>(
  active: Activity<P> | undefined,
  input: ModelDriveInput<P>,
  unresolved: Recovery<P>['unresolved'][number],
): boolean {
  return (
    unresolved === input.operation ||
    (active?.stage.kind === 'prepare' && unresolved === active.stage.input.operation) ||
    active?.stage.kind === 'send' ||
    (active?.stage.kind === 'receive' && unresolved === active.stage.receiver.pendingOperation()) ||
    (active?.stage.kind === 'finish' &&
      active.stage.settlement.kind === 'write' &&
      unresolved === active.stage.settlement.input.operation)
  )
}
function beginActivity<P>(
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
      driveFailure: null,
      resolved: true,
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
function keyOf<P>(input: Pick<ModelDriveInput<P>, 'tenant' | 'call'>) {
  const tenant = tenantCodec.encode(input.tenant)
  return tenant.ok ? JSON.stringify([tenant.value, input.call]) : null
}
// A process that never drove the call takes it up from its last dispatch: one the store holds
// ended is concluded; one that may have gone out lost its transport; one never materialized is sent.
async function resumedStage<P>(
  commands: ModelCommands<P>,
  input: ModelDriveInput<P>,
  execution: ExecutionRef,
  recovery: Recovery<P>,
  latest: DispatchRecord,
): Reply<Stage<P>> {
  const ending = recovery.logicalTerminal
  if (ending !== null || latest.materialization !== null)
    return {
      ok: {
        kind: 'finish',
        execution,
        receiver: null,
        termination: ending ?? RUNTIME_LOST,
        driveFailure: null,
        resolved: ending === null,
        settlement: { kind: 'ready' },
      },
    }
  const request = await commands.loadRequest(input)
  if ('failure' in request) return request
  return {
    ok: {
      kind: 'send',
      demand: {
        principal: input.principal,
        tenant: input.tenant,
        call: input.call,
        execution,
        dispatch: latest.dispatch,
        request: request.ok,
        supplier: latest.supplier,
        consumer: recovery.state.consumer,
        initiator: recovery.initiator,
      },
    },
  }
}
async function notSentTerminal<P>(
  commands: ModelCommands<P>,
  demand: SendDemand<P>,
): Reply<Termination | null> {
  try {
    const records = await commands.dispatches(demand)
    if ('failure' in records) return records
    const record = records.ok.find(item => item.dispatch === demand.dispatch)
    return {
      ok:
        record?.send === 'not-sent' && record.terminal?.kind === 'failed' ? record.terminal : null,
    }
  } catch {
    return blocked('dispatch-record-unconfirmed')
  }
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
  retry: ModelRetryPolicy<P>,
) {
  const activities = new Map<string, Activity<P>>()
  const running = new Set<string>()
  const open = new Set<string>()
  const refreshes = new Map<string, { requested: boolean; completion: Promise<void> }>()
  const retryStep = createRetryStage({ commands, retry, clock, instances })
  function admitted(input: Pick<ModelDriveInput<P>, 'tenant' | 'call'>) {
    const key = keyOf(input)
    if (key) open.add(key)
  }
  function ended(input: Pick<ModelDriveInput<P>, 'tenant' | 'call'>) {
    const key = keyOf(input)
    if (key) open.delete(key)
  }
  function counts(): Readonly<{ pending: number; running: number }> {
    let pending = 0
    for (const key of open) if (!running.has(key)) pending++
    return { pending, running: running.size }
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
          } catch {}
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
    ended(active.claim)
    return { ok: undefined }
  }
  async function finish(
    active: Activity<P>,
    entry: Finishing<P>,
    competition: TerminalCompetition,
  ): Reply<void> {
    const releasing = Promise.all(
      [...active.spent, entry.receiver].map(receiver => receiver?.release() ?? { ok: undefined }),
    )
    let result: Awaited<Reply<void>>
    try {
      result = await settle(active, entry, competition)
    } catch {
      result = blocked('settle-unconfirmed')
    }
    const unreleased = (await releasing).find(released => 'failure' in released)
    if ('failure' in result) return result
    if (unreleased !== undefined) return unreleased
    active.stage = entry.driveFailure
      ? { kind: 'failed', failure: entry.driveFailure }
      : { kind: 'done' }
    return entry.driveFailure ? { failure: entry.driveFailure } : { ok: undefined }
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
      spent: [],
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
    if (!active && recovery.ok.state.phase === 'settled') return { ok: null }
    const records = await commands.dispatches(input)
    if ('failure' in records) return records
    const fresh = active === undefined
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
      const latest = records.ok.at(-1)
      if (fresh && latest !== undefined && recovery.ok.state.phase !== 'settled') {
        const resumed = await resumedStage(commands, input, execution, recovery.ok, latest)
        if ('failure' in resumed) return resumed
        active.stage = resumed.ok
      }
    }
    if (recovery.ok.state.phase === 'settled') ended(input)
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
    if ('failure' in prepared)
      return committed ? prepared : refusePrepare(active, execution, prepared)
    const request = await commands.loadRequest(input)
    if ('failure' in request) return request
    active.stage = {
      kind: 'send',
      demand: {
        principal: input.principal,
        tenant: input.tenant,
        call: input.call,
        execution,
        dispatch: entry.input.dispatch,
        request: request.ok,
        supplier: entry.input.supplier,
        consumer: recovery.state.consumer,
        initiator: recovery.initiator,
      },
    }
    refreshProjection(input)
    return { ok: undefined }
  }
  function refusePrepare(
    active: Activity<P>,
    execution: ExecutionRef,
    prepared: { failure: ModelFailure },
  ): Awaited<Reply<void>> {
    switch (verdictOf(prepared.failure)) {
      case 'unconfirmed':
        return prepared
      case 'outdated':
      case 'superseded':
        active.stage = { kind: 'idle' }
        return prepared
      case 'refused':
        active.stage = {
          kind: 'finish',
          execution,
          receiver: null,
          termination: executionFailure(prepared.failure),
          driveFailure: prepared.failure,
          resolved: true,
          settlement: { kind: 'ready' },
        }
        return { ok: undefined }
    }
  }
  async function settleNotSent(
    active: Activity<P>,
    entry: Extract<Stage<P>, { kind: 'not-sent' }>,
    input: ModelDriveInput<P>,
  ): Reply<void> {
    const terminal = await notSentTerminal(commands, entry.demand)
    if ('failure' in terminal) return terminal
    const ending = (termination: Termination, driveFailure: ModelFailure | null): Stage<P> => ({
      kind: 'finish',
      execution: entry.demand.execution,
      receiver: null,
      termination,
      driveFailure,
      resolved: driveFailure !== null,
      settlement: { kind: 'ready' },
    })
    refreshProjection(input)
    if (terminal.ok !== null) {
      active.stage = ending(terminal.ok, null)
      return { ok: undefined }
    }
    switch (verdictOf(entry.refusal)) {
      case 'refused':
        active.stage = ending(executionFailure(entry.refusal), entry.refusal)
        return { ok: undefined }
      case 'unconfirmed':
      case 'outdated':
        active.stage = { kind: 'unsent', demand: entry.demand }
        return { failure: entry.refusal }
      case 'superseded':
        active.stage = { kind: 'failed', failure: entry.refusal }
        return { failure: entry.refusal }
    }
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
      active.stage = { kind: 'not-sent', demand, refusal: sent.failure }
      return settleNotSent(active, active.stage, input)
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
      driveFailure: received.ok.failure,
      resolved: received.ok.failure !== null,
      settlement: { kind: 'ready' },
    }
    return { ok: true }
  }
  async function sendOrSettle(
    active: Activity<P>,
    input: ModelDriveInput<P>,
    signal: AbortSignal,
  ): Reply<void> {
    if (active.stage.kind === 'send' || active.stage.kind === 'unsent')
      return sendDispatch(active, active.stage.demand, input, signal)
    if (active.stage.kind === 'not-sent') return settleNotSent(active, active.stage, input)
    return { ok: undefined }
  }
  async function redispatch(
    active: Activity<P>,
    entry: Finishing<P>,
    input: ModelDriveInput<P>,
    prepare: Prepare,
  ): Reply<boolean> {
    if (entry.receiver !== null) active.spent.push(entry.receiver)
    await entry.receiver?.release()
    active.stage = { kind: 'prepare', pending: false, input: prepare }
    refreshProjection(input)
    return { ok: true }
  }
  // True: the retry policy decided another dispatch, and its prepare stage is set.
  async function conclude(
    active: Activity<P>,
    entry: Finishing<P>,
    input: ModelDriveInput<P>,
    execution: ExecutionRef,
    competition: TerminalCompetition,
  ): Reply<boolean> {
    if (!entry.resolved && entry.termination !== null) {
      const next = await retryStep({ claim: input, execution, termination: entry.termination })
      if ('failure' in next) return next
      if (next.ok.kind === 'waiting') return { ok: false }
      if (next.ok.kind === 'again') return redispatch(active, entry, input, next.ok.prepare)
      entry.termination = next.ok.termination
      entry.resolved = true
    }
    const finished = await finish(active, entry, competition)
    return 'failure' in finished ? finished : { ok: false }
  }
  // The stage after one dispatch is 'finish' when the dispatch ended; anything else ends the drive.
  async function runDispatch(
    active: Activity<P>,
    input: ModelDriveInput<P>,
    execution: ExecutionRef,
    recovery: Recovery<P>,
    signal: AbortSignal,
    competition: TerminalCompetition,
  ): Reply<Finishing<P> | null> {
    if (active.stage.kind === 'prepare') {
      const prepared = await prepareDispatch(active, active.stage, input, execution, recovery)
      if ('failure' in prepared) return prepared
    }
    const sent = await sendOrSettle(active, input, signal)
    if ('failure' in sent) return sent
    if (active.stage.kind === 'receive') {
      const received = await receiveDispatch(active, active.stage, signal, competition)
      if ('failure' in received) return received
    }
    if (active.stage.kind === 'failed') return { failure: active.stage.failure }
    return { ok: active.stage.kind === 'finish' ? active.stage : null }
  }
  async function runStages(
    active: Activity<P>,
    input: ModelDriveInput<P>,
    execution: ExecutionRef,
    recovery: Recovery<P>,
    signal: AbortSignal,
    competition: TerminalCompetition,
  ): Reply<void> {
    for (;;) {
      const ended = await runDispatch(active, input, execution, recovery, signal, competition)
      if ('failure' in ended) return ended
      if (ended.ok === null) return { ok: undefined }
      const again = await conclude(active, ended.ok, input, execution, competition)
      if ('failure' in again) return again
      if (!again.ok) return { ok: undefined }
    }
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
  function released(input: Pick<ModelDriveInput<P>, 'tenant' | 'call'>): void {
    const key = keyOf(input)
    if (key) activities.delete(key)
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
        if (initial.ok.state.phase === 'settled') open.delete(key)
        else open.add(key)
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
  return { driver, requestRefresh, admitted, counts, released }
}
