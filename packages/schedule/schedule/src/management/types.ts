import type {
  ScheduleAdoptedBasis,
  ScheduleAuthor,
  ScheduleCallContext,
  ScheduleCandidate,
  ScheduleCommand,
  ScheduleConsentAdoption,
  ScheduleCreateRequest,
  ScheduleDefinition,
  ScheduleDomainError,
  ScheduleFingerprint,
  ScheduleId,
  ScheduleInstant,
  ScheduleListPage,
  ScheduleListRequest,
  ScheduleOperationAddress,
  ScheduleOperationLocator,
  ScheduleOperationRef,
  ScheduleOperationView,
  ScheduleOwner,
  SchedulePage,
  ScheduleRevisionsRequest,
  ScheduleRevisionView,
  ScheduleStanding,
  ScheduleView,
} from '@omne-harness/schedule-contract'
type Ref = string
export type ManagementRequest =
  | Readonly<{ kind: 'create'; input: ScheduleCreateRequest }>
  | Readonly<{ kind: 'execute'; input: ScheduleCommand }>

/** Derived only after the identity adapter verifies the original context. */
export type RecoveryScope = Readonly<{
  owner: ScheduleOwner
  principalRef: Ref
  actor: ScheduleCallContext['actor']
  originatingSessionRef: Ref | null
}>
export type OperationIdentity = Readonly<{
  scope: RecoveryScope
  address: ScheduleOperationAddress
  fingerprint: ScheduleFingerprint
  operationRef: ScheduleOperationRef
}>
export type ConsentLock =
  | Readonly<{ kind: 'clear' }>
  | Readonly<{ kind: 'reconfirmationRequired'; grantRef: Ref; revokedGeneration: number }>
export type QuotaHolding =
  | Readonly<{ kind: 'transferred'; reservationRef: Ref; successorId: ScheduleId }>
  | Readonly<{ kind: 'held'; reservationRef: Ref }>
  | Readonly<{ kind: 'released'; releaseRef: Ref }>
export type ScheduleRecord = Readonly<{
  view: ScheduleView
  activationExclusive: ScheduleInstant | null
  consentLock: ConsentLock
  quota: QuotaHolding
  adoptedBasis: ScheduleAdoptedBasis | null
  definitionRef: Ref
}>
export type RevisionRecord = Readonly<{
  view: ScheduleRevisionView
  revision: number
  beforeRecordRef: Ref | null
  afterRecordRef: Ref
}>
export type ReadResult<T> =
  | Readonly<{ kind: 'ok'; value: T }>
  | Readonly<{ kind: 'absent' }>
  | Readonly<{ kind: 'changed' }>
  | Readonly<{ kind: 'unavailable'; error: ScheduleDomainError }>

/** Facts owned by the identity adapter, never inferred from actor.kind alone. */
export type ManagementAuthority = Readonly<{
  scope: RecoveryScope
  authorOnCreate: ScheduleAuthor
  role: 'owner' | 'author' | 'system'
  authorityVersion: Ref
  guardRef: Ref
}>
export type ConsentObservation =
  | Readonly<{ kind: 'notRequired'; guardRef: Ref }>
  | Readonly<{
      kind: 'adopt'
      adoption: ScheduleConsentAdoption
      guardRef: Ref
    }>
  | Readonly<{ kind: 'retain'; adoption: ScheduleConsentAdoption | null; guardRef: Ref }>
export type ManagementAccess = Readonly<{
  authority: ManagementAuthority
  consent: ConsentObservation
  currentStanding: ScheduleStanding
  consentLock: ConsentLock
}>
export interface ManagementAuthorizer {
  authorize(
    input: Readonly<{
      context: ScheduleCallContext
      request: ManagementRequest
      current: ScheduleRecord | null
      fingerprint: ScheduleFingerprint
    }>,
  ): Promise<ReadResult<ManagementAccess>>
  authorizeRecovery(
    input: Readonly<{
      context: ScheduleCallContext
      locator: ScheduleOperationLocator
    }>,
  ): Promise<ReadResult<RecoveryScope>>
}

/** A validated definition plus bounded computation, not Calendar private state. */
export type DefinitionObservation =
  | Readonly<{ kind: 'notNeeded' }>
  | Readonly<{
      kind: 'resolved'
      definition: ScheduleDefinition
      basis: ScheduleAdoptedBasis
      next: ScheduleCandidate | null
      complete: true
      referenceExclusive: ScheduleInstant
      basisGuardRef: Ref
    }>
export interface ManagementDefinitionResolver {
  resolve(
    input: Readonly<{
      context: ScheduleCallContext
      definition: ScheduleDefinition
      definitionRevision: number
      referenceExclusive: ScheduleInstant
      activationExclusive: ScheduleInstant | null
      eligibleConsumed: number
      acceptedJobCount: number
    }>,
  ): Promise<ReadResult<Exclude<DefinitionObservation, { kind: 'notNeeded' }>>>
}
export type QuotaEffect =
  | Readonly<{ kind: 'none' }>
  | Readonly<{
      kind: 'reserve'
      owner: ScheduleOwner
      author: ScheduleAuthor
      scheduleId: ScheduleId
    }>
  | Readonly<{ kind: 'release'; reservationRef: Ref; scheduleId: ScheduleId }>
  | Readonly<{
      kind: 'transfer'
      reservationRef: Ref
      predecessorId: ScheduleId
      successorId: ScheduleId
      owner: ScheduleOwner
      author: ScheduleAuthor
    }>
