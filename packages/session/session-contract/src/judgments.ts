// The nine pure domain services and the shapes they share with `decide` and `reduce`
// (SPEC「领域服务与归约」). Inputs are the work snapshot and command parameters only: no time,
// random number, connection or outside state. The outcome sets are closed discriminated unions.
//
import { originalAttempt } from './history-validation.ts'
import { waitKey } from './call-state.ts'
import { digestOf } from './operations.ts'
import { deriveSessionOperation } from './operations.ts'
import type { CompactionContext } from '@omne-harness/message'
import type {
  AdvanceRef,
  InputId,
  RunId,
  SessionId,
  SessionOperationId,
  SessionRevision,
} from './identity.ts'
import type {
  AutoArchivePolicy,
  BoundedClose,
  ControlIntent,
  IdleCoverage,
  IdleObservation,
  Participation,
  ProducerRef,
  RecoveryTask,
  RoutedInput,
  RunTerminal,
  Waiting,
  WorkSnapshot,
} from './values.ts'
import type { CommitReceipt, EntryClass, HistoryEntry, SessionFailure } from './faces.ts'
import type { GuardCommand, SessionCommand } from './ports.ts'
import type { ConsumptionId, DurableEvidence } from './identity.ts'
import type { SessionHistoryReads } from './history-values.ts'
import type { SessionCallWait } from './call-values.ts'
import type {
  SessionCallLookup,
  SessionCallTerminal,
  SessionControlAnswer,
  SessionRunLookup,
} from './control-values.ts'
import type { SessionEntriesChannel } from './interpretation-values.ts'

export type AdvanceJudgment =
  | Readonly<{ kind: 'ok' }>
  | Readonly<{ kind: 'stale-advance'; current: AdvanceRef | null }>
  | Readonly<{ kind: 'changed'; revision: SessionRevision }>
  | Readonly<{ kind: 'terminal'; terminal: RunTerminal }>
  | Readonly<{ kind: 'archived' }>
export type AdvanceClaim =
  | Readonly<{ kind: 'attempt'; advance: AdvanceRef; expected: SessionRevision }>
  | Readonly<{ kind: 'bounded'; run: RunId; expected: SessionRevision; basis: BoundedClose }>
  | Readonly<{ kind: 'participation'; execution: string; joint: Participation['joint'] }>
export type RouteJudgment =
  | Readonly<{ kind: 'queue'; destination: 'current-run' | 'next-run' }>
  | Readonly<{ kind: 'card'; destination: DurableEvidence }>
  | Readonly<{ kind: 'business'; owner: string }>
  | Readonly<{ kind: 'rejected'; reason: 'archived' | 'frozen' | 'invalid' }>
export type RunStartJudgment =
  | Readonly<{ kind: 'eligible'; first: InputId }>
  | Readonly<{
      kind: 'not-ready' | 'archived' | 'frozen' | 'run-active' | 'no-input' | 'login-required'
    }>
/** Original work sets and control responsibilities, all derived from the snapshot. taken: inputs the Agent took with no model call registered (SE18) after them, so no model request has read them yet. unreadEvents: Agent events after readThrough count as open work. */
export type OpenWork = Readonly<{
  unassociatedWaiting?: readonly SessionCallWait[]
  unsettledControls?: readonly SessionOperationId[]
  pending: readonly InputId[]
  handed: readonly InputId[]
  taken: readonly InputId[]
  waiting: readonly Waiting[]
  backgroundPlaceholders: readonly ConsumptionId[]
  unresolved: readonly SessionOperationId[]
  unreadEvents: readonly Readonly<{ execution: string; after: string }>[]
}>
export type CompletionJudgment =
  | Readonly<{ kind: 'allowed' }>
  | Readonly<{ kind: 'blocked'; pendingInputs: readonly InputId[] }>
  | Readonly<{ kind: 'cancelled'; terminal: RunTerminal }>
  | Readonly<{ kind: 'terminal'; terminal: RunTerminal }>
