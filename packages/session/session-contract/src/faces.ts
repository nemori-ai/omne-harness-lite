import type { BackgroundCallResolution, BackgroundCallView } from './background-calls.ts'
import type { ArchiveCollapse } from './call-control.ts'
import type { ContextScopeBinding } from './values.ts'
import type { RelationToReference } from './directory-relation.ts'
import type { SessionCallBinding } from './call-settlement.ts'
import type { TodoMutationReceipt, TodoPage, TodoPageCursor } from './todos.ts'
import type { JsonValue } from '@omne-harness/json-text'
import type { TenantId } from '@omne-harness/legal-identity'
import type { CompactionContext, Message, RecordEntryRef } from '@omne-harness/message'
import type { Outcome } from '@omne-harness/operation-result'
import type {
  Adoption,
  AdvanceRef,
  AgentInstanceRef,
  ConsumptionId,
  DurableEvidence,
  EntryId,
  InputId,
  Mutation,
  ResidentKey,
  RunId,
  SessionAccess,
  SessionId,
  SessionOperationId,
  SessionRevision,
  TodoItemId,
} from './identity.ts'
import type {
  ControlOperationResolution,
  SessionCallTerminal,
  SessionControlReceipt,
  SessionModelSelection,
} from './control-values.ts'
import type {
  AutoArchivePolicy,
  BoundedClose,
  CallBinding,
  Control,
  ControlProgress,
  DeclarationChange,
  DerivedMessage,
  FreezeVerdict,
  IdleObservation,
  InitializationResult,
  Participation,
  ProducedResult,
  ProducerRef,
  ResidentAdoption,
  RoutedInput,
  RunTerminal,
  ScopeReleaseDisposition,
  SessionCreation,
  SessionWaiting,
  WorkSnapshot,
  Attendance,
} from './values.ts'

import type { InputFate } from './input-fate.ts'
import type { PendingPage, WaitingCall } from './intake-reads.ts'
export type SessionFailure =
  | Readonly<{ kind: 'limited'; resource: 'pending-inputs' | 'input-bytes'; limit: number }>
  | Readonly<{ kind: 'denied'; action: string }>
  | Readonly<{ kind: 'invalid'; field: string; reason: string }>
  | Readonly<{ kind: 'todo-not-found'; item: TodoItemId }>
  | Readonly<{ kind: 'conflict'; operation: SessionOperationId }>
  | Readonly<{ kind: 'changed'; revision: SessionRevision }>
  | Readonly<{ kind: 'commit-unknown'; operation: SessionOperationId }>
  | Readonly<{ kind: 'unavailable'; owner: string; diagnostic: string }>
  | Readonly<{ kind: 'quarantined'; diagnostic: string }>
  | Readonly<{ kind: 'unsupported' }>
  | Readonly<{ kind: 'terminal'; terminal: RunTerminal }>
  | Readonly<{ kind: 'stale-advance'; current: AdvanceRef | null }>
  | Readonly<{ kind: 'frozen'; verdict: FreezeVerdict | null }>
  | Readonly<{
      kind:
        | 'archived'
        | 'no-input'
        | 'run-active'
        | 'not-ready'
        | 'login-required'
        | 'not-found'
        | 'nothing-pending'
    }>
export type Reply<T> = Promise<Outcome<T, SessionFailure>>
export type CommitReceipt = Readonly<{
  operation: SessionOperationId
  revision: SessionRevision
  first: EntryId
  last: EntryId
  recovered: boolean
  source: DurableEvidence
}>
export type OperationResolution =
  | Readonly<{ kind: 'committed'; receipt: CommitReceipt }>
  | Readonly<{ kind: 'attempt-rejected'; original: 'unknown'; reason: string }>
  | Readonly<{ kind: 'not-committed'; exclusion: DurableEvidence }>
  | Readonly<{ kind: 'unknown' }>
