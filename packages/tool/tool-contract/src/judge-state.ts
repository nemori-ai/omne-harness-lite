// The closed judgment of a Tool state value (342 returns and execution facts).
import { fail, type Outcome } from '@omne-harness/operation-result'
import {
  decodeToolCallId,
  decodeToolDeliveryId,
  decodeToolInstanceId,
  decodeToolOperationId,
  decodeToolResultVersion,
  decodeToolRevision,
  decodeToolWaitId,
} from './identity.ts'
import type { BackgroundSource, ForegroundReturn, ToolControl } from './operations.ts'
import type {
  ClockSegment,
  ControlProgress,
  ControlRecord,
  PhysicalExecution,
  QueuePosition,
  ToolTiming,
} from './records.ts'
import type {
  DeliveryState,
  Effect,
  InterruptionCause,
  ToolState,
  ToolTerminal,
  WaitState,
} from './results.ts'
import {
  bool,
  decimal,
  filled,
  identity,
  judgeUnknown,
  list,
  literal,
  nullable,
  record,
  text,
  variant,
  type Check,
  type ShapeRejection,
} from './shape.ts'
import { adoption, consumerRef, durableEvidence } from './value-shapes.ts'

const call = identity(decodeToolCallId)
const operation = identity(decodeToolOperationId)
const instance = identity(decodeToolInstanceId)
const wait = identity(decodeToolWaitId)
const resultVersion = identity(decodeToolResultVersion)
const delivery = identity(decodeToolDeliveryId)
const revision = identity(decodeToolRevision)

const interruptionCause: Check<InterruptionCause> = variant('kind', {
  control: record({ kind: literal('control'), operation, withdrawn: bool }),
  'foreground-limit': record({ kind: literal('foreground-limit') }),
  'resume-rejected': record({ kind: literal('resume-rejected'), exclusion: durableEvidence }),
})

const terminalBranches = {
  completed: record({ kind: literal('completed') }),
  failed: record({
    kind: literal('failed'),
    cause: literal('arguments', 'environment', 'executor', 'runtime-lost', 'result'),
    diagnostic: text,
  }),
  unavailable: record({ kind: literal('unavailable'), reason: text }),
  interrupted: record({ kind: literal('interrupted'), cause: interruptionCause }),
}
const terminal: Check<ToolTerminal> = variant('kind', {
  ...terminalBranches,
  'no-response': record({ kind: literal('no-response'), wait, reason: text }),
})
/** A background execution cannot settle without a response: Ask is foreground only. */
const backgroundTerminal: Check<Exclude<ToolTerminal, { kind: 'no-response' }>> = variant(
  'kind',
  terminalBranches,
)

const effect: Check<Effect> = variant('kind', {
  'not-started': record({ kind: literal('not-started') }),
  'not-occurred': record({ kind: literal('not-occurred'), evidence: durableEvidence }),
  occurred: record({ kind: literal('occurred'), evidence: durableEvidence }),
  unknown: record({ kind: literal('unknown'), diagnostic: text }),
})

const backgroundSource: Check<BackgroundSource> = variant('kind', {
  launched: record({ kind: literal('launched') }),
  control: record({ kind: literal('control'), operation }),
  threshold: record({ kind: literal('threshold') }),
  'foreground-limit': record({ kind: literal('foreground-limit') }),
})

const foreground: Check<ForegroundReturn> = variant('kind', {
  final: record({ kind: literal('final'), result: resultVersion }),
  background: record({ kind: literal('background'), call, source: backgroundSource }),
})

const execution: Check<PhysicalExecution> = variant('kind', {
  'not-started': record({ kind: literal('not-started') }),
  starting: record({ kind: literal('starting'), start: operation }),
  live: record({ kind: literal('live'), start: operation }),
  unknown: record({ kind: literal('unknown'), start: operation }),
  suspended: record({ kind: literal('suspended'), checkpoint: durableEvidence }),
  ended: record({ kind: literal('ended'), evidence: durableEvidence }),
  lost: record({ kind: literal('lost'), evidence: durableEvidence }),
})

const segment: Check<ClockSegment> = record({
  operation,
  source: filled,
  epoch: filled,
  marker: durableEvidence,
})
const timing: Check<ToolTiming> = variant('kind', {
  running: record({ kind: literal('running'), accumulatedMs: decimal, segment }),
  paused: record({ kind: literal('paused'), accumulatedMs: decimal }),
  closed: record({ kind: literal('closed'), accumulatedMs: decimal }),
  unknown: record({ kind: literal('unknown'), accumulatedMs: decimal, segment, diagnostic: text }),
})

const queue: Check<QueuePosition> = variant('kind', {
  none: record({ kind: literal('none') }),
  waiting: record({ kind: literal('waiting'), key: filled, ordinal: decimal }),
  held: record({ kind: literal('held'), key: filled, ordinal: decimal }),
  released: record({
    kind: literal('released'),
    key: filled,
    ordinal: decimal,
    evidence: durableEvidence,
  }),
})

const control: Check<ToolControl> = variant('kind', {
  stop: record({ kind: literal('stop') }),
  withdraw: record({
    kind: literal('withdraw'),
    reach: literal('all', 'foreground-and-unadmitted'),
  }),
  background: record({ kind: literal('background') }),
})
const evidenced = <K extends string>(kind: K) =>
  record({ kind: literal(kind), evidence: durableEvidence })