export type ControlScope =
  | Readonly<{
      kind: 'scope'
      unassociatedWaiting?: readonly SessionCallWait[]
      producers: readonly ProducerRef[]
      revokes: readonly ('advance' | 'pending' | 'delivery')[]
      cancelsRun: RunId | null
      cascade: readonly RecoveryTask[]
      scopeRelease: boolean
    }>
  | Readonly<{ kind: 'terminal'; terminal: RunTerminal }>
  | Readonly<{ kind: 'invalid'; reason: string }>
export type IdleJudgment =
  | Readonly<{ kind: 'due' | 'not-due' | 'exempt' | 'disabled' }>
  | Readonly<{ kind: 'unavailable'; reason: string }>
export type OperationJudgment =
  | Readonly<{ kind: 'new' }>
  | Readonly<{ kind: 'recovered'; receipt: CommitReceipt }>
  | Readonly<{ kind: 'conflict'; operation: SessionOperationId }>
export type OperationRecord = Readonly<{
  operation: SessionOperationId
  digest: string
  receipt: CommitReceipt
}>
export type CommittedBatch = Readonly<{
  revision: SessionRevision
  entries: readonly HistoryEntry[]
}>
export type ReduceResult =
  | Readonly<{ kind: 'reduced'; snapshot: WorkSnapshot }>
  | Readonly<{ kind: 'quarantined'; diagnostic: string }>
/** Entries without id and revision; the storage provider assigns both at commit. */
export type EncodedEntry = Omit<HistoryEntry, 'id' | 'revision'>
export type Decision =
  | Readonly<{
      kind: 'entries'
      entries: readonly EncodedEntry[]
      /** Only entries interpretation fills it: the new continuous progress of the channel. */
      progress?: Readonly<{
        run: RunId
        execution: string
        channel: SessionEntriesChannel
        through: string
      }>
      /** The channel ordinal and delivery key of every interpreted item. */
      interpreted?: readonly Readonly<{ ordinal: string; key: string }>[]
    }>
  /** An answer-only control operation: no entry, no revision, no CommitReceipt. */
  | Readonly<{
      kind: 'control-answer'
      answer: Exclude<
        SessionControlAnswer<RunTerminal | SessionCallTerminal>,
        { kind: 'requested' }
      >
      /** The source of the fact the answer rests on: the ended terminal's evidence, or the snapshot source. */
      source: DurableEvidence
    }>
  | Readonly<{ kind: 'recovered'; receipt: CommitReceipt }>
  | Readonly<{ kind: 'rejected'; failure: SessionFailure }>
/** Transaction-bound materials. Each branch requires only its original history, compaction or management inputs. */
export type DecideReads = Readonly<{
  history?: SessionHistoryReads
  compaction: CompactionContext | null
  /** Missing material does not assert any external children or idle coverage. */
  children?: readonly SessionId[]
  idleObservation?: IdleObservation
  idleCoverage?: IdleCoverage
  frozenReceipt?: CommitReceipt
  /** Original receipts from the same committed root, required only for initialization result recall. */
  initializationReceipts?: readonly CommitReceipt[]
  /** `stopCall`: the same-root call lookup. Exactly one item must match the target. */
  calls?: readonly SessionCallLookup[]
  /** `cancelRun`: the same-root Run lookup. Exactly one item must match the target. */
  runs?: readonly SessionRunLookup[]
}>

export const OFF_PATH_DIAGNOSTIC =
  'not on the M2 first tenant path; the judgment lands with #756 (S-1b)'
export const OFF_PATH_FAILURE: Extract<SessionFailure, { kind: 'unavailable' }> = Object.freeze({
  kind: 'unavailable',
  owner: '@omne-harness/session-contract',
  diagnostic: OFF_PATH_DIAGNOSTIC,
})

function terminalOf(snapshot: WorkSnapshot): RunTerminal | null {
  return snapshot.run.kind === 'terminal' ? snapshot.run.terminal : null
}

