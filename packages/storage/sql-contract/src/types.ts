export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue }

export type StorageScope =
  | Readonly<{ kind: 'tenant'; tenant: string }>
  | Readonly<{ kind: 'system' }>

export type DomainRef = Readonly<{
  scope: StorageScope
  transactionDomain: string
}>

export type ProtocolVersionV2 = '2'

export type SqlIdentity = Readonly<{
  scope: StorageScope
  transactionDomain: string
  operation: string
  protocolVersion: ProtocolVersionV2
  operationKey: string
  recall?: 'never'
}>

export type FactCommandV2 = Readonly<{
  participant: string
  facts: Readonly<Record<string, JsonValue>>
}>

export type CommitRequestV2 = Readonly<{
  identity: SqlIdentity
  combinationVersion: string
  manifestDigest: string
  commands: readonly FactCommandV2[]
}>

export type CommitOptions = Readonly<{ signal?: AbortSignal }>

export type FailureCategory =
  | 'participant_reported'
  | 'sql_error'
  | 'port_violation'
  | 'fact_violation'
  | 'participant_threw'
  | 'invalid_reply'
  | 'response_limit'

export type ParticipatedReply = Readonly<{ kind: 'participated'; response: JsonValue }>

export type StoppingReply =
  | Readonly<{ kind: 'conflict'; basis: JsonValue }>
  | Readonly<{ kind: 'unsupported'; basis: JsonValue }>
  | Readonly<{ kind: 'failed'; category: FailureCategory; diagnostic: string }>

export type RecordedReply = ParticipatedReply | StoppingReply

export type ParticipatedEntry = Readonly<{
  participant: string
  protocol: string
  reply: ParticipatedReply
}>

export type StoppingEntry = Readonly<{
  participant: string
  protocol: string
  reply: StoppingReply
}>

export type CommittedV2 = Readonly<{
  kind: 'committed'
  identity: SqlIdentity
  inputDigest: string
  combinationVersion: string
  manifestDigest: string
  responses: readonly [ParticipatedEntry, ...ParticipatedEntry[]]
}>

export type RolledBackV2 = Readonly<{
  kind: 'rolled_back'
  identity: SqlIdentity
  inputDigest: string
  combinationVersion: string
  manifestDigest: string
  responses: readonly [...ParticipatedEntry[], StoppingEntry]
}>

export type ReceiptV2 = CommittedV2 | RolledBackV2

export type StorageDiagnostic = string | null

export type UnknownV2 = Readonly<{
  kind: 'unknown'
  identity: SqlIdentity
  diagnostic: StorageDiagnostic
}>

export type IdentityConflictV2 = Readonly<{
  kind: 'identity_conflict'
  identity: SqlIdentity
  existing: ReceiptV2
}>

export type CommitRejectReason =
  | 'closing'
  | 'cancelled'
  | 'field_missing'
  | 'unsupported_protocol'
  | 'participant_repeated'
  | 'facts_not_json'
  | 'command_limit'
  | 'queue_full'
  | 'writer_not_current'
  | 'domain_unavailable'
  | 'combination_unregistered'
  | 'manifest_mismatch'
  | 'material_unavailable'
  | 'participant_not_in_combination'
  | 'participant_dependency_missing'

export type PreDecodeRejectReason =
  | 'closing'
  | 'cancelled'
  | 'field_missing'
  | 'unsupported_protocol'

export type CommitRejectedV2 =
  | Readonly<{
      kind: 'rejected_before_accept'
      identity: SqlIdentity | null
      reason: PreDecodeRejectReason
      diagnostic: StorageDiagnostic
    }>
  | Readonly<{
      kind: 'rejected_before_accept'
      identity: SqlIdentity
      reason: Exclude<CommitRejectReason, PreDecodeRejectReason>
      diagnostic: StorageDiagnostic
    }>

export type CommitReceiptV2 = ReceiptV2 & Readonly<{ recalled: boolean }>

export type CommitResultV2 = CommitReceiptV2 | UnknownV2 | IdentityConflictV2 | CommitRejectedV2

export type NotCommittedV2 = Readonly<{
  kind: 'not_committed'
  identity: SqlIdentity
  proofs: Readonly<{
    writerGenerationExcluded: true
    oldTransactionTerminated: true
    databaseRecoveryFinished: true
    authoritativeReadSucceeded: true
    operationNotQueued: true
  }>
}>

