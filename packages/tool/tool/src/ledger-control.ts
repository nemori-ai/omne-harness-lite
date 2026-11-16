import { fail, succeed } from '@omne-harness/operation-result'
import {
  decodeToolOperationId,
  type ControlProgress,
  type ControlReceipt,
  type ControlRecord,
  type DurableEvidence,
  type ToolControl,
  type ToolOperationId,
  type ToolState,
} from '@omne-harness/tool-contract'
import type { ControlDispatch } from '@omne-harness/tool-contract/provider'
import { invalid, type MutationInput } from './boundary.ts'
import { mintEvidence, sameFactValue } from './evidence.ts'
import {
  operationRecord,
  put,
  queueTask,
  recall,
  reply,
  settlementWrites,
  syntheticChannels,
  type Decision,
  type Mint,
  type Snapshot,
} from './ledger-decider.ts'
import type { PreparedSynthetic, SyntheticDecision } from './ledger-result-preparation.ts'
import { commonOf, dropSuspensionContent, nextState, type StateBody } from './ledger-start.ts'
import {
  taskKey,
  type CallRecord,
  type LedgerWrite,
  type WaitLedgerRecord,
} from './ledger-store.ts'

type Command = MutationInput<unknown> & Readonly<{ inputDigest: string }>
type ControlCommand = Command & Readonly<{ intent: ToolControl; subject: DurableEvidence }>
type ProgressCommand = Command &
  Readonly<{
    control: ToolOperationId
    source: DurableEvidence
    progress: ControlProgress
  }>

function withControls(
  call: CallRecord,
  controls: readonly ControlRecord[],
  mint: Mint,
): CallRecord {
  const { source: _source, ...body } = call.state
  const state = { ...body, controls, revision: mint.revision }
  return {
    ...call,
    state: {
      ...state,
      source: mintEvidence('state', { tenant: call.tenant, call: call.call }, mint.revision, state),
    },
  }
}

export function decideControl(
  snapshot: Snapshot,
  command: ControlCommand,
  prepared: PreparedSynthetic | null,
  mint: Mint,
): SyntheticDecision<ControlReceipt> {
  const known = recall(snapshot, command.operation, command.inputDigest, 'control')
  if ('failure' in known) return reply(known)
  if (known.ok?.receipt.kind === 'control') return reply(succeed(known.ok.receipt.control))
  const call = snapshot.call
  if (call === null) return reply(invalid('call', 'unknown-call'))
  if (call.state.phase === 'suspended')
    return decideSuspendedControl(snapshot, call, command, prepared, mint)
  const resumeStarting = call.start?.kind === 'resume' && call.state.execution.kind === 'starting'
  if (
    command.intent.kind !== 'stop' ||
    call.start === null ||
    (call.state.execution.kind !== 'live' &&
      call.state.execution.kind !== 'ended' &&
      !resumeStarting)
  )
    return reply(
      fail({
        kind: 'unsupported',
        adoption: call.request.availability.definition.adoption,
        reason:
          'control currently requires a suspended call, or a stop of a started or resuming invocation',
      }),
    )
  const source = mintEvidence(
    'operation',
    { tenant: call.tenant, call: call.call, operation: command.operation },
    mint.revision,
    { intent: command.intent, start: call.start, subject: command.subject },
  )
  const ended = call.state.execution.kind === 'ended'
  const control: ControlRecord = {
    operation: command.operation,
    intent: command.intent,
    source,
    progress: ended
      ? { kind: 'already-ended', evidence: call.state.source }
      : { kind: 'pending', diagnostic: 'stop-not-dispatched' },
  }
  const revised = withControls(call, [...call.state.controls, control], mint)
  const receipt: ControlReceipt = {
    operation: command.operation,
    state: revised.state,
    progress: control.progress,
  }
  const dispatch: ControlDispatch = {
    tenant: call.tenant,
    call: call.call,
    operation: command.operation,
    adoption: call.start.executor,
    inputDigest: command.inputDigest,
    start: call.start,
    intent: command.intent,
    source,
  }
  return {
    kind: 'commit',
    value: receipt,
    writes: [
      put({ kind: 'call', call: revised }),
      put(
        operationRecord(
          command,
          { kind: 'control', control: receipt, subject: command.subject },
          mint,
        ),
      ),
      ...(ended
        ? []
        : [
            put({
              kind: 'task',
              task: {
                kind: 'stop',
                operation: command.operation,
                state: 'pending',
                diagnostic: null,
                control: dispatch,
              },
            }),
          ]),
    ],
  }
}