/**
 * The advance judgment (ST08–ST11, ST20): the attempt claim compares run, attempt and `expected`,
 * not the instance (PM-01); the bounded claim compares run and `expected`; the participation
 * claim compares the execution. An archived session, a terminal Run and a stale attempt are
 * refused before the revision is compared, so a late writer learns the state that replaced it.
 */
export function judgeAdvance(snapshot: WorkSnapshot, claim: AdvanceClaim): AdvanceJudgment {
  if (snapshot.lifecycle === 'archived') return { kind: 'archived' }
  const terminal = terminalOf(snapshot)
  if (terminal !== null) return { kind: 'terminal', terminal }
  if (snapshot.run.kind !== 'active') return { kind: 'stale-advance', current: null }
  const { run } = snapshot
  switch (claim.kind) {
    case 'attempt': {
      if (claim.advance.run !== run.run) return { kind: 'stale-advance', current: run.advance }
      if (run.advance === null || run.advance.attempt !== claim.advance.attempt)
        return { kind: 'stale-advance', current: run.advance }
      if (claim.expected !== snapshot.revision)
        return { kind: 'changed', revision: snapshot.revision }
      return { kind: 'ok' }
    }
    case 'bounded': {
      if (claim.run !== run.run) return { kind: 'stale-advance', current: run.advance }
      if (claim.expected !== snapshot.revision)
        return { kind: 'changed', revision: snapshot.revision }
      return { kind: 'ok' }
    }
    case 'participation': {
      if (claim.execution !== run.execution.execution)
        return { kind: 'stale-advance', current: run.advance }
      return { kind: 'ok' }
    }
  }
}

/**
 * Where an input goes (ST03–ST05). An ordinary input of a frozen session has a destination only
 * while a Run is unfinished (I-F4); otherwise it queues for the current Run or the next one.
 */
export function routeInput(snapshot: WorkSnapshot, input: RoutedInput): RouteJudgment {
  if (snapshot.lifecycle === 'archived') return { kind: 'rejected', reason: 'archived' }
  switch (input.kind) {
    case 'ordinary': {
      if (input.input.length === 0 || input.message.blocks.length === 0)
        return { kind: 'rejected', reason: 'invalid' }
      if (snapshot.run.kind === 'active') return { kind: 'queue', destination: 'current-run' }
      if (snapshot.frozen !== null) return { kind: 'rejected', reason: 'frozen' }
      return { kind: 'queue', destination: 'next-run' }
    }
    case 'card-decision':
      return { kind: 'card', destination: input.destination }
    case 'business':
      return { kind: 'business', owner: input.owner }
  }
}

/**
 * Whether a new Run may start (ST06, I-R1, I-F2). The first eligible input is the earliest
 * pending one. `login-required` is decided by `decide` from the presence of the login-entry
 * guard material (ruling R2); the snapshot holds no login state, so this function never returns
 * it.
 */
export function judgeRunStart(snapshot: WorkSnapshot, _entry: EntryClass): RunStartJudgment {
  if (snapshot.lifecycle === 'archived') return { kind: 'archived' }
  if (snapshot.frozen !== null) return { kind: 'frozen' }
  if (snapshot.lifecycle === 'initializing') return { kind: 'not-ready' }
  if (snapshot.run.kind === 'active') return { kind: 'run-active' }
  const first = snapshot.pending[0]
  if (first === undefined) return { kind: 'no-input' }
  return { kind: 'eligible', first }
}

/**
 * The open work of one committed snapshot (EC-03, ST20, ST24b).
 */
