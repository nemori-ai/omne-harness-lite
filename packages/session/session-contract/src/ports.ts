import type { ContextScopeBinding } from './values.ts'
import type { SessionCallBinding } from './call-settlement.ts'
import type { JsonValue } from '@omne-harness/json-text'
import type { TenantId } from '@omne-harness/legal-identity'
import type { Outcome } from '@omne-harness/operation-result'
import type {
  Adoption,
  AdvanceRef,
  ConsumptionId,
  DurableEvidence,
  InputId,
  ResidentKey,
  SessionAccess,
  SessionId,
  SessionOperationId,
  SessionRevision,
} from './identity.ts'
import type {
  ClockSample,
  Control,
  FreezeVerdict,
  IdleObservation,
  ProducedResult,
  ProducerRef,
  ResidentAdoption,
  RoutedInput,
  ScopeReleaseDisposition,
  WorkSnapshot,
} from './values.ts'
import type { BackgroundCallState } from './background-calls.ts'
import type { ControlOperationResolution, SessionModelSelection } from './control-values.ts'
import type {
  SessionEntriesObservation,
  SessionEntriesReceipt,
  SessionEntriesStart,
  SessionLogCommitObservation,
  SessionLogReceipt,
} from './interpretation-values.ts'
import type {
  OperationResolution,
  PendingReason,
  SessionFailure,
  ReleasedScope,
  Reply,
  ResidentReference,
  SessionDirectory,
  SessionHistory,
  SessionManagement,
  SessionReconciliation,
  SessionWork,
} from './faces.ts'

export type DriveFailure =
  | Readonly<{
      kind:
        | 'denied'
        | 'busy'
        | 'terminal'
        | 'changed'
        | 'stale-advance'
        | 'unsupported'
        | 'conflict'
    }>
  | Readonly<{ kind: 'invalid'; reason: string; rejection: DurableEvidence }>
  | Readonly<{
      kind: 'refused'
      failure: 'invalid' | 'unsupported'
      field: string | null
      reason: string | null
    }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>
  | Readonly<{ kind: 'commit-unknown'; operation: string }>
export type DriveReply<T> = Promise<Outcome<T, DriveFailure>>
export type DriveTarget = Readonly<{
  tenant: TenantId
  session: SessionId
  execution: string
  operation: string
}>
export type DriveReceipt = Readonly<{ revision: string; evidence: DurableEvidence }>
export type ExecutionStatus = Readonly<{
  revision: string | null
  state: 'missing' | 'open' | 'suspended' | 'ended'
  attachment: 'active' | 'detached' | 'superseded' | null
  lost: DurableEvidence | null
  conclusion: Readonly<{
    outcome: 'complete' | 'fail' | 'cancelled'
    cause: DurableEvidence | null
    disposition: DurableEvidence
  }> | null
  evidence: DurableEvidence
}>
export interface AgentDrivePort {
  invoke(
    input: DriveTarget &
      Readonly<{ first: InputId; source: DurableEvidence; grant: DurableEvidence }>,
  ): DriveReply<DriveReceipt>
  submit(
    input: DriveTarget & Readonly<{ input: InputId; source: DurableEvidence }>,
  ): DriveReply<DriveReceipt>
  resume(
    input: DriveTarget & Readonly<{ recovery: DurableEvidence; grant: DurableEvidence }>,
  ): DriveReply<DriveReceipt>
  control(
    input: DriveTarget & Readonly<{ control: SessionOperationId; intent: Control }>,
  ): DriveReply<DriveReceipt>
  detach(input: DriveTarget & Readonly<{ advance: AdvanceRef }>): DriveReply<DurableEvidence>
  recordResult(
    input: DriveTarget &
      Readonly<{
        consumption: ConsumptionId
        result: ProducedResult
        transfer:
          | Readonly<{ kind: 'custody'; retained: DurableEvidence }>
          | Readonly<{ kind: 'processed'; completion: DurableEvidence }>
          | Readonly<{ kind: 'none' }>
        release:
          | Readonly<{ kind: 'pending' }>
          | Readonly<{ kind: 'confirmed'; receipt: DurableEvidence }>
      }>,
  ): DriveReply<DriveReceipt>
  query(input: DriveTarget): DriveReply<'committed' | 'excluded' | 'unknown'>
  inspect(input: Omit<DriveTarget, 'operation'>): DriveReply<ExecutionStatus>
  prewarm(
    input: Readonly<{
      tenant: TenantId
      session: SessionId
      adoption: Adoption
      counters: DurableEvidence
    }>,
  ): DriveReply<'requested'>
}
export type ScopeReleaseReadback = Readonly<{
  dispositions: readonly ScopeReleaseDisposition[]
  source: DurableEvidence
}>
// Controls by reference a call no step waits on. `recorded`: Tool holds the control (a resend
// recalls it); `ended`: the call already settled. Neither is a physical stop.
export interface SessionCallControl {
  control(
    input: Readonly<{
      tenant: TenantId
      session: SessionId
      control: SessionOperationId
      producer: Extract<ProducerRef, { kind: 'tool' }>
      intent: 'stop' | 'withdraw'
    }>,
  ): Reply<'recorded' | 'ended'>
}
/** Session asks the called side for the state of one call by its reference; it keeps none of it. */
export interface SessionCallStates {
  read(
    input: Readonly<{
      tenant: TenantId
      session: SessionId
      producer: Extract<ProducerRef, { kind: 'tool' }>
    }>,
  ): Reply<BackgroundCallState>
}
export interface ScopeReleasePort {
  release(
    input: Readonly<{
      tenant: TenantId
      session: SessionId
      task: SessionOperationId
      scope: string
    }>,
  ): Promise<ScopeReleaseReadback>
}
export type SessionBlockDeclaration = Readonly<{
  name: 'session.modes'
  kind: 'supplied'
  recovery: 'persisted'
  volatility: 'stable'
  consumers: readonly ('model' | 'coordinator')[]
  schema: Adoption
}>

