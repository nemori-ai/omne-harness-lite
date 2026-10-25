// The nine pure domain services and the shapes they share with `decide` and `reduce`
// (SPEC「领域服务与归约」). Inputs are the work snapshot and command parameters only: no time,
// random number, connection or outside state. The outcome sets are closed discriminated unions.
//
// Support in this member (card #536 revision 5): the services that the first tenant path calls
// (`judgeAdvance`, `routeInput`, `judgeRunStart`, `openWork`, `judgeCompletion`,
// `resolveOperation`) are implemented to the SPEC. `resolveControlScope`, `resolveCascade` and
// `judgeIdle` serve only off-path commands and answer with the `unavailable` or `invalid` outcome
// that names #756; `resolveCascade` has neither outcome and throws, so a caller cannot mistake
// an empty cascade for a judged one.
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
/** Seven parts, all derived from the snapshot. taken: inputs the Agent took with no model call registered (SE18) after them, so no model request has read them yet. unreadEvents: Agent events after readThrough count as open work. */
export type OpenWork = Readonly<{
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
  | Readonly<{ kind: 'entries'; entries: readonly EncodedEntry[] }>
  | Readonly<{ kind: 'recovered'; receipt: CommitReceipt }>
  | Readonly<{ kind: 'rejected'; failure: SessionFailure }>
/** History the storage participant reads inside the transaction. Only commitDerived(compaction) needs it; null otherwise. open holds the entry references of the open work that openWork names. */
export type DecideReads = Readonly<{ compaction: CompactionContext | null }>

/** The diagnostic of every outcome that this member leaves to card #756 (S-1b). */
export const OFF_PATH_DIAGNOSTIC =
  'not on the M2 first tenant path; the judgment lands with #756 (S-1b)'
/** The `unavailable` failure of an off-path command: the owner is this member, the diagnostic names #756. */
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
 * pending one. `login-required` is the verdict of the evidence bridge's login confirmation; the
 * snapshot holds no login state, so this function never returns it (see the SPEC status line).
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
 * The open work of one snapshot (EC-03, ST20, ST24b). `taken` and `backgroundPlaceholders` need
 * SE18 and SE21, which the first path does not write; they are empty until #756 lands them.
 */
export function openWork(snapshot: WorkSnapshot): OpenWork {
  return {
    pending: snapshot.pending,
    handed: snapshot.handed,
    taken: [],
    waiting: snapshot.waiting,
    backgroundPlaceholders: [],
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
  const terminal = terminalOf(snapshot)
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

export function resolveControlScope(_snapshot: WorkSnapshot, _intent: ControlIntent): ControlScope {
  return { kind: 'invalid', reason: OFF_PATH_DIAGNOSTIC }
}

export function resolveCascade(
  _snapshot: WorkSnapshot,
  _children: readonly SessionId[],
): readonly RecoveryTask[] {
  throw new Error(`resolveCascade: ${OFF_PATH_DIAGNOSTIC}`)
}

export function judgeIdle(
  _snapshot: WorkSnapshot,
  _input: Readonly<{
    observation: IdleObservation
    policy: AutoArchivePolicy
    coverage: IdleCoverage
  }>,
): IdleJudgment {
  return { kind: 'unavailable', reason: OFF_PATH_DIAGNOSTIC }
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