export type QuotaObservation = Readonly<{
  guardRef: Ref
  resultingHolding: QuotaHolding | null
}>
export interface ManagementQuotaReader {
  inspect(
    input: Readonly<{
      operation: OperationIdentity
      request: ManagementRequest
      current: ScheduleRecord | null
      author: ScheduleAuthor
      allocatedId: ScheduleId | null
    }>,
  ): Promise<ReadResult<QuotaObservation>>
}
export type ManagementDecisionInput = Readonly<{
  requestId: string
  operation: OperationIdentity
  request: ManagementRequest
  current: ScheduleRecord | null
  access: ManagementAccess
  definition: DefinitionObservation
  now: ScheduleInstant
  allocatedId: ScheduleId | null
  quotaObservation: QuotaObservation
}>
export type ManagementMutation =
  | Readonly<{ kind: 'insert'; next: ScheduleRecord }>
  | Readonly<{ kind: 'update'; expectedRevision: number; next: ScheduleRecord }>
  | Readonly<{
      kind: 'replace'
      expectedRevision: number
      predecessor: ScheduleRecord
      successor: ScheduleRecord
    }>
  | Readonly<{ kind: 'noChange'; expectedRevision: number; current: ScheduleRecord }>
export type ManagementDecision =
  | Readonly<{ kind: 'rejected'; error: ScheduleDomainError }>
  | Readonly<{
      kind: 'save'
      mutation: ManagementMutation
      result: ScheduleView
      quota: QuotaEffect
      revisions: readonly RevisionRecord[]
      events: readonly Readonly<{
        kind: 'scheduleManagementChanged'
        scheduleId: ScheduleId
        revision: number
        operationRef: ScheduleOperationRef
      }>[]
    }>

/** Command is data. The worker recomputes the decision from its locked current record. */
export type ManagementCommit = Readonly<{
  kind: 'saveDefinition' | 'replaceDefinition'
  input: ManagementDecisionInput
}>
export type PersistenceResult =
  | Readonly<{
      kind: 'recorded'
      view: Extract<ScheduleOperationView, { kind: 'committed' | 'noChange' }>
      replayed: boolean
    }>
  | Readonly<{ kind: 'unknown'; operationRef: ScheduleOperationRef; retryAfterMs: number }>
  | Readonly<{ kind: 'rejected'; error: ScheduleDomainError }>
export interface ScheduleManagementPersistence {
  commit(command: ManagementCommit): Promise<PersistenceResult>
  query(
    input: Readonly<{
      scope: RecoveryScope
      locator: ScheduleOperationLocator
    }>,
  ): Promise<ReadResult<ScheduleOperationView>>
}

/** Human owner access must be granted explicitly. Agent access remains an intersection. */
export type Visibility =
  | Readonly<{ kind: 'ownerAll' }>
  | Readonly<{ kind: 'authoredIds'; author: ScheduleAuthor; scheduleIds: readonly ScheduleId[] }>
  | Readonly<{ kind: 'grantedIds'; scheduleIds: readonly ScheduleId[] }>
export type ReadAccess = Readonly<{
  owner: ScheduleOwner
  principalRef: Ref
  visibility: Visibility
  authorityRevision: Ref
  visibilityDigest: ScheduleFingerprint
}>
export type Snapshot<T> = Readonly<{ observationRevision: Ref; value: T }>
export interface ScheduleManagementStore {
  readSchedule(
    input: Readonly<{
      owner: ScheduleOwner
      scheduleId: ScheduleId
    }>,
  ): Promise<ReadResult<Snapshot<ScheduleRecord>>>
  listSchedules(
    input: Readonly<{
      access: ReadAccess
      request: ScheduleListRequest
    }>,
  ): Promise<ReadResult<ScheduleListPage>>
  getSchedule(
    input: Readonly<{
      access: ReadAccess
      scheduleId: ScheduleId
    }>,
  ): Promise<ReadResult<Snapshot<ScheduleRecord>>>
  readRevisions(
    input: Readonly<{
      access: ReadAccess
      request: ScheduleRevisionsRequest
    }>,
  ): Promise<ReadResult<SchedulePage<ScheduleRevisionView>>>
}
export interface ScheduleReadAuthorizer {
  observe(
    input: Readonly<{
      context: ScheduleCallContext
      action: 'list' | 'get' | 'revisions' | 'agenda' | 'preview' | 'executions'
    }>,
  ): Promise<ReadResult<ReadAccess>>
  confirm(
    input: Readonly<{
      context: ScheduleCallContext
      observed: ReadAccess
    }>,
  ): Promise<ReadResult<ReadAccess>>
}
export type ScheduleManagementDependencies = Readonly<{
  store: ScheduleManagementStore
  persistence: ScheduleManagementPersistence
  authorizer: ManagementAuthorizer
  definitions: ManagementDefinitionResolver
  quota: ManagementQuotaReader
  clock: Readonly<{ now(): ScheduleInstant }>
  ids: Readonly<{ schedule(): ScheduleId }>
}>