export type MutationName =
  | 'addTodo'
  | 'removeTodo'
  | 'markTodoComplete'
  | 'accept'
  | 'startRun'
  | 'claim'
  | 'reload'
  | 'recordMessage'
  | 'preserveResult'
  | 'completeConsumption'
  | 'completeExternalConsumption'
  | 'bindExternalCall'
  | 'commitDerived'
  | 'release'
  | 'control'
  | 'finishRun'
  | 'create'
  | 'completeInitialization'
  | 'change'
  | 'setResident'
  | 'configureAutoArchive'
  | 'considerAutoArchive'
  | 'recordIdle'
  | 'interrupt'
  | 'cancelRun'
  | 'stopCall'
  | 'retryRun'
  | 'freeze'
  | 'receive'
export type Mutations = Pick<
  SessionWork<never> & SessionManagement<never> & SessionReconciliation<never>,
  MutationName
>
export type SessionCommand = {
  readonly [K in MutationName]: Readonly<{
    kind: K
    input: Omit<Parameters<Mutations[K]>[0], 'principal'> &
      (K extends 'commitDerived'
        ? Readonly<{
            participation?: import('./values.ts').Participation
            judgment?: DurableEvidence
            expected?: SessionRevision
          }>
        : K extends 'stopCall'
          ? Readonly<{ initiator?: import('./background-calls.ts').StopInitiator }>
          : unknown)
  }>
}[MutationName]
export type GuardCommand = Readonly<{
  owner: string
  participant: string
  protocol: Adoption
  facts: JsonValue
}>
export interface SessionIdentityBridge<P> {
  prepare(input: SessionAccess<P>, command: SessionCommand): Reply<GuardCommand>
}
export interface SessionEvidenceBridge<P = unknown> {
  prepare(command: SessionCommand, access?: SessionAccess<P>): Reply<readonly GuardCommand[]>
}
export interface SessionClock {
  sample(): Reply<ClockSample>
  waitUntil(instant: string, signal: AbortSignal): Promise<'elapsed' | 'cancelled'>
}
export interface SessionIdleInput<P> {
  inspect(input: SessionAccess<P> & Readonly<{ time: ClockSample }>): Reply<IdleObservation>
  prepare(
    input: SessionAccess<P>,
    command: Extract<SessionCommand, { kind: 'recordIdle' | 'considerAutoArchive' }>,
  ): Reply<readonly GuardCommand[]>
}
export interface SessionContextInput<P> {
  prepare(
    input: SessionAccess<P>,
    command: Extract<SessionCommand, { kind: 'create' | 'change' | 'startRun' | 'reload' }>,
  ): Reply<readonly GuardCommand[]>
}
export type AdoptionEvidenceCommand = Extract<
  SessionCommand,
  { kind: 'create' | 'startRun' | 'reload' | 'completeInitialization' | 'change' | 'freeze' }
>
export type ProductionEvidenceCommand = Extract<
  SessionCommand,
  { kind: 'receive' | 'preserveResult' | 'completeInitialization' }
>
export type CustodyEvidenceCommand = Extract<
  SessionCommand,
  { kind: 'preserveResult' | 'completeConsumption' | 'completeExternalConsumption' }
