// The construction ports that a provider supplies, the outbound ports that Session calls, the
// command and guard shapes that cross the transaction port, and the block declaration
// (SPEC「构造依赖端口与出站端口」,「会话块声明与设置值的固定时点」). The outbound ports carry only
// this member's values and opaque evidence: no Agent, Model or Tool type appears here. The
// superseded `ToolStartFencePort` and `DeliveryReleasePort` are not declared: the delivery release
// goes through the Agent host's result receiver (CA-06), the tool start fence is the Agent journal
// `start-fence` entry (#672 J03).
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
  IdleObservation,
  ProducedResult,
  RoutedInput,
  ScopeReleaseDisposition,
  WorkSnapshot,
} from './values.ts'
import type { ControlOperationResolution, SessionModelSelection } from './control-values.ts'
import type {
  SessionEntriesObservation,
  SessionEntriesReceipt,
  SessionEntriesStart,
} from './interpretation-values.ts'
import type {
  OperationResolution,
  PendingReason,
  SessionFailure,
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
export type ScopeReleaseReadback = Readonly<{
  dispositions: readonly ScopeReleaseDisposition[]
  source: DurableEvidence
}>
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
  | 'cancelRun'
  | 'stopCall'
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
    input: Omit<Parameters<Mutations[K]>[0], 'principal'> &
      (K extends 'commitDerived'
        ? Readonly<{
            participation?: import('./values.ts').Participation
            judgment?: DurableEvidence
            expected?: SessionRevision
          }>
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
/** The commands whose guard material the Context adoption source prepares. */
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
/** The three narrow consumption ports of the evidence bridge (XC-ADOPTSRC). They prepare guard material only. */
export interface SessionAdoptionSource {
  prepare(command: AdoptionEvidenceCommand): Reply<readonly GuardCommand[]>
}
export interface SessionProductionSource {
  prepare(command: ProductionEvidenceCommand): Reply<readonly GuardCommand[]>
}
export interface SessionCustodySource {
  prepare(command: CustodyEvidenceCommand): Reply<readonly GuardCommand[]>
}
export interface SessionTransactionPort<P> {
  /**
   * Commits one command under the explicit access of this call (SPEC「当前操作的访问裁定」). The
   * access must name the tenant and session of the command; the provider asks the access check
   * once before any effect, including the recall of an operation it already holds.
   */
  commit<K extends MutationName>(
    input: Readonly<{
      access: SessionAccess<P>
      command: Extract<SessionCommand, { kind: K }>
      guards: readonly GuardCommand[]
    }>,
  ): ReturnType<Mutations[K]>
  readWork(input: SessionAccess<P>): Reply<WorkSnapshot>
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
  /**
   * The same-log entries interpretation commit. It is not a public face method and has no access
   * check: the caller is the trusted interpreter, and the facts are already committed producer facts.
   */
  commitEntries(
    input: Readonly<{ observation: SessionEntriesObservation; start: SessionEntriesStart }>,
  ): Reply<SessionEntriesReceipt>
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
/**
 * The tenant ownership of an established session (D-AUTH r4 4.1). It proves only the tenant and the
 * established identity, and does not ask `SessionAccessCheck`. An unknown session and a session of
 * another tenant both answer `not-bound`. Only the trusted issuing closure of the assembly reads it.
 */
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
/**
 * The per-session principal of a coordinator or maintainer (D-AUTH r4 4.1). The assembly entry
 * issues it after it read `SessionPrincipalBindingSource`: `not-bound` answers `denied`; a `bound`
 * answer for another tenant or session answers `quarantined`; a failed or throwing read passes its
 * failure on (a throw as `unavailable`); a failed issue answers `unavailable` with owner `identity`.
 * No failure issues a principal.
 */
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
