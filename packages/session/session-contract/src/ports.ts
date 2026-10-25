// The construction ports that a provider supplies, the outbound ports that Session calls, the
// command and guard shapes that cross the transaction port, and the block declaration
// (SPEC「构造依赖端口与出站端口」,「会话块声明与设置值的固定时点」). The outbound ports carry only
// this member's values and opaque evidence: no Agent, Model or Tool type appears here.
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
  RunId,
  SessionAccess,
  SessionId,
  SessionOperationId,
  SessionRevision,
} from './identity.ts'
import type {
  ClockSample,
  Control,
  IdleObservation,
  ProducedResult,
  RoutedInput,
  ScopeReleaseDisposition,
  WorkSnapshot,
} from './values.ts'
import type {
  OperationResolution,
  PendingReason,
  ReleasedScope,
  Reply,
  ResidentReference,
  SessionHistory,
  SessionManagement,
  SessionReconciliation,
  SessionWork,
} from './faces.ts'

export type DriveFailure =
  | Readonly<{
      kind: 'denied' | 'busy' | 'terminal' | 'changed' | 'stale-advance' | 'unsupported' | 'conflict'
    }>
  | Readonly<{ kind: 'invalid'; reason: string; rejection: DurableEvidence }>
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
  submit(input: DriveTarget & Readonly<{ input: InputId; source: DurableEvidence }>): DriveReply<DriveReceipt>
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
        release: Readonly<{ kind: 'pending' }> | Readonly<{ kind: 'confirmed'; receipt: DurableEvidence }>
      }>,
  ): DriveReply<DriveReceipt>
  query(input: DriveTarget): DriveReply<'committed' | 'excluded' | 'unknown'>
  inspect(input: Omit<DriveTarget, 'operation'>): DriveReply<ExecutionStatus>
  /** Not called until the Agent host instance-creation entry exists (SPEC P-7). */
  prewarm(
    input: Readonly<{
      tenant: TenantId
      session: SessionId
      adoption: Adoption
      counters: DurableEvidence
    }>,
  ): DriveReply<'requested'>
}
export interface ToolStartFencePort {
  invalidate(
    input: Readonly<{
      tenant: TenantId
      session: SessionId
      operation: SessionOperationId
      scope:
        | Readonly<{ kind: 'run'; run: RunId }>
        | Readonly<{ kind: 'attempt'; advance: AdvanceRef }>
        | Readonly<{ kind: 'session' }>
      revision: SessionRevision
    }>,
  ): Promise<'effective' | 'pending' | 'unavailable' | 'commit-unknown'>
}
export type ScopeReleaseReadback = Readonly<{
  dispositions: readonly ScopeReleaseDisposition[]
  source: DurableEvidence
}>
export interface DeliveryReleasePort {
  /** Model ACK or Tool delivery release for one result version, with the custody or completion evidence. */
  release(
    input: Readonly<{
      tenant: TenantId
      session: SessionId
      operation: SessionOperationId
      consumption: ConsumptionId
      result: ProducedResult
      evidence: DurableEvidence
    }>,
  ): Promise<
    | Readonly<{ kind: 'confirmed'; source: DurableEvidence }>
    | Readonly<{ kind: 'not-ready' | 'unavailable' | 'commit-unknown' }>
  >
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
  | 'setRelation'
  | 'configureAutoArchive'
  | 'considerAutoArchive'
  | 'recordIdle'
  | 'interrupt'
  | 'freeze'
  | 'receive'
/** The mutation methods of the three faces, with the principal erased. */
export type Mutations = Pick<
  SessionWork<never> & SessionManagement<never> & SessionReconciliation<never>,
  MutationName
>
export type SessionCommand = {
  readonly [K in MutationName]: Readonly<{
    kind: K
    input: Omit<Parameters<Mutations[K]>[0], 'principal'>
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
export interface SessionEvidenceBridge {
  prepare(command: SessionCommand): Reply<readonly GuardCommand[]>
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
export interface SessionTransactionPort<P> {
  commit<K extends MutationName>(
    input: Readonly<{ command: Extract<SessionCommand, { kind: K }>; guards: readonly GuardCommand[] }>,
  ): ReturnType<Mutations[K]>
  readWork(input: SessionAccess<P>): Reply<WorkSnapshot>
  readInput(
    input: SessionAccess<P> & Readonly<{ input: InputId }>,
  ): Reply<Extract<RoutedInput, { kind: 'ordinary' }>>
  queryOperation(
    input: SessionAccess<P> & Readonly<{ operation: SessionOperationId }>,
  ): Reply<OperationResolution>
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
/** Principals the application assembly issues for commands that Session's own coordinators and schedulers submit. The identity bridge verifies them. */
export type SessionInternalPrincipals<P> = Readonly<{ coordinator: P; maintainer: P }>
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