export type EntryClass = 'interactive' | 'dispatch'
export type StartedRun = Readonly<{
  receipt: CommitReceipt
  advance: AdvanceRef
  adopted: Adoption
  first: InputId
  execution: string
}>
export type Completion = Readonly<{
  consumption: ConsumptionId
  result: ProducedResult
  completion: DurableEvidence
}>
export type ExternalCompletion = Readonly<{
  consumption: ConsumptionId
  result: ProducedResult
  position: string
  processing: DurableEvidence
  message: Message | null
}>
export type AdmittedMessage = Readonly<{
  message: Message
  source: DurableEvidence
  admission: DurableEvidence
  consumption: ConsumptionId | null
}>

/** The inputs a step of the Agent took, with their messages, in the order of the batch. */
export type DeliveredInputs = Readonly<{
  deliveries: readonly Readonly<{ input: InputId; message: Message }>[]
  source: DurableEvidence
  admission: DurableEvidence
}>

export type StartAdoption = ResidentAdoption & Readonly<{ verdict?: FreezeVerdict }>

export interface SessionWork<P> {
  addTodo(input: Mutation<P> & Readonly<{ text: string }>): Reply<TodoMutationReceipt>
  removeTodo(input: Mutation<P> & Readonly<{ item: TodoItemId }>): Reply<TodoMutationReceipt>
  markTodoComplete(input: Mutation<P> & Readonly<{ item: TodoItemId }>): Reply<TodoMutationReceipt>
  listTodos(
    input: SessionAccess<P> & Readonly<{ after: TodoPageCursor | null; limit: number }>,
  ): Reply<TodoPage>
  accept(input: Mutation<P> & Readonly<{ value: RoutedInput }>): Reply<CommitReceipt>
  readWork(input: SessionAccess<P>): Reply<WorkSnapshot>
  readCurrentScope(input: SessionAccess<P>): Reply<ContextScopeBinding | null>
  readWaiting(input: SessionAccess<P>): Reply<SessionWaiting | null>
  /** The calls of the session in the background, each with its state asked of Tool now. */
  readBackgroundCalls(input: SessionAccess<P>): Reply<readonly BackgroundCallView[]>
  /** A short number of this session; another session's, or none, answers not-found alike. */
  resolveBackgroundCall(
    input: SessionAccess<P> & Readonly<{ id: string }>,
  ): Reply<BackgroundCallResolution>
  readCall(
    input: SessionAccess<P> & Readonly<{ producer: ProducerRef }>,
  ): Reply<SessionCallBinding | null>
  readInput(
    input: SessionAccess<P> & Readonly<{ input: InputId }>,
  ): Reply<Extract<RoutedInput, { kind: 'ordinary' }>>
  readPending(
    input: SessionAccess<P> & Readonly<{ after: EntryId | null; limit: number }>,
  ): Reply<PendingPage>
  readWaitingCalls(input: SessionAccess<P>): Reply<readonly WaitingCall[]>
  readInputFate(input: SessionAccess<P> & Readonly<{ input: InputId }>): Reply<InputFate>
  startRun(
    input: Mutation<P> &
      Readonly<{
        entry: EntryClass
        candidate: Adoption
        instance: AgentInstanceRef
        residentAdoption?: StartAdoption
      }>,
  ): Reply<StartedRun>
  claim(
    input: Mutation<P> &
      Readonly<{
        run: RunId
        instance: AgentInstanceRef
        continuity: DurableEvidence
        expected: SessionRevision
      }>,
  ): Reply<Readonly<{ receipt: CommitReceipt; advance: AdvanceRef }>>
  reload(
    input: Mutation<P> &
      Readonly<{
        run: RunId
        candidate: Adoption
        instance: AgentInstanceRef
        expected: SessionRevision
        handover: DurableEvidence
        residentAdoption?: StartAdoption
      }>,
  ): Reply<Readonly<{ receipt: CommitReceipt; advance: AdvanceRef }>>
  recordMessage(
    input: Mutation<P> &
      Readonly<{ participation: Participation; value: AdmittedMessage | DeliveredInputs }>,
  ): Reply<CommitReceipt>
  preserveResult(
    input: Mutation<P> &
      Readonly<{
        participation: Participation | null
        consumption: ConsumptionId
        result: ProducedResult
        custody: DurableEvidence
      }>,
  ): Reply<DurableEvidence>
  completeConsumption(
    input: Mutation<P> & Readonly<{ participation: Participation; completion: Completion }>,
  ): Reply<DurableEvidence>
  completeExternalConsumption(
    input: Mutation<P> &
      Readonly<{
        expected: SessionRevision
        qualification: DurableEvidence
        completion: ExternalCompletion
      }>,
  ): Reply<DurableEvidence>
  bindExternalCall(
    input: Mutation<P> &
      Readonly<{
        expected: SessionRevision
        qualification: DurableEvidence
        binding: CallBinding & Readonly<{ initiatingAttempt: null }>
      }>,
  ): Reply<Readonly<{ receipt: CommitReceipt; consumption: ConsumptionId }>>
  commitDerived(
    input:
      | (Mutation<P> &
          Readonly<{
            participation: Participation
            value: Extract<DerivedMessage, { kind: 'compaction' }>
            judgment: DurableEvidence
          }>)
      | (Mutation<P> &
          Readonly<{
            expected: SessionRevision
            value: Extract<DerivedMessage, { kind: 'context-reminder' }>
          }>),
  ): Reply<CommitReceipt>
  release(
    input: Mutation<P> &
      Readonly<{ advance: AdvanceRef; expected: SessionRevision; handover: DurableEvidence }>,
  ): Reply<CommitReceipt>
  control(input: Mutation<P> & Readonly<{ intent: Control }>): Reply<
    Readonly<{
      receipt: CommitReceipt
      progress: ControlProgress
      collapsed?: ArchiveCollapse | null
    }>
  >
  finishRun(
    input: Mutation<P> & Readonly<{ run: RunId; expected: SessionRevision; bounded: BoundedClose }>,
  ): Reply<Readonly<{ receipt: CommitReceipt; terminal: RunTerminal }>>
  queryOperation(
    input: SessionAccess<P> & Readonly<{ operation: SessionOperationId }>,
  ): Reply<OperationResolution>
  loadRecovery(input: SessionAccess<P>): Reply<WorkSnapshot>
  readModelSelection(input: SessionAccess<P>): Reply<SessionModelSelection>
  cancelRun(
    input: Mutation<P> & Readonly<{ run: RunId; urgency: 'graceful' | 'force' }>,
  ): Reply<SessionControlReceipt<RunTerminal>>
  /** Who stops is the caller class, not an input; a second stop of a call answers the first. */
  stopCall(
    input: Mutation<P> & Readonly<{ producer: ProducerRef; reason?: string | null }>,
  ): Reply<SessionControlReceipt<SessionCallTerminal>>
  retryRun(input: Mutation<P> & Readonly<{ run: RunId }>): Reply<CommitReceipt>
  queryControlOperation(
    input: SessionAccess<P> & Readonly<{ operation: SessionOperationId }>,
  ): Reply<ControlOperationResolution>
}

