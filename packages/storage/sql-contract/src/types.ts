// Public shapes of the SQL storage contract (docs: SPEC.md). This file holds the root entry
// types. The root imports no Cordis (IC-4). "§n" refers to the numbered sections of SPEC.md.

/** Strict JSON. Numbers are finite. No BigInt, Date, undefined, NaN or Infinity (§3.2). */
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue }

/**
 * Partition of a transaction domain. An empty tenant is not a system scope (IC-18). The only
 * system scope is { kind: 'system' } (§3.1).
 */
export type StorageScope =
  | Readonly<{ kind: 'tenant'; tenant: string }>
  | Readonly<{ kind: 'system' }>

export type DomainRef = Readonly<{
  scope: StorageScope
  transactionDomain: string
}>

/** Protocol 2 replaces protocol 1 for every new commit (§3.3). */
export type ProtocolVersionV2 = '2'

/** The five identity dimensions. Two identities are equal only if all five are equal (§3.1). */
export type SqlIdentity = Readonly<{
  scope: StorageScope
  transactionDomain: string
  operation: string
  protocolVersion: ProtocolVersionV2
  operationKey: string
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

/**
 * Observation control only. Abort releases the observer. It never cancels SQL that runs or
 * withdraws a sent operation (§7.1).
 */
export type CommitOptions = Readonly<{ signal?: AbortSignal }>

/** Category the provider records for a failed reply (§7.6). */
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

/**
 * Committed receipt with its response evidence. responses lists every executed participant in
 * execution order, and every one participated (§7.5).
 */
export type CommittedV2 = Readonly<{
  kind: 'committed'
  identity: SqlIdentity
  inputDigest: string
  combinationVersion: string
  manifestDigest: string
  responses: readonly [ParticipatedEntry, ...ParticipatedEntry[]]
}>

/**
 * Explicit rollback receipt. responses lists the executed participants up to and including the
 * first participant that stopped the operation (§7.5).
 */
export type RolledBackV2 = Readonly<{
  kind: 'rolled_back'
  identity: SqlIdentity
  inputDigest: string
  combinationVersion: string
  manifestDigest: string
  responses: readonly [...ParticipatedEntry[], StoppingEntry]
}>

export type ReceiptV2 = CommittedV2 | RolledBackV2

/**
 * Provider diagnostic text: at most maxDiagnosticBytes, no SQL text, no parameters, no business
 * content, and nothing about a domain bound to another scope. Callers must not branch on it.
 * Branch only on kind and reason (§2.5).
 */
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

/** Commit rejection reasons. The step order that selects one of them is in §7.2. */
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

/** Reasons that the provider can return before it decodes a protocol 2 identity (§7.2). */
export type PreDecodeRejectReason =
  | 'closing'
  | 'cancelled'
  | 'field_missing'
  | 'unsupported_protocol'

export type CommitRejectedV2 =
  | Readonly<{
      kind: 'rejected_before_accept'
      /** null only when the request does not contain a decodable protocol 2 identity. */
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

export type CommitResultV2 =
  | CommittedV2
  | RolledBackV2
  | UnknownV2
  | IdentityConflictV2
  | CommitRejectedV2

/** The provider builds this value. Caller code never assembles it (§8). */
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

export type QueryResultV2 = CommittedV2 | RolledBackV2 | UnknownV2 | NotCommittedV2

export type RegistrationKey = Readonly<{
  scope: StorageScope
  transactionDomain: string
  combinationVersion: string
}>

/**
 * Registration input. The provider compares and stores participants sorted by UTF-16 code
 * units (§6.1).
 */
export type CombinationRegistrationV2 = Readonly<{
  scope: StorageScope
  transactionDomain: string
  combinationVersion: string
  manifestDigest: string
  participants: readonly string[]
}>

/** Registration rejection reasons. The step order that selects one of them is in §6.2. */
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
  /** Outcome not determined. The caller repeats the identical registration to recognize it. */
  | Readonly<{ kind: 'unknown'; key: RegistrationKey; diagnostic: StorageDiagnostic }>

export type ReadOrdering = 'snapshot' | 'domain-serial'

export type ReadRequest = Readonly<{
  domain: DomainRef
  handler: string
  protocol: string
  /** Correlation only. Not a durable identity (§9.1). */
  requestKey: string
  input: JsonValue
}>

export type ReadOptions = Readonly<{ signal?: AbortSignal }>

/** Read unavailability reasons. Trigger conditions and step order are in §9.2. */
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
  /** requestKey is null only when the request has no decodable requestKey. */
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

/**
 * Root operation interface. No promise rejects to report an outcome. An internal error of the
 * provider maps to unknown (registerCombination, commit, query) or read_failed (read) (§2.5).
 * The operations carry no principal. Authorization is the duty of the domain entry that calls
 * them (§2.5).
 */
export interface SqlStorage {
  registerCombination(input: CombinationRegistrationV2): Promise<RegisterResultV2>
  commit(input: CommitRequestV2, options?: CommitOptions): Promise<CommitResultV2>
  query(identity: SqlIdentity): Promise<QueryResultV2>
  read(input: ReadRequest, options?: ReadOptions): Promise<ReadResult>
}

// --- Static materials, manifest and digest (§4) -------------------------------------------

export type FactKey = Readonly<{ key: string; protocol: string }>

export type MigrationRef = Readonly<{ owner: string; id: string }>

/** Explicit declaration. A descriptor without it is invalid (§4.5). */
export type GroupingDeclaration = 'groupable' | 'singleton'

export type ParticipantDescriptor = Readonly<{
  participant: string
  protocol: string
  /** file: URL fixed by the application build. Never taken from a request or plugin config. */
  moduleUrl: string
  /** Lowercase hex SHA-256 of the module file bytes (§4.1). */
  codeDigest: string
  ownedTables: readonly string[]
  readTables: readonly string[]
  requiresFacts: readonly FactKey[]
  providesFacts: readonly FactKey[]
  /** SQL functions beyond the provider base allowlist (§7.4). */
  allowedFunctions: readonly string[]
  grouping: GroupingDeclaration
}>

export type MigrationDescriptor = Readonly<{
  owner: string
  id: string
  moduleUrl: string
  /** Lowercase hex SHA-256 of the migration module file bytes (§4.1). */
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
  /** Positive integer, at most the provider maxReadResultBytes (§9.4). */
  maxOutputBytes: number
  /** Positive integer. Rows that the read port may return to the handler, all statements (§9.4). */
  maxRowsRead: number
}>

/**
 * The combination that the application build uses for a scope kind. Domain opening registers it
 * in a registered domain that does not have it yet (§5.3). registerCombination also accepts
 * other combinations whose materials are in the catalog (§6.1).
 */
export type DeclaredCombination = Readonly<{
  combinationVersion: string
  participants: readonly string[]
}>

/** All static materials of one application build (§4.2). */
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

/** Manifest entry: ParticipantDescriptor without moduleUrl, every array sorted (§4.4). */
export type ManifestParticipant = Omit<ParticipantDescriptor, 'moduleUrl'>

/** Manifest entry: MigrationDescriptor without moduleUrl, requires sorted (§4.4). */
export type ManifestMigration = Omit<MigrationDescriptor, 'moduleUrl'>

/** Digest input of one combination (§4.4). */
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

// --- Storage host, close control and leases (§2.3, §13) ------------------------------------

/** Opaque assembly lease handle. Compared by identity. */
export type CloseLeaseHandle = object

/**
 * Adapter over the assembly close protocol. admit throws when the assembly stopped admission.
 * The provider maps that throw to `closing` (§13.2).
 */
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
  /** Original identities still in flight on this Worker. No SQL text or business content. */
  inFlight: readonly SqlIdentity[]
}>

export type StorageCloseResult =
  | Readonly<{ kind: 'closed' }>
  | Readonly<{ kind: 'incomplete'; residuals: readonly StorageResidual[] }>

/** Held only by the trusted assembly close adapter and by the binding plugin (§13). */
export interface StorageControl {
  close(input: Readonly<{ initiator: CloseInitiator }>): Promise<StorageCloseResult>
  assemblyReportSettled(): void
}

/**
 * Runtime objects that the assembly entry gives the storage provider (§2.3). The assembly entry
 * builds the catalog from static imports. attachControl hands the provider control to the
 * assembly close adapter. The adapter keeps every attached control until the assembly close
 * report is settled.
 */
export interface StorageHost {
  readonly materials: SqlMaterialCatalog
  readonly closeLeases: CloseLeasePort
  attachControl(control: StorageControl): void
}

// --- Tenant domain directory shapes (§2.4). Depends on Context r3. -------------------------

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

/** Construction capability of the trusted session storage composite. Never in a Context. */
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

/**
 * Read-only lookup in the published snapshot of the directory (the projection of
 * `TenantDomainAccess.snapshot()`). It does not resolve, register, migrate or write the directory.
 * A tenant that the snapshot does not hold is `unregistered`. Trusted: only rows of the trusted
 * storage subtree receive it.
 */
export interface TenantDomainLookup {
  lookup(input: Readonly<{ tenant: string }>): Promise<TenantDomainLookupResult>
}

// --- Protocol 1 recognition (§3.3). Published only if the data survey finds v1 receipts. ---

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
