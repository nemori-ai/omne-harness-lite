import { fail, succeed } from '@omne-harness/operation-result'
import {
  decodeToolOperationId,
  type ControlProgress,
  type ControlReceipt,
  type ConsumerRef,
  type ControlRecord,
  type DurableEvidence,
  type Handoff,
  type ReleasedDelivery,
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
  handoffEvidence,
  recall,
  reply,
  sameConsumer,
  settlementWrites,
  syntheticChannels,
  type Decision,
  type Mint,
  type Snapshot,
} from './ledger-decider.ts'
import type { PreparedSynthetic, SyntheticDecision } from './ledger-result-preparation.ts'
import {
  backgroundCell,
  backgroundPlaceholder,
  backgroundTiming,
  type TimingClose,
} from './ledger-background.ts'
import { commonOf, dropSuspensionContent, nextState, type StateBody } from './ledger-start.ts'
import {
  taskKey,
  type CallRecord,
  type LedgerWrite,
  type WaitLedgerRecord,
} from './ledger-store.ts'

type Command = MutationInput<unknown> & Readonly<{ inputDigest: string }>
type ControlCommand = Command &
  Readonly<{ intent: ToolControl; subject: DurableEvidence; timing?: TimingClose }>
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

type BackgroundCommand = ControlCommand &
  Readonly<{ intent: Extract<ToolControl, { kind: 'background' }> }>

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
  const { intent } = command
  if (intent.kind === 'background')
    return decideBackground(snapshot, call, { ...command, intent }, prepared, mint)
  if (call.state.phase === 'suspended')
    return decideSuspendedControl(snapshot, call, command, prepared, mint)
  return decideLiveStop(call, command, mint)
}

function controlSource(call: CallRecord, command: ControlCommand, mint: Mint): DurableEvidence {
  return mintEvidence(
    'operation',
    { tenant: call.tenant, call: call.call, operation: command.operation },
    mint.revision,
    { intent: command.intent, start: call.start, subject: command.subject },
  )
}

function unsupported(call: CallRecord, reason: string): Decision<ControlReceipt> {
  return reply(
    fail({ kind: 'unsupported', adoption: call.request.availability.definition.adoption, reason }),
  )
}

function receiptWrites(
  call: CallRecord,
  command: ControlCommand,
  state: ToolState,
  control: ControlRecord,
  mint: Mint,
): Readonly<{ receipt: ControlReceipt; writes: LedgerWrite[] }> {
  const receipt: ControlReceipt = {
    operation: command.operation,
    state,
    progress: control.progress,
  }
  return {
    receipt,
    writes: [
      put({ kind: 'call', call: { ...call, state } }),
      put(
        operationRecord(
          command,
          { kind: 'control', control: receipt, subject: command.subject },
          mint,
        ),
      ),
    ],
  }
}

function recorded(
  call: CallRecord,
  command: ControlCommand,
  progress: ControlProgress,
  source: DurableEvidence,
  mint: Mint,
): Decision<ControlReceipt> {
  const control: ControlRecord = {
    operation: command.operation,
    intent: command.intent,
    source,
    progress,
  }
  const revised = withControls(call, [...call.state.controls, control], mint)
  const made = receiptWrites(call, command, revised.state, control, mint)
  return { kind: 'commit', value: made.receipt, writes: made.writes }
}

function decideBackground(
  snapshot: Snapshot,
  call: CallRecord,
  command: BackgroundCommand,
  prepared: PreparedSynthetic | null,
  mint: Mint,
): SyntheticDecision<ControlReceipt> {
  const source = controlSource(call, command, mint)
  const cell = backgroundCell(call)
  switch (cell.kind) {
    case 'ended':
      return recorded(
        call,
        command,
        { kind: 'already-ended', evidence: call.state.source },
        source,
        mint,
      )
    case 'background':
      return recorded(
        call,
        command,
        { kind: 'relation-changed', evidence: call.state.source },
        source,
        mint,
      )
    case 'movable':
      return moveToBackground(call, command, cell.body, source, mint)
    case 'refused':
      break
  }
  const { otherwise } = command.intent
  if (otherwise === 'reject')
    return recorded(
      call,
      command,
      { kind: 'rejected', reason: cell.reason, evidence: source },
      source,
      mint,
    )
  if (call.state.phase === 'suspended')
    return decideSuspendedControl(snapshot, call, command, prepared, mint)
  if (otherwise === 'stop') return decideLiveStop(call, command, mint)
  return unsupported(call, 'a withdraw of a running call is not supported yet')
}