export interface SessionManagement<P> {
  inspectIdle(input: SessionAccess<P>): Reply<IdleObservation>
  recordIdle(
    input: Mutation<P> & Readonly<{ expected: SessionRevision; observation: IdleObservation }>,
  ): Reply<CommitReceipt>
  create(
    input: Mutation<P> & Readonly<{ creation: SessionCreation }>,
  ): Reply<Readonly<{ receipt: CommitReceipt; state: WorkSnapshot }>>
  completeInitialization(
    input: Mutation<P> & Readonly<{ result: InitializationResult }>,
  ): Reply<CommitReceipt>
  change(input: Mutation<P> & Readonly<{ declaration: DeclarationChange }>): Reply<CommitReceipt>
  setResident(input: Mutation<P> & Readonly<{ resident: boolean }>): Reply<CommitReceipt>
  configureAutoArchive(
    input: Mutation<P> & Readonly<{ policy: AutoArchivePolicy }>,
  ): Reply<CommitReceipt>
  considerAutoArchive(input: Mutation<P> & Readonly<{ idleEvidence: DurableEvidence }>): Reply<
    Readonly<{
      result: 'archived' | 'not-due' | 'exempt' | 'disabled'
      receipt: CommitReceipt | null
    }>
  >
  /** With no Run given, the current one; with no Run there, the input is taken as ordinary. */
  interrupt(
    input: Mutation<P> &
      Readonly<{
        run: RunId | null
        urgent: Extract<RoutedInput, { kind: 'ordinary' }>
        decision: DurableEvidence
      }>,
  ): Reply<Readonly<{ receipt: CommitReceipt; progress: ControlProgress | null }>>
  freeze(input: Mutation<P> & Readonly<{ verdict: FreezeVerdict }>): Reply<CommitReceipt>
}

