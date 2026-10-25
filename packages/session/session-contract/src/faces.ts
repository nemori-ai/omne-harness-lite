// The four caller faces and their results (SPEC「四个面与公开操作」). Behavior, eligibility and
// recall are in the SPEC; this file gives the shapes only.
import type { JsonValue } from '@omne-harness/json-text'
import type { TenantId } from '@omne-harness/legal-identity'
import type { Message } from '@omne-harness/message'
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
} from './identity.ts'
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
  InputBatch,
  Participation,
  ProducedResult,
  ProducerRef,
  Relation,
  RoutedInput,
  RunTerminal,
  ScopeReleaseDisposition,
  SessionCreation,
  Waiting,
  WorkSnapshot,
} from './values.ts'

export type SessionFailure =
  | Readonly<{ kind: 'denied'; action: string }>
  | Readonly<{ kind: 'invalid'; field: string; reason: string }>
  | Readonly<{ kind: 'conflict'; operation: SessionOperationId }>
  | Readonly<{ kind: 'changed'; revision: SessionRevision }>
  | Readonly<{ kind: 'commit-unknown'; operation: SessionOperationId }>
  | Readonly<{ kind: 'unavailable'; owner: string; diagnostic: string }>
  | Readonly<{ kind: 'quarantined'; diagnostic: string }>
  | Readonly<{ kind: 'terminal'; terminal: RunTerminal }>
  | Readonly<{ kind: 'stale-advance'; current: AdvanceRef | null }>
  | Readonly<{ kind: 'frozen'; verdict: FreezeVerdict | null }>
  | Readonly<{ kind: 'archived' | 'no-input' | 'run-active' | 'not-ready' | 'login-required' }>
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
/** The processed hand-over of one result version. The message, if any, arrives by the message hand-over. */
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

export interface SessionWork<P> {
  accept(input: Mutation<P> & Readonly<{ value: RoutedInput }>): Reply<CommitReceipt>
  readWork(input: SessionAccess<P>): Reply<WorkSnapshot>
  readInput(
    input: SessionAccess<P> & Readonly<{ input: InputId }>,
  ): Reply<Extract<RoutedInput, { kind: 'ordinary' }>>
  startRun(
    input: Mutation<P> &
      Readonly<{ entry: EntryClass; candidate: Adoption; instance: AgentInstanceRef }>,
  ): Reply<StartedRun>
  claim(
    input: Mutation<P> &
      Readonly<{ run: RunId; instance: AgentInstanceRef; continuity: DurableEvidence }>,
  ): Reply<Readonly<{ receipt: CommitReceipt; advance: AdvanceRef }>>
  reload(
    input: Mutation<P> &
      Readonly<{
        run: RunId
        candidate: Adoption
        instance: AgentInstanceRef
        expected: SessionRevision
        handover: DurableEvidence
      }>,
  ): Reply<Readonly<{ receipt: CommitReceipt; advance: AdvanceRef }>>
  recordMessage(
    input: Mutation<P> & Readonly<{ participation: Participation; value: AdmittedMessage }>,
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
  control(
    input: Mutation<P> & Readonly<{ intent: Control }>,
  ): Reply<Readonly<{ receipt: CommitReceipt; progress: ControlProgress }>>
  finishRun(
    input: Mutation<P> & Readonly<{ run: RunId; expected: SessionRevision; bounded: BoundedClose }>,
  ): Reply<Readonly<{ receipt: CommitReceipt; terminal: RunTerminal }>>
  queryOperation(
    input: SessionAccess<P> & Readonly<{ operation: SessionOperationId }>,
  ): Reply<OperationResolution>
  loadRecovery(input: SessionAccess<P>): Reply<WorkSnapshot>
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
  setRelation(input: Mutation<P> & Readonly<{ relation: Relation }>): Reply<CommitReceipt>
  configureAutoArchive(
    input: Mutation<P> & Readonly<{ policy: AutoArchivePolicy }>,
  ): Reply<CommitReceipt>
  considerAutoArchive(input: Mutation<P> & Readonly<{ idleEvidence: DurableEvidence }>): Reply<
    Readonly<{
      result: 'archived' | 'not-due' | 'exempt' | 'disabled'
      receipt: CommitReceipt | null
    }>
  >
  interrupt(
    input: Mutation<P> &
      Readonly<{
        run: RunId
        urgent: Extract<RoutedInput, { kind: 'ordinary' }>
        decision: DurableEvidence
      }>,
  ): Reply<Readonly<{ receipt: CommitReceipt; progress: ControlProgress }>>
  /** Idempotent by state: a frozen session returns the original receipt with recovered = true. */
  freeze(input: Mutation<P> & Readonly<{ verdict: FreezeVerdict }>): Reply<CommitReceipt>
}

export type AgentEventFact =
  | Readonly<{ kind: 'input-taken'; batch: InputBatch }>
  | Readonly<{ kind: 'waiting'; waits: readonly Waiting[] }>
  | Readonly<{ kind: 'producer'; result: ProducedResult; consumption: ConsumptionId }>
  | Readonly<{
      kind: 'control'
      control: SessionOperationId
      stage:
        | 'intent-established'
        | 'qualification-revoked'
        | 'producer-confirmed'
        | 'physically-stopped'
        | 'duty-released'
      state: 'reached' | 'unresolved'
    }>
  | Readonly<{
      kind: 'ended'
      conclusion: 'complete' | 'fail' | 'cancelled'
      cause: DurableEvidence | null
      disposition: DurableEvidence
    }>
export type ProducerFact =
  | Readonly<{
      kind: 'agent-event'
      execution: string
      sequence: string | null
      attachment: string
      source: DurableEvidence
      body: AgentEventFact
    }>
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
    }>
  | Readonly<{ kind: 'routed-input'; originalOperation: SessionOperationId; source: DurableEvidence }>
  | Readonly<{
      kind: 'scope-release'
      archive: SessionOperationId
      scope: string
      dispositions: readonly ScopeReleaseDisposition[]
      source: DurableEvidence
    }>
  | Readonly<{
      kind: 'start-fence'
      operation: SessionOperationId
      advance: AdvanceRef
      source: DurableEvidence
    }>

