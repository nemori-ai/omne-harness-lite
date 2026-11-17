import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
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
  type ToolFailure,
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
import { TIMERS_OFF, type TimerOrigin } from './ledger-timers.ts'
import type { PreparedSynthetic, SyntheticDecision } from './ledger-result-preparation.ts'
import {
  backgroundCell,
  backgroundPlaceholder,
  backgroundTiming,
  type TimingClose,
} from './ledger-background.ts'
import { releasedQueue } from './ledger-ending.ts'
import { deleteTasks, dropSuspensionContent, nextState } from './ledger-start.ts'
import { commonOf, type StateBody } from './ledger-state.ts'
import {
  taskKey,
  type CallRecord,
  type LedgerWrite,
  type WaitLedgerRecord,
} from './ledger-store.ts'

type Command = MutationInput<unknown> & Readonly<{ inputDigest: string }>
// `origin` names the timer when Tool commits the control itself; a caller's control has none.
export type ControlCommand = Command &
  Readonly<{
    intent: ToolControl
    subject: DurableEvidence
    timing?: TimingClose
    origin?: TimerOrigin
  }>
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

const LIVE_STOP_ONLY =
  'control currently requires a suspended call, or a stop of a started or resuming invocation'

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
  return decideEnd(
    snapshot,
    call,
    command,
    intent.kind === 'withdraw' ? intent.reach : 'stop',
    prepared,
    mint,
  )
}

type EndReach = 'stop' | Extract<ToolControl, { kind: 'withdraw' }>['reach']

const PENDING_PHASES: ReadonlySet<ToolState['phase']> = new Set(['accepted', 'preparing', 'queued'])
const WITHDRAWN_RUNNING =
  'The call was withdrawn from the foreground. Its execution was asked to stop; a result it still produces is kept as a late version.'
const ENDED_BEFORE_START = 'The call was ended before it started. It did not run.'
const LIMIT_PASSED =
  'The foreground time limit of the call passed. Its execution was asked to stop; a result it still produces is kept as a late version.'

function withdrawnBy(intent: ToolControl): boolean {
  return (
    intent.kind === 'withdraw' || (intent.kind === 'background' && intent.otherwise === 'withdraw')
  )
}

function interruptedBy(command: ControlCommand) {
  if (command.origin === 'foreground-limit')
    return { kind: 'interrupted', cause: { kind: 'foreground-limit' } } as const
  return {
    kind: 'interrupted',
    cause: {
      kind: 'control',
      operation: command.operation,
      withdrawn: withdrawnBy(command.intent),
    },
  } as const
}

// The stop and withdraw columns of the control table, for a call that is not suspended.
function decideEnd(
  snapshot: Snapshot,
  call: CallRecord,
  command: ControlCommand,
  reach: EndReach,
  prepared: PreparedSynthetic | null,
  mint: Mint,
): SyntheticDecision<ControlReceipt> {
  const source = controlSource(call, command, mint)
  if (call.state.phase === 'settled')
    return recorded(
      call,
      command,
      { kind: 'already-ended', evidence: call.state.source },
      source,
      mint,
    )
  if (reach === 'foreground-and-unadmitted' && call.state.relation === 'background')
    return recorded(
      call,
      command,
      { kind: 'rejected', reason: 'out-of-reach', evidence: source },
      source,
      mint,
    )
  if (call.start === null) return decideUnstarted(snapshot, call, command, prepared, mint)
  if (
    reach !== 'stop' &&
    call.state.relation === 'foreground' &&
    call.state.execution.kind === 'live'
  )
    return decideForegroundWithdraw(snapshot, call, call.start, command, prepared, mint)
  return decideLiveStop(call, call.start, command, mint)
}