export function invalidationOperation(wait: string): ToolOperationId | null {
  const decoded = decodeToolOperationId(`${wait}/invalidate`)
  return 'ok' in decoded ? decoded.ok : null
}

function currentWait(snapshot: Snapshot): WaitLedgerRecord | undefined {
  return [...snapshot.waits.values()].find(wait => wait.record.phase !== 'closed')
}

function closedTiming(timing: ToolState['timing']): ToolState['timing'] {
  return timing.kind === 'paused' || timing.kind === 'closed'
    ? { kind: 'closed', accumulatedMs: timing.accumulatedMs }
    : timing
}

function decideSuspendedControl(
  snapshot: Snapshot,
  call: CallRecord,
  command: ControlCommand,
  prepared: PreparedSynthetic | null,
  mint: Mint,
): SyntheticDecision<ControlReceipt> {
  const { intent } = command
  if (intent.kind === 'background') return reply(invalid('intent', 'ask-wait-cannot-background'))
  if (call.state.phase !== 'suspended' || call.state.execution.kind !== 'suspended')
    return reply(invalid('call', 'not-suspended'))
  const { checkpoint } = call.state.execution
  const committed = [...snapshot.suspensions.values()].find(
    entry => entry.checkpoint !== null && sameFactValue(entry.checkpoint.payload, checkpoint),
  )?.checkpoint
  if (committed === undefined || committed === null || call.start === null)
    return reply(invalid('checkpoint', 'not-committed-by-suspend'))
  const wait = currentWait(snapshot)
  if (wait === undefined) return reply(invalid('wait', 'no-current-wait'))
  const invalidation = invalidationOperation(wait.record.intent.wait)
  if (invalidation === null) return reply(invalid('wait', 'no-invalidation-operation'))
  const terminal = {
    kind: 'interrupted',
    cause: { kind: 'control', operation: command.operation, withdrawn: intent.kind === 'withdraw' },
  } as const
  const made = syntheticChannels(
    command,
    { terminal, consumer: call.request.consumer, closedResult: committed.closedResult },
    prepared,
  )
  if ('kind' in made) return made
  if ('failure' in made) return reply(made)
  const effect = { kind: 'unknown', diagnostic: 'suspended-segments-effect-unreported' } as const
  const settled = settlementWrites(
    snapshot,
    command,
    call.request.consumer,
    terminal,
    made.ok,
    mint,
    effect,
  )
  if ('failure' in settled) return reply(settled)
  const first = settled.ok
  const { version, delivery } = first.version
  const source = mintEvidence(
    'operation',
    { tenant: call.tenant, call: call.call, operation: command.operation },
    mint.revision,
    { intent, start: call.start, subject: command.subject },
  )
  const control: ControlRecord = {
    operation: command.operation,
    intent,
    source,
    progress: { kind: 'already-ended', evidence: committed.exclusion },
  }
  const current = commonOf(call.state)
  const body: StateBody = {
    ...current,
    phase: 'settled',
    wait: { kind: 'none' },
    result: version,
    relation: 'foreground',
    terminal,
    foreground: { kind: 'final', result: version },
    effect,
    timing: closedTiming(current.timing),
    queue:
      current.queue.kind === 'held' || current.queue.kind === 'waiting'
        ? { ...current.queue, kind: 'released', evidence: committed.exclusion }
        : current.queue,
    controls: [...current.controls, control],
    delivery,
  }
  const state = nextState(call, body, mint.revision)
  const receipt: ControlReceipt = {
    operation: command.operation,
    state,
    progress: control.progress,
  }
  const replaced = snapshot.tasks.filter(
    task =>
      task.kind === 'queue' ||
      task.kind === 'suspend' ||
      task.kind === 'prepare' ||
      (task.kind === 'wait-registration' && task.action === 'ensure'),
  )
  const writes: LedgerWrite[] = [
    put({ kind: 'call', call: { ...call, state } }),
    ...first.writes,
    ...dropSuspensionContent(snapshot),
    put({
      kind: 'wait',
      wait: {
        ...wait,
        record: {
          intent: wait.record.intent,
          phase: 'closed',
          cause: 'cancelled',
          evidence: source,
        },
      },
    }),
    put(
      operationRecord(
        command,
        { kind: 'control', control: receipt, subject: command.subject },
        mint,
      ),
    ),
    ...replaced.map(task => ({ kind: 'delete', key: taskKey(task) }) as const),
    put({
      kind: 'task',
      task: {
        kind: 'wait-registration',
        operation: invalidation,
        state: 'pending',
        diagnostic: null,
        wait: wait.record.intent.wait,
        action: 'invalidate',
        evidence: state.source,
      },
    }),
    put({ kind: 'task', task: queueTask(command.operation, state.source) }),
  ]
  return { kind: 'commit', value: receipt, writes }
}