>
export type SessionAdoptionRecorded = Readonly<{
  capability: string
  key: string
  shape: JsonValue
}>
export type SessionAdoptionPlanInput = Readonly<{
  recorded: readonly SessionAdoptionRecorded[]
  capabilities: readonly string[]
}>
export type SessionAdoptionPlanAnswer = Readonly<{
  material: ResidentAdoption
  verdict: FreezeVerdict | null
}>
export interface SessionAdoptionSource<P = unknown> {
  prepare(
    command: AdoptionEvidenceCommand,
    access?: SessionAccess<P>,
  ): Reply<readonly GuardCommand[]>
  plan?: (
    access: SessionAccess<P>,
    input: SessionAdoptionPlanInput,
  ) => Promise<Outcome<SessionAdoptionPlanAnswer, Readonly<{ kind: 'unavailable' }>>>
}
export interface SessionProductionSource {
  prepare(command: ProductionEvidenceCommand): Reply<readonly GuardCommand[]>
}
export interface SessionCustodySource {
  prepare(command: CustodyEvidenceCommand): Reply<readonly GuardCommand[]>
}
export interface SessionTransactionPort<P> {
  commit<K extends MutationName>(
    input: Readonly<{
      access: SessionAccess<P>
      command: Extract<SessionCommand, { kind: K }>
      guards: readonly GuardCommand[]
    }>,
  ): ReturnType<Mutations[K]>
  readWork(input: SessionAccess<P>): Reply<WorkSnapshot>
  readCurrentScope(input: SessionAccess<P>): Reply<ContextScopeBinding | null>
  /** The binding of the call of one producer, in the snapshot or after it left; null when there is none. */
  readCall(
    input: SessionAccess<P> & Readonly<{ producer: ProducerRef }>,
  ): Reply<SessionCallBinding | null>
  readInput(
    input: SessionAccess<P> & Readonly<{ input: InputId }>,
  ): Reply<Extract<RoutedInput, { kind: 'ordinary' }>>
  queryOperation(
    input: SessionAccess<P> & Readonly<{ operation: SessionOperationId }>,
  ): Reply<OperationResolution>
  readModelSelection(input: SessionAccess<P>): Reply<SessionModelSelection>
  queryControlOperation(
    input: SessionAccess<P> & Readonly<{ operation: SessionOperationId }>,
  ): Reply<ControlOperationResolution>
  commitEntries(
    input: Readonly<{ observation: SessionEntriesObservation; start: SessionEntriesStart }>,
  ): Reply<SessionEntriesReceipt>
  commitLog?: (
    input: Readonly<{ observation: SessionLogCommitObservation }>,
  ) => Reply<SessionLogReceipt>
  readonly history: SessionHistory<P>
  pending(
    input: Readonly<{
      principal: P
      tenant: TenantId
      after: string | null
      limit: number
      reason?: PendingReason
    }>,
  ): Reply<Readonly<{ sessions: readonly SessionId[]; next: string | null }>>
  readonly directory?: SessionDirectory<P>
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
export type SessionInternalPrincipals<P> = Readonly<{ coordinator: P; maintainer: P }>
export interface SessionPrincipalBindingSource {
  read(
    input: Readonly<{ tenant: TenantId; session: SessionId }>,
  ): Promise<
    Outcome<
      | Readonly<{ kind: 'bound'; tenant: TenantId; session: SessionId; source: DurableEvidence }>
      | Readonly<{ kind: 'not-bound' }>,
      Extract<SessionFailure, { kind: 'unavailable' | 'quarantined' }>
    >
  >
}
export interface SessionScopeOwnerSource {
  lookup(
    input: Readonly<{ scope: string }>,
  ): Promise<
    Outcome<
      | Readonly<{ kind: 'owned'; tenant: TenantId; session: SessionId; generation: string }>
      | Readonly<{ kind: 'unknown' }>,
      Extract<SessionFailure, { kind: 'unavailable' }>
    >
  >
}
export interface SessionWorkPrincipals<P> {
  forSession(
    input: Readonly<{ actor: 'coordinator' | 'maintainer'; tenant: TenantId; session: SessionId }>,
  ): Promise<
    Outcome<P, Extract<SessionFailure, { kind: 'denied' | 'unavailable' | 'quarantined' }>>
  >
}
export interface SessionNotifier {
  committed(
    input: Readonly<{
      tenant: TenantId
      session: SessionId
      revision: SessionRevision
      source: DurableEvidence
      kinds: readonly string[]
    }>,
  ): Promise<void>
}