// The start is excluded in the same commit: every start step checks the phase, which is now settled.
function decideUnstarted(
  snapshot: Snapshot,
  call: CallRecord,
  command: ControlCommand,
  prepared: PreparedSynthetic | null,
  mint: Mint,
): SyntheticDecision<ControlReceipt> {
  if (!PENDING_PHASES.has(call.state.phase)) return unsupported(call, LIVE_STOP_ONLY)
  const terminal = interruptedBy(command)
  const { consumer } = call.request
  const made = syntheticChannels(
    command,
    { terminal, consumer, closedResult: ENDED_BEFORE_START },
    prepared,
  )
  if ('kind' in made) return made
  if ('failure' in made) return reply(made)
  const source = controlSource(call, command, mint)
  const effect = { kind: 'not-occurred', evidence: source } as const
  const settled = settlementWrites(snapshot, command, consumer, terminal, made.ok, mint, effect)
  if ('failure' in settled) return reply(settled)
  const { version, delivery } = settled.ok.version
  const control: ControlRecord = {
    operation: command.operation,
    intent: command.intent,
    source,
    progress: { kind: 'stopped', evidence: source },
  }
  const current = commonOf(call.state)
  const shared = {
    ...current,
    phase: 'settled',
    wait: { kind: 'none' },
    result: version,
    terminal,
    effect,
    execution: { kind: 'not-started' },
    timing: { kind: 'closed', accumulatedMs: current.timing.accumulatedMs },
    queue:
      current.queue.kind === 'none'
        ? current.queue
        : ({
            kind: 'released',
            key: current.queue.key,
            ordinal: current.queue.ordinal,
            evidence: source,
          } as const),
    controls: [...current.controls, control],
    delivery,
  } as const
  const body: StateBody =
    call.state.relation === 'background'
      ? { ...shared, relation: 'background' }
      : { ...shared, relation: 'foreground', foreground: { kind: 'final', result: version } }
  const state = nextState(call, body, mint.revision)
  const made2 = receiptWrites(call, command, state, control, mint)
  const queue: LedgerWrite[] =
    call.request.availability.kind === 'available'
      ? [put({ kind: 'task', task: queueTask(command.operation, state.source) })]
      : []
  return {
    kind: 'commit',
    value: made2.receipt,
    writes: [
      ...made2.writes,
      ...settled.ok.writes,
      ...deleteTasks(snapshot, ['queue', 'prepare', 'start']),
      ...queue,
    ],
  }
}

// The foreground gets its final now; the running execution is asked to stop and keeps its queue
// position until its real final comes in as a late version.
function decideForegroundWithdraw(
  snapshot: Snapshot,
  call: CallRecord,
  start: NonNullable<CallRecord['start']>,
  command: ControlCommand,
  prepared: PreparedSynthetic | null,
  mint: Mint,
): SyntheticDecision<ControlReceipt> {
  const terminal = interruptedBy(command)
  const { consumer } = call.request
  const made = syntheticChannels(
    command,
    {
      terminal,
      consumer,
      closedResult: command.origin === 'foreground-limit' ? LIMIT_PASSED : WITHDRAWN_RUNNING,
    },
    prepared,
  )
  if ('kind' in made) return made
  if ('failure' in made) return reply(made)
  const effect = { kind: 'unknown', diagnostic: 'withdrawn-execution-still-running' } as const
  const settled = settlementWrites(snapshot, command, consumer, terminal, made.ok, mint, effect)
  if ('failure' in settled) return reply(settled)
  const { version, delivery } = settled.ok.version
  const source = controlSource(call, command, mint)
  const control: ControlRecord = {
    operation: command.operation,
    intent: command.intent,
    source,
    progress: { kind: 'pending', diagnostic: 'stop-not-dispatched' },
  }
  const current = commonOf(call.state)
  const state = nextState(
    call,
    {
      ...current,
      phase: 'settled',
      wait: { kind: 'none' },
      result: version,
      relation: 'foreground',
      terminal,
      foreground: { kind: 'final', result: version },
      effect,
      timing: closedTiming(backgroundTiming(current.timing, command.timing, 'withdrawn')),
      controls: [...current.controls, control],
      delivery,
    },
    mint.revision,
  )
  const made2 = receiptWrites(call, command, state, control, mint)
  return {
    kind: 'commit',
    value: made2.receipt,
    writes: [...made2.writes, ...settled.ok.writes, stopTask(call, start, command, source)],
  }
}