export type ProducerFact =
  | Readonly<{
      kind: 'input-handover'
      execution: string
      input: InputId
      result:
        | Readonly<{ kind: 'accepted'; receipt: DurableEvidence }>
        | Readonly<{ kind: 'rejected'; reason: string; rejection: DurableEvidence }>
    }>
  | Readonly<{ kind: 'agent-exit'; advance: AdvanceRef; source: DurableEvidence }>
  | Readonly<{ kind: 'execution'; producer: ProducerRef; source: DurableEvidence }>
  | Readonly<{ kind: 'account'; producer: ProducerRef; source: DurableEvidence }>
  | Readonly<{
      kind: 'release'
      consumption: ConsumptionId
      result: ProducedResult
      source: DurableEvidence
    }>
  | Readonly<{
      kind: 'cascade'
      child: SessionId
      childOperation: SessionOperationId
      source: DurableEvidence
      refusal?: Readonly<{ reason: string }>
    }>
  | Readonly<{
      kind: 'routed-input'
      originalOperation: SessionOperationId
      source: DurableEvidence
    }>
  | Readonly<{
      kind: 'scope-release'
      archive: SessionOperationId
      scope: string
      dispositions: readonly ScopeReleaseDisposition[]
      source: DurableEvidence
    }>

export type PendingReason =
  | 'initialization'
  | 'unresolved'
  | 'controls'
  | 'tasks'
  | 'inputs'
  | 'run'
  | 'idle-armed'
  | 'release'
export type ResidentReference = Readonly<{
  tenant: TenantId
  session: SessionId
  capability: string
  shape: JsonValue
}>
export type ReleasedScope = Readonly<{
  tenant: TenantId
  session: SessionId
  task: SessionOperationId
  scope: string
}>
export interface SessionReconciliation<P> {
  receive(input: Mutation<P> & Readonly<{ fact: ProducerFact }>): Reply<CommitReceipt>
  pending(
    input: Readonly<{
      principal: P
      tenant: TenantId
      after: string | null
      limit: number
      reason?: PendingReason
    }>,
  ): Reply<Readonly<{ sessions: readonly SessionId[]; next: string | null }>>
  references(
    input: Readonly<{
      principal: P
      scope: 'system'
      key: ResidentKey
      after: string | null
      limit: number
    }>,
  ): Reply<Readonly<{ sessions: readonly ResidentReference[]; next: string | null }>>
  releasedScopes(
    input: Readonly<{ principal: P; scope: 'system'; after: string | null; limit: number }>,
  ): Reply<Readonly<{ scopes: readonly ReleasedScope[]; next: string | null }>>
}

export type HistoryEntry = Readonly<{
  id: EntryId
  revision: SessionRevision
  kind: string
  schema: Adoption
  payload: JsonValue
  origin: Readonly<{ owner: string; via: string | null; source: DurableEvidence }>
}>
export type HistoryPage = Readonly<{
  source: string
  interpreter: Adoption
  upper: SessionRevision
  entries: readonly HistoryEntry[]
  scannedThrough: string
  next: string | null
  exhausted: boolean
  annotations: readonly HistoryEntry[]
}>
export type ModelViewBasis = Readonly<{ epoch: string; upper: string }>
export type ModelViewRow = Readonly<{
  seq: string
  entry: EntryId
  bytes: number
  prefixDigest: string
  message: Message
}>
export type ModelViewRead =
  | Readonly<{
      kind: 'page'
      basis: ModelViewBasis
      rows: readonly ModelViewRow[]
      next: string | null
    }>
  | Readonly<{ kind: 'epoch-changed'; current: ModelViewBasis }>