function moveToBackground(
  call: CallRecord,
  command: BackgroundCommand,
  body: StateBody,
  source: DurableEvidence,
  mint: Mint,
): Decision<ControlReceipt> {
  const placeholder = backgroundPlaceholder(
    { call: call.call, operation: command.operation, consumer: call.request.consumer },
    { kind: 'control', operation: command.operation },
    source,
  )
  const control: ControlRecord = {
    operation: command.operation,
    intent: command.intent,
    source,
    progress: { kind: 'relation-changed', evidence: source },
  }
  const state = nextState(
    call,
    {
      ...body,
      foreground: placeholder.foreground,
      timing: backgroundTiming(body.timing, command.timing),
      controls: [...body.controls, control],
    },
    mint.revision,
  )
  const made = receiptWrites(call, command, state, control, mint)
  return {
    kind: 'commit',
    value: made.receipt,
    writes: [...made.writes, put({ kind: 'task', task: placeholder.task })],
  }
}

function decideLiveStop(
  call: CallRecord,
  command: ControlCommand,
  mint: Mint,
): Decision<ControlReceipt> {
  const resumeStarting = call.start?.kind === 'resume' && call.state.execution.kind === 'starting'
  if (
    command.intent.kind === 'withdraw' ||
    call.start === null ||
    (call.state.execution.kind !== 'live' &&
      call.state.execution.kind !== 'ended' &&
      !resumeStarting)
  )
    return unsupported(
      call,
      'control currently requires a suspended call, or a stop of a started or resuming invocation',
    )
  const source = controlSource(call, command, mint)
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
  const made = receiptWrites(call, command, revised.state, control, mint)
  const dispatch: ControlDispatch = {
    tenant: call.tenant,
    call: call.call,
    operation: command.operation,
    adoption: call.start.executor,
    inputDigest: command.inputDigest,
    start: call.start,
    intent: { kind: 'stop' },
    source,
  }
  return {
    kind: 'commit',
    value: made.receipt,
    writes: [
      ...made.writes,
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
    cause: {
      kind: 'control',
      operation: command.operation,
      withdrawn:
        intent.kind === 'withdraw' ||
        (intent.kind === 'background' && intent.otherwise === 'withdraw'),
    },
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

export type PlaceholderReleaseCommand = Readonly<{
  tenant: CallRecord['tenant']
  call: CallRecord['call']
  operation: ToolOperationId
  delivery: ReleasedDelivery['delivery']
  consumer: ConsumerRef
  evidence: Handoff
  inputDigest: string
}>

export function decideReleasePlaceholder(
  snapshot: Snapshot,
  command: PlaceholderReleaseCommand,
  mint: Mint,
): Decision<ReleasedDelivery> {
  const known = recall(snapshot, command.operation, command.inputDigest, 'release-placeholder')
  if ('failure' in known) return reply(known)
  if (known.ok?.receipt.kind === 'release-placeholder')
    return reply(succeed(known.ok.receipt.delivery))
  const call = snapshot.call
  if (call === null) return reply(invalid('call', 'unknown-call'))
  const foreground = call.state.foreground
  if (foreground?.kind !== 'background') return reply(invalid('placeholder', 'none'))
  const owed = foreground.delivery
  if (owed.delivery !== command.delivery) return reply(invalid('delivery', 'mismatch'))
  if (!sameConsumer(owed.consumer, command.consumer)) return reply(invalid('consumer', 'mismatch'))
  const proof = handoffEvidence(command.evidence)
  if (proof.value.owner !== command.consumer.owner)
    return reply(invalid(`${proof.field}.owner`, 'owner-mismatch'))
  if (owed.kind === 'released') return reply(succeed(owed))
  const released: ReleasedDelivery = {
    kind: 'released',
    delivery: owed.delivery,
    consumer: owed.consumer,
    evidence: mintEvidence(
      'delivery',
      { tenant: call.tenant, call: call.call, delivery: owed.delivery },
      mint.revision,
      { operation: command.operation, consumer: command.consumer, handoff: command.evidence },
    ),
  }
  const { source: _source, ...body } = call.state
  const state = nextState(
    call,
    { ...body, foreground: { ...foreground, delivery: released } },
    mint.revision,
  )
  const task = snapshot.tasks.find(item => item.kind === 'placeholder')
  return {
    kind: 'commit',
    value: released,
    writes: [
      put({ kind: 'call', call: { ...call, state } }),
      put(operationRecord(command, { kind: 'release-placeholder', delivery: released }, mint)),
      ...(task === undefined ? [] : [{ kind: 'delete' as const, key: taskKey(task) }]),
    ],
  }
}