function stopTask(
  call: CallRecord,
  start: NonNullable<CallRecord['start']>,
  command: ControlCommand,
  source: DurableEvidence,
): LedgerWrite {
  const dispatch: ControlDispatch = {
    tenant: call.tenant,
    call: call.call,
    operation: command.operation,
    adoption: start.executor,
    inputDigest: command.inputDigest,
    start,
    intent: { kind: 'stop' },
    source,
  }
  return put({
    kind: 'task',
    task: {
      kind: 'stop',
      operation: command.operation,
      state: 'pending',
      diagnostic: null,
      control: dispatch,
    },
  })
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
      return refusedBackground(snapshot, call, command, prepared, mint, cell.reason)
  }
}

function refusedBackground(
  snapshot: Snapshot,
  call: CallRecord,
  command: BackgroundCommand,
  prepared: PreparedSynthetic | null,
  mint: Mint,
  reason: string,
): SyntheticDecision<ControlReceipt> {
  const { otherwise } = command.intent
  if (otherwise === 'reject') {
    const source = controlSource(call, command, mint)
    return recorded(call, command, { kind: 'rejected', reason, evidence: source }, source, mint)
  }
  if (call.state.phase === 'suspended')
    return decideSuspendedControl(snapshot, call, command, prepared, mint)
  // Only the foreground limit sends `otherwise: stop` (the public intent refuses it). Like a
  // withdraw, it ends the foreground now and still asks the execution to stop.
  return decideEnd(snapshot, call, command, 'foreground-and-unadmitted', prepared, mint)
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
    command.origin === undefined
      ? { kind: 'control', operation: command.operation }
      : { kind: command.origin },
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
    writes: [...made.writes, put({ kind: 'task', task: placeholder.task }), ...TIMERS_OFF],
  }
}

function decideLiveStop(
  call: CallRecord,
  start: NonNullable<CallRecord['start']>,
  command: ControlCommand,
  mint: Mint,
): Decision<ControlReceipt> {
  const resumeStarting = start.kind === 'resume' && call.state.execution.kind === 'starting'
  if (call.state.execution.kind !== 'live' && !resumeStarting)
    return unsupported(call, LIVE_STOP_ONLY)
  const source = controlSource(call, command, mint)
  const control: ControlRecord = {
    operation: command.operation,
    intent: command.intent,
    source,
    progress: { kind: 'pending', diagnostic: 'stop-not-dispatched' },
  }
  const revised = withControls(call, [...call.state.controls, control], mint)
  const made = receiptWrites(call, command, revised.state, control, mint)
  return {
    kind: 'commit',
    value: made.receipt,
    writes: [...made.writes, stopTask(call, start, command, source)],
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
      withdrawn: withdrawnBy(intent),
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
    queue: releasedQueue(current.queue, committed.exclusion),
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

type Placeholder = Extract<ToolState['foreground'], { kind: 'background' }>

function placeholderTarget(
  snapshot: Snapshot,
  command: PlaceholderReleaseCommand,
): Outcome<Readonly<{ call: CallRecord; foreground: Placeholder }>, ToolFailure> {
  const call = snapshot.call
  if (call === null) return invalid('call', 'unknown-call')
  const foreground = call.state.foreground
  if (foreground?.kind !== 'background') return invalid('placeholder', 'none')
  if (foreground.delivery.delivery !== command.delivery) return invalid('delivery', 'mismatch')
  if (!sameConsumer(foreground.delivery.consumer, command.consumer))
    return invalid('consumer', 'mismatch')
  const proof = handoffEvidence(command.evidence)
  if (proof.value.owner !== command.consumer.owner)
    return invalid(`${proof.field}.owner`, 'owner-mismatch')
  return succeed({ call, foreground })
}

export function decideReleasePlaceholder(
  snapshot: Snapshot,
  command: PlaceholderReleaseCommand,
  mint: Mint,
): Decision<ReleasedDelivery> {
  const known = recall(snapshot, command.operation, command.inputDigest, 'release-placeholder')
  if ('failure' in known) return reply(known)
  if (known.ok?.receipt.kind === 'release-placeholder')
    return reply(succeed(known.ok.receipt.delivery))
  const target = placeholderTarget(snapshot, command)
  if ('failure' in target) return reply(target)
  const { call, foreground } = target.ok
  const owed = foreground.delivery
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