export type CompactionContextRead =
  | Readonly<{ kind: 'context'; value: CompactionContext; basis: ModelViewBasis }>
  | Readonly<{ kind: 'epoch-changed'; current: ModelViewBasis }>
export type ForkPointRead =
  | Readonly<{ kind: 'point'; point: import('./fork.ts').ForkPoint }>
  | Readonly<{ kind: 'none' }>
export interface SessionHistory<P> {
  readForkPoint(input: SessionAccess<P>): Reply<ForkPointRead>
  readCompactionContext(
    input: SessionAccess<P> & Readonly<{ basis: ModelViewBasis; coverTo: RecordEntryRef | null }>,
  ): Reply<CompactionContextRead>
  begin(
    input: SessionAccess<P> &
      Readonly<{
        kinds: readonly string[]
        from: EntryId | null
        direction: 'forward' | 'backward'
        pageBytes: number
      }>,
  ): Reply<HistoryPage>
  next(input: SessionAccess<P> & Readonly<{ cursor: string }>): Reply<HistoryPage>
  since(
    input: SessionAccess<P> &
      Readonly<{ after: EntryId; kinds: readonly string[]; pageBytes: number }>,
  ): Reply<HistoryPage>
  readModelView(
    input: SessionAccess<P> &
      Readonly<{ basis: ModelViewBasis | null; after: string | null; pageBytes: number }>,
  ): Reply<ModelViewRead>
}
export type ArchivedBy = 'person' | 'auto' | 'parent'
export type SessionListRelation =
  | Readonly<{ kind: 'main' }>
  | Readonly<{ kind: 'child'; parent: SessionId }>
  | Readonly<{ kind: 'handoff'; origin: SessionId }>
export type SessionListItem = Readonly<{
  session: SessionId
  createdAt: string | null
  lastActivityAt: string | null
  lifecycle: WorkSnapshot['lifecycle']
  title: string | null
  archivedAt: string | null
  archivedBy: ArchivedBy | null
  relation: SessionListRelation
  root: SessionId
  depth: number
  attendance: Attendance
  definition: string
  toReference: RelationToReference | null
}>
export type SessionListFilter = Readonly<{
  kind?: SessionListRelation['kind']
  parent?: SessionId
  root?: SessionId
  attendance?: Attendance
  definition?: string
  toReference?: RelationToReference
}>
export type SessionListPage = Readonly<{
  items: readonly SessionListItem[]
  next: string | null
  completeness: 'complete' | 'partial'
}>
type DirectoryAccess<P> = Readonly<{
  principal: P
  tenant: TenantId
  after: string | null
  limit: number
  filter?: SessionListFilter
  reference?: SessionId
}>
export type UnarchivedLifecycle = Exclude<WorkSnapshot['lifecycle'], 'archived'>
/** A session is in exactly one of the two lists: the ones not archived, or the archived ones. */
export interface SessionDirectory<P> {
  list(
    input: DirectoryAccess<P> &
      Readonly<{ lifecycle?: UnarchivedLifecycle; titleContains?: string }>,
  ): Reply<SessionListPage>
  listArchived(
    input: DirectoryAccess<P> &
      Readonly<{
        from: string | null
        to: string | null
        by: ArchivedBy | null
        titleContains: string | null
      }>,
  ): Reply<SessionListPage>
}
export type SessionFaces<P> = Readonly<{
  work: SessionWork<P>
  management: SessionManagement<P>
  reconciliation: SessionReconciliation<P>
  history: SessionHistory<P>
}>