export type NotRecallableV2 = Readonly<{ kind: 'not_recallable'; identity: SqlIdentity }>

export type QueryResultV2 =
  | CommittedV2
  | RolledBackV2
  | UnknownV2
  | NotCommittedV2
  | NotRecallableV2

export type RegistrationKey = Readonly<{
  scope: StorageScope
  transactionDomain: string
  combinationVersion: string
}>

export type CombinationRegistrationV2 = Readonly<{
  scope: StorageScope
  transactionDomain: string
  combinationVersion: string
  manifestDigest: string
  participants: readonly string[]
}>

export type RegisterRejectReason =
  | 'closing'
  | 'field_missing'
  | 'participant_empty'
  | 'participant_repeated'
  | 'material_unavailable'
  | 'combination_invalid'
  | 'manifest_mismatch'
  | 'queue_full'
  | 'writer_not_current'
  | 'domain_unavailable'
  | 'domain_occupied'
  | 'registration_conflict'

export type RegisterResultV2 =
  | Readonly<{ kind: 'registered'; registration: CombinationRegistrationV2 }>
  | Readonly<{
      kind: 'rejected_before_accept'
      reason: RegisterRejectReason
      diagnostic: StorageDiagnostic
    }>
  | Readonly<{ kind: 'unknown'; key: RegistrationKey; diagnostic: StorageDiagnostic }>

export type ReadOrdering = 'snapshot' | 'domain-serial'

export type ReadRequest = Readonly<{
  domain: DomainRef
  handler: string
  protocol: string
  requestKey: string
  input: JsonValue
}>

export type ReadOptions = Readonly<{ signal?: AbortSignal }>

export type ReadUnavailableReason =
  | 'closing'
  | 'invalid'
  | 'read_limit'
  | 'handler_unavailable'
  | 'queue_full'
  | 'domain_unavailable'
  | 'schema_unavailable'
  | 'queue_timeout'
  | 'read_timeout'
  | 'worker_exited'
  | 'read_failed'

type PreDecodeReadReason = 'closing' | 'invalid'

export type ReadResult =
  | Readonly<{ kind: 'read'; requestKey: string; output: JsonValue }>
  | Readonly<{ kind: 'cancelled'; requestKey: string | null }>
  | Readonly<{
      kind: 'unavailable'
      requestKey: string | null
      reason: PreDecodeReadReason
      diagnostic: StorageDiagnostic
    }>
  | Readonly<{
      kind: 'unavailable'
      requestKey: string
      reason: Exclude<ReadUnavailableReason, PreDecodeReadReason>
      diagnostic: StorageDiagnostic
    }>

export interface SqlStorage {
  readonly database: object
  registerCombination(input: CombinationRegistrationV2): Promise<RegisterResultV2>
  commit(input: CommitRequestV2, options?: CommitOptions): Promise<CommitResultV2>
  query(identity: SqlIdentity): Promise<QueryResultV2>
  read(input: ReadRequest, options?: ReadOptions): Promise<ReadResult>
}

export type FactKey = Readonly<{ key: string; protocol: string }>

export type MigrationRef = Readonly<{ owner: string; id: string }>

export type GroupingDeclaration = 'groupable' | 'singleton'

export type ParticipantDescriptor = Readonly<{
  participant: string
  protocol: string
  moduleUrl: string
  codeDigest: string
  ownedTables: readonly string[]
  readTables: readonly string[]
  requiresFacts: readonly FactKey[]
  providesFacts: readonly FactKey[]
  allowedFunctions: readonly string[]
  grouping: GroupingDeclaration
}>

export type MigrationDescriptor = Readonly<{
  owner: string
  id: string
  moduleUrl: string
  checksum: string
  requires: readonly MigrationRef[]
}>

export type ReadHandlerDescriptor = Readonly<{
  handler: string
  protocol: string
  moduleUrl: string
  codeDigest: string
  ordering: ReadOrdering
  readTables: readonly string[]
  requiresMigrations: readonly MigrationRef[]
  maxOutputBytes: number
  maxRowsRead: number
}>

export type DeclaredCombination = Readonly<{
  combinationVersion: string
  participants: readonly string[]
}>

export type SqlMaterialCatalog = Readonly<{
  catalogProtocol: 'sql-catalog/1'
  participants: readonly ParticipantDescriptor[]
  migrations: readonly MigrationDescriptor[]
  readHandlers: readonly ReadHandlerDescriptor[]
  declaredCombinations: Readonly<{
    tenant: DeclaredCombination | null
    system: DeclaredCombination | null
  }>
}>