export function controlFinished(progress: ControlProgress): boolean {
  return (
    progress.kind === 'stopped' ||
    progress.kind === 'already-ended' ||
    progress.kind === 'rejected' ||
    progress.kind === 'relation-changed'
  )
}

export function decideRecordControl(
  snapshot: Snapshot,
  command: ProgressCommand,
  mint: Mint,
): Decision<ControlRecord> {
  const known = recall(snapshot, command.operation, command.inputDigest, 'record-control')
  if ('failure' in known) return reply(known)
  if (known.ok?.receipt.kind === 'record-control') return reply(succeed(known.ok.receipt.control))
  const call = snapshot.call
  if (call === null) return reply(invalid('call', 'unknown-call'))
  const original = call.state.controls.find(item => item.operation === command.control)
  if (original === undefined || !sameFactValue(original.source, command.source))
    return reply(invalid('control', 'not-original-control'))
  if (controlFinished(original.progress)) {
    return sameFactValue(original.progress, command.progress)
      ? reply(succeed(original))
      : reply(fail({ kind: 'conflict', operation: command.control }))
  }
  const task = snapshot.tasks.find(
    item => item.kind === 'stop' && item.operation === command.control,
  )
  if (task?.kind !== 'stop' || !sameFactValue(task.control.start, call.start))
    return reply(invalid('control', 'not-original-execution'))
  if (command.progress.kind === 'relation-changed')
    return reply(invalid('progress', 'stop-cannot-change-relation'))
  const progress = command.progress
  const control: ControlRecord = { ...original, progress }
  const revised = withControls(
    call,
    call.state.controls.map(item => (item.operation === command.control ? control : item)),
    mint,
  )
  return {
    kind: 'commit',
    value: control,
    writes: [
      put({ kind: 'call', call: revised }),
      put(operationRecord(command, { kind: 'record-control', control }, mint)),
      controlFinished(control.progress)
        ? { kind: 'delete', key: taskKey(task) }
        : put({
            kind: 'task',
            task: {
              ...task,
              diagnostic: 'diagnostic' in control.progress ? control.progress.diagnostic : null,
            },
          }),
    ],
  }
}

export function rejectControl(
  call: CallRecord,
  original: ControlRecord,
  mint: Mint,
): Decision<ControlRecord> {
  const control: ControlRecord = {
    ...original,
    progress: {
      kind: 'rejected',
      reason: 'control-qualification-denied',
      evidence: mintEvidence(
        'operation',
        {
          tenant: call.tenant,
          call: call.call,
          operation: original.operation,
        },
        mint.revision,
        { control: original.source, reason: 'control-qualification-denied' },
      ),
    },
  }
  return {
    kind: 'commit',
    value: control,
    writes: [
      put({
        kind: 'call',
        call: withControls(
          call,
          call.state.controls.map(item => (item.operation === original.operation ? control : item)),
          mint,
        ),
      }),
      { kind: 'delete', key: taskKey({ kind: 'stop', operation: original.operation }) },
    ],
  }
}