/** Every value is decided from the snapshot alone, so the index stays exact at commit time. unresolved: unknown operations; controls: a control stays propagating; tasks: tasks non-empty; inputs: pending inputs non-empty; run: an unfinished Run exists; idle-armed: auto-archive is enabled, not exempt, and no Run is unfinished, so the scanner asks judgeIdle whether it is due; release: a preserved or processed result still waits for delivery release. */
export type PendingReason =
  | 'unresolved'
  | 'controls'
  | 'tasks'
  | 'inputs'
  | 'run'
  | 'idle-armed'
  | 'release'
/** One session that references a resident key. Carries the first-loaded shape, never the definition body. */
export type ResidentReference = Readonly<{
  tenant: TenantId
  session: SessionId
  capability: string
  shape: JsonValue
}>
/** One scope that an archive released, read back from SE25. task is the original scope-release operation. */
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
  /** System scope. No SessionAccess<P>: the query spans tenants and returns identities and shapes only. */
  references(
    input: Readonly<{
      principal: P
      scope: 'system'
      key: ResidentKey
      after: string | null
      limit: number
    }>,
  ): Reply<Readonly<{ sessions: readonly ResidentReference[]; next: string | null }>>
  /** System scope. Pages through scopes that archives released, for re-release after an execution-environment provider change. */
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
  /** SE33 entries committed up to upper whose target lies in this page but which are not in entries. */
  annotations: readonly HistoryEntry[]
}>
/** One model-visible sequence between two compactions. upper is the last row committed when the basis was taken. */
export type ModelViewBasis = Readonly<{ epoch: string; upper: string }>
export type ModelViewRow = Readonly<{
  seq: string
  entry: EntryId
  bytes: number
  prefixDigest: string
  message: Message
}>
export type ModelViewRead =
  | Readonly<{ kind: 'page'; basis: ModelViewBasis; rows: readonly ModelViewRow[]; next: string | null }>
  | Readonly<{ kind: 'epoch-changed'; current: ModelViewBasis }>
export interface SessionHistory<P> {
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
  /** basis null reads the current epoch. A basis whose epoch is no longer current returns epoch-changed. */
  readModelView(
    input: SessionAccess<P> &
      Readonly<{ basis: ModelViewBasis | null; after: string | null; pageBytes: number }>,
  ): Reply<ModelViewRead>
}
/** The four faces as one value. The Cordis abstract class SessionService in session-cordis-contract exposes them under the key `session`. */
export type SessionFaces<P> = Readonly<{
  work: SessionWork<P>
  management: SessionManagement<P>
  reconciliation: SessionReconciliation<P>
  history: SessionHistory<P>
}>