export type ManifestParticipant = Omit<ParticipantDescriptor, 'moduleUrl'>

export type ManifestMigration = Omit<MigrationDescriptor, 'moduleUrl'>

export type CombinationManifest = Readonly<{
  manifestProtocol: 'sql-manifest/1'
  participants: readonly ManifestParticipant[]
  migrations: readonly ManifestMigration[]
}>

export type CombinationProblem =
  | Readonly<{ kind: 'fact_cycle'; participants: readonly string[] }>
  | Readonly<{ kind: 'fact_unprovided'; participant: string; fact: FactKey }>
  | Readonly<{ kind: 'fact_provided_twice'; fact: FactKey; participants: readonly string[] }>
  | Readonly<{ kind: 'table_owned_twice'; table: string; participants: readonly string[] }>
  | Readonly<{ kind: 'read_table_unowned'; participant: string; table: string }>
  | Readonly<{ kind: 'migration_missing'; required: MigrationRef }>
  | Readonly<{ kind: 'migration_cycle'; migrations: readonly MigrationRef[] }>

export type CombinationManifestResult =
  | Readonly<{ kind: 'manifest'; manifest: CombinationManifest }>
  | Readonly<{ kind: 'material_unavailable'; participant: string }>
  | Readonly<{ kind: 'combination_invalid'; problems: readonly CombinationProblem[] }>

export type CloseLeaseHandle = object

export interface CloseLeasePort {
  admit(name: string): CloseLeaseHandle
  release(handle: CloseLeaseHandle): void
}

export type CloseInitiator = 'assembly' | 'disposal'

export type StorageResidual = Readonly<{
  domain: DomainRef
  workerRole: 'writer' | 'reader'
  workerGeneration: string
  leaseName: string
  inFlight: readonly SqlIdentity[]
}>

export type StorageCloseResult =
  | Readonly<{ kind: 'closed' }>
  | Readonly<{ kind: 'incomplete'; residuals: readonly StorageResidual[] }>

export interface StorageControl {
  close(input: Readonly<{ initiator: CloseInitiator }>): Promise<StorageCloseResult>
  assemblyReportSettled(): void
}

export interface StorageHost {
  readonly materials: SqlMaterialCatalog
  readonly closeLeases: CloseLeasePort
  attachControl(control: StorageControl): void
}

export type TenantDomain = Readonly<{ tenant: string; domain: DomainRef }>

export type TenantDomainResolution =
  | Readonly<{ kind: 'ready'; entry: TenantDomain }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

export type TenantDomainSnapshot = Readonly<{
  revision: string
  entries: readonly TenantDomain[]
}>

export type TenantDomainSnapshotResult =
  | Readonly<{ kind: 'ready'; value: TenantDomainSnapshot }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

export interface TenantDomainAccess {
  resolve(input: Readonly<{ tenant: string }>): Promise<TenantDomainResolution>
  snapshot(): Promise<TenantDomainSnapshotResult>
}

export type TenantDomainListing =
  | Readonly<{ kind: 'ready'; revision: string; entries: readonly TenantDomain[] }>
  | Readonly<{ kind: 'denied' }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

export interface TenantDomains<P> {
  enumerate(input: Readonly<{ principal: P }>): Promise<TenantDomainListing>
}

export type TenantDomainLookupResult =
  | Readonly<{ kind: 'ready'; domain: DomainRef }>
  | Readonly<{ kind: 'unregistered' }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

export interface TenantDomainLookup {
  lookup(input: Readonly<{ tenant: string }>): Promise<TenantDomainLookupResult>
}

export type OperationIdentityV1 = Readonly<{
  tenant: string
  transactionDomain: string
  operation: string
  protocolVersion: '1'
  operationKey: string
}>

export type QueryResultV1 =
  | Readonly<{ kind: 'committed'; identity: OperationIdentityV1; inputDigest: string }>
  | Readonly<{ kind: 'rolled_back'; identity: OperationIdentityV1; inputDigest: string }>
  | Readonly<{ kind: 'unknown'; identity: OperationIdentityV1 }>
  | Readonly<{
      kind: 'not_committed'
      identity: OperationIdentityV1
      proofs: NotCommittedV2['proofs']
    }>

export interface SqlStorageProtocol1Query {
  queryProtocol1(identity: OperationIdentityV1): Promise<QueryResultV1>
}