const progress: Check<ControlProgress> = variant('kind', {
  pending: record({ kind: literal('pending'), diagnostic: text }),
  unknown: record({ kind: literal('unknown'), diagnostic: text }),
  accepted: evidenced('accepted'),
  stopped: evidenced('stopped'),
  'already-ended': evidenced('already-ended'),
  'relation-changed': evidenced('relation-changed'),
  rejected: record({ kind: literal('rejected'), reason: text, evidence: durableEvidence }),
})
const controlRecord: Check<ControlRecord> = record({
  operation,
  intent: control,
  source: durableEvidence,
  progress,
})

const deliveryState: Check<DeliveryState> = variant('kind', {
  pending: record({ kind: literal('pending'), delivery, consumer: consumerRef }),
  released: record({
    kind: literal('released'),
    delivery,
    consumer: consumerRef,
    evidence: durableEvidence,
  }),
})

const waitNone = record({ kind: literal('none') })
const waitState: Check<WaitState> = variant('kind', {
  none: waitNone,
  ask: record({
    kind: literal('ask'),
    wait,
    registration: durableEvidence,
    resume: durableEvidence,
    decision: nullable(durableEvidence),
  }),
  resource: record({
    kind: literal('resource'),
    wait,
    contract: adoption,
    deadline: nullable(filled),
    resume: durableEvidence,
    registration: durableEvidence,
  }),
})

const common = {
  call,
  revision,
  source: durableEvidence,
  foreground: nullable(foreground),
  effect,
  execution,
  timing,
  queue,
  controls: list(controlRecord),
  delivery: nullable(deliveryState),
  supplements: list(
    record({
      result: resultVersion,
      actual: terminal,
      delivery: deliveryState,
      source: durableEvidence,
    }),
  ),
}

const relation = literal('foreground', 'background')
const beforeStart = (phase: 'accepted' | 'preparing' | 'queued' | 'starting') =>
  record({ ...common, phase: literal(phase), wait: waitNone, relation })
/** An active execution may wait only in the foreground (P06). */
const active = <F extends Readonly<Record<string, Check<unknown>>>>(fields: F) =>
  variant('relation', {
    foreground: record({ ...common, ...fields, relation: literal('foreground'), wait: waitState }),
    background: record({ ...common, ...fields, relation: literal('background'), wait: waitNone }),
  })

const stateShape: Check<ToolState> = variant('phase', {
  accepted: beforeStart('accepted'),
  preparing: beforeStart('preparing'),
  queued: beforeStart('queued'),
  starting: beforeStart('starting'),
  running: active({ phase: literal('running'), instance }),
  suspended: active({ phase: literal('suspended'), checkpoint: durableEvidence }),
  settled: variant('relation', {
    foreground: record({
      ...common,
      phase: literal('settled'),
      wait: waitNone,
      result: resultVersion,
      relation: literal('foreground'),
      terminal,
    }),
    background: record({
      ...common,
      phase: literal('settled'),
      wait: waitNone,
      result: resultVersion,
      relation: literal('background'),
      terminal: backgroundTerminal,
    }),
  }),
})

type StateRule = Readonly<{ field: string; reason: string; holds: (state: ToolState) => boolean }>

/** Relations between fields that the type cannot express. Each row names the source rule. */
const STATE_RULES: readonly StateRule[] = [
  {
    // A background placeholder answers the foreground of the same call (342 waits and timing).
    field: 'foreground.call',
    reason: 'call-mismatch',
    holds: state => state.foreground?.kind !== 'background' || state.foreground.call === state.call,
  },
  {
    // Background is fixed together with its placeholder, also at a start in background (P02).
    field: 'foreground',
    reason: 'missing-background-placeholder',
    holds: state => state.relation !== 'background' || state.foreground?.kind === 'background',
  },
  {
    // Only a call whose execution never started may settle as unavailable (dummy, first start
    // rejection). A started execution, also one that already ended, ends otherwise (342 waits).
    field: 'execution',
    reason: 'unavailable-after-start',
    holds: state => !settledUnavailable(state) || state.execution.kind === 'not-started',
  },
  {
    // The unavailable result of a first start rejection records effect=not-started (342 values).
    field: 'effect',
    reason: 'unavailable-with-effect',
    holds: state => !settledUnavailable(state) || state.effect.kind === 'not-started',
  },
]

function settledUnavailable(state: ToolState): boolean {
  return state.phase === 'settled' && state.terminal.kind === 'unavailable'
}

/**
 * Judges an untrusted value as a Tool state. The check is closed and follows the phase and
 * relation branches of `ToolState`, then the field relations in `STATE_RULES`. It reads no store
 * and does not prove that the state is current. The result is a frozen copy.
 */
export function judgeToolState(
  value: unknown,
): Outcome<ToolState, Readonly<{ field: string; reason: string }>> {
  const shaped = judgeUnknown(stateShape, value, 'ToolState')
  if ('failure' in shaped) return shaped
  const broken = STATE_RULES.find(rule => !rule.holds(shaped.ok))
  if (broken === undefined) return shaped
  const rejection: ShapeRejection = { field: broken.field, reason: broken.reason }
  return fail(rejection)
}