export function openWork(snapshot: WorkSnapshot): OpenWork {
  const unassociated = (snapshot.callWaits ?? []).filter(wait =>
    snapshot.callRegistrations?.some(
      record =>
        record.consumption === wait.consumption && record.registration.kind === 'tool-intent',
    ),
  )
  return {
    unassociatedWaiting: [
      ...new Map(
        [
          ...unassociated,
          ...snapshot.controls.flatMap(control => control.pendingUnassociatedWaiting ?? []),
        ].map(wait => [waitKey(wait), wait]),
      ).values(),
    ],
    unsettledControls: [
      ...new Set(
        snapshot.controls
          .filter(
            control =>
              control.state !== 'reconciled' ||
              control.pending.length > 0 ||
              (control.pendingUnassociatedWaiting?.length ?? 0) > 0,
          )
          .map(control => control.operation),
      ),
    ],
    pending: snapshot.pending,
    handed: snapshot.handed,
    taken: snapshot.taken ?? [],
    waiting: snapshot.waiting,
    backgroundPlaceholders: snapshot.backgroundPlaceholders ?? [],
    unresolved: snapshot.unresolved,
    unreadEvents:
      snapshot.run.kind === 'active'
        ? [
            {
              execution: snapshot.run.execution.execution,
              after: snapshot.run.execution.readThrough,
            },
          ]
        : [],
  }
}

/**
 * The read-only participation in a conditional finish (PA-02): the inputs that Session accepted
 * for this Run and has not handed over block it; a cancelled terminal answers `cancelled`; another
 * terminal answers `terminal`. Without an active Run of this execution nothing of Session blocks.
 */
export function judgeCompletion(snapshot: WorkSnapshot, execution: string): CompletionJudgment {
  const terminal =
    snapshot.executions?.find(item => item.execution.execution === execution)?.terminal ??
    (snapshot.executions === undefined ? terminalOf(snapshot) : null)
  if (terminal !== null)
    return terminal.outcome === 'cancelled'
      ? { kind: 'cancelled', terminal }
      : { kind: 'terminal', terminal }
  if (snapshot.run.kind !== 'active' || snapshot.run.execution.execution !== execution)
    return { kind: 'allowed' }
  const handed = new Set(snapshot.handed)
  const pendingInputs = snapshot.pending.filter(input => !handed.has(input))
  return pendingInputs.length === 0 ? { kind: 'allowed' } : { kind: 'blocked', pendingInputs }
}

export function resolveControlScope(snapshot: WorkSnapshot, intent: ControlIntent): ControlScope {
  const control = intent.kind === 'control' ? intent.value : null
  if (control?.kind === 'unarchive') {
    if (snapshot.lifecycle !== 'archived')
      return { kind: 'invalid', reason: 'the session is not archived' }
    return {
      kind: 'scope',
      producers: [],
      revokes: [],
      cancelsRun: null,
      cascade: [],
      scopeRelease: false,
    }
  }
  if (snapshot.lifecycle === 'archived')
    return { kind: 'invalid', reason: 'the session is archived' }
  const archive = intent.kind === 'auto-archive' || control?.kind === 'archive'
  const run =
    intent.kind === 'interrupt' ? intent.run : control?.kind === 'cancel-run' ? control.run : null
  if (run !== null) {
    const old = snapshot.executions?.find(item => item.run === run)?.terminal
    if (old != null) return { kind: 'terminal', terminal: old }
    if (snapshot.run.kind === 'terminal' && snapshot.run.terminal.run === run)
      return { kind: 'terminal', terminal: snapshot.run.terminal }
    if (snapshot.run.kind !== 'active' || snapshot.run.run !== run)
      return { kind: 'invalid', reason: 'not the current Run' }
  }
  const selected =
    control?.kind === 'stop-call' || control?.kind === 'background-tool' ? control.producer : null
  const waiting = snapshot.waiting.flatMap(item =>
    item.kind === 'producer' ? [item.binding.producer] : [],
  )
  const producers =
    selected === null
      ? archive
        ? snapshot.consumptions.map(item => item.binding.producer)
        : waiting
      : snapshot.consumptions.some(item => digestOf(item.binding.producer) === digestOf(selected))
        ? [selected]
        : null
  if (producers === null) return { kind: 'invalid', reason: 'the producer is not bound' }
  const unique = [...new Map(producers.map(producer => [digestOf(producer), producer])).values()]
  return {
    kind: 'scope',
    unassociatedWaiting:
      selected !== null
        ? []
        : (snapshot.callWaits ?? []).filter(wait => {
            const registration = snapshot.callRegistrations?.find(
              record => record.consumption === wait.consumption,
            )?.registration
            if (registration?.kind !== 'tool-intent') return false
            return (
              archive ||
              (run !== null &&
                registration.initiatingAttempt !== null &&
                originalAttempt(snapshot, registration.initiatingAttempt) === run)
            )
          }),
    producers: unique,
    revokes: archive
      ? ['advance', 'pending', 'delivery']
      : control?.kind === 'cancel-run'
        ? ['advance']
        : [],
    cancelsRun:
      archive && snapshot.run.kind === 'active'
        ? snapshot.run.run
        : control?.kind === 'cancel-run'
          ? control.run
          : null,
    cascade: [],
    scopeRelease: archive,
  }
}

export function resolveCascade(
  snapshot: WorkSnapshot,
  children: readonly SessionId[],
): readonly RecoveryTask[] {
  return [...new Set(children)]
    .filter(child => child !== snapshot.session)
    .map(child => ({
      kind: 'cascade',
      child,
      parentControl: deriveSessionOperation({
        kind: 'auto-archive',
        session: snapshot.session,
        idleEvidence: snapshot.source,
      }),
      childOperation: deriveSessionOperation({
        kind: 'auto-archive',
        session: child,
        idleEvidence: snapshot.source,
      }),
      intent: { kind: 'archive' },
      basis: snapshot.source,
      state: 'pending',
    }))
}

export function judgeIdle(
  snapshot: WorkSnapshot,
  input: Readonly<{
    observation: IdleObservation
    policy: AutoArchivePolicy
    coverage: IdleCoverage
  }>,
): IdleJudgment {
  if (input.policy.kind === 'disabled') return { kind: 'disabled' }
  if (snapshot.relation?.kind === 'main' && snapshot.relation.resident) return { kind: 'exempt' }
  if (snapshot.lifecycle === 'archived' || snapshot.run.kind === 'active')
    return { kind: 'not-due' }
  if (
    snapshot.callRegistrations?.some(record => record.registration.kind === 'tool-intent') &&
    snapshot.callWaits === undefined
  )
    return { kind: 'unavailable', reason: 'original unassociated waiting projection is missing' }
  const work = openWork(snapshot)
  if (
    Object.values(work).some(items => items.length > 0) ||
    snapshot.tasks.length > 0 ||
    snapshot.controls.some(control => control.state !== 'reconciled') ||
    snapshot.consumptions.some(
      item =>
        item.results.length === 0 || item.results.some(result => result.release !== 'confirmed'),
    )
  )
    return { kind: 'not-due' }
  if (input.observation.kind !== 'interval')
    return { kind: 'unavailable', reason: 'continuous idle interval is not confirmed' }
  if (digestOf(input.coverage) !== digestOf(input.observation.coverage))
    return { kind: 'unavailable', reason: 'idle coverage changed' }
  if (!/^\d+$/u.test(input.observation.elapsedMs) || !/^\d+$/u.test(input.policy.idleMs))
    return { kind: 'unavailable', reason: 'invalid idle duration' }
  return {
    kind: BigInt(input.observation.elapsedMs) >= BigInt(input.policy.idleMs) ? 'due' : 'not-due',
  }
}

/**
 * The recall of one operation (SL07): no record is a new operation; the same identity with the
 * same normalized parameters recalls the original receipt; the same identity with other
 * parameters is a conflict that names the committed operation.
 */
export function resolveOperation(
  record: OperationRecord | null,
  operation: SessionOperationId,
  digest: string,
): OperationJudgment {
  if (record === null) return { kind: 'new' }
  if (record.operation === operation && record.digest === digest)
    return { kind: 'recovered', receipt: record.receipt }
  return { kind: 'conflict', operation: record.operation }
}

export type { GuardCommand, SessionCommand }
