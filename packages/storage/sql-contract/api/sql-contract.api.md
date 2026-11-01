# @omne-harness/sql-contract 的 API 快照

<!-- omne-contract-api 快照格式 1 -->

> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。

## 入口 `.` · `index.d.ts`

- `CloseInitiator` · `types.d.ts`
- `CloseLeaseHandle` · `types.d.ts`
- `CloseLeasePort` · `types.d.ts`
- `CombinationManifest` · `types.d.ts`
- `CombinationManifestResult` · `types.d.ts`
- `CombinationProblem` · `types.d.ts`
- `CombinationRegistrationV2` · `types.d.ts`
- `CommitOptions` · `types.d.ts`
- `CommitRejectReason` · `types.d.ts`
- `CommitRejectedV2` · `types.d.ts`
- `CommitRequestV2` · `types.d.ts`
- `CommitResultV2` · `types.d.ts`
- `CommittedV2` · `types.d.ts`
- `DeclaredCombination` · `types.d.ts`
- `DomainRef` · `types.d.ts`
- `FactCommandV2` · `types.d.ts`
- `FactKey` · `types.d.ts`
- `FailureCategory` · `types.d.ts`
- `GroupingDeclaration` · `types.d.ts`
- `IdentityConflictV2` · `types.d.ts`
- `JsonValue` · `types.d.ts`
- `ManifestMigration` · `types.d.ts`
- `ManifestParticipant` · `types.d.ts`
- `MigrationDescriptor` · `types.d.ts`
- `MigrationRef` · `types.d.ts`
- `NotCommittedV2` · `types.d.ts`
- `OperationIdentityV1` · `types.d.ts`
- `ParticipantDescriptor` · `types.d.ts`
- `ParticipatedEntry` · `types.d.ts`
- `ParticipatedReply` · `types.d.ts`
- `PreDecodeRejectReason` · `types.d.ts`
- `ProtocolVersionV2` · `types.d.ts`
- `QueryResultV1` · `types.d.ts`
- `QueryResultV2` · `types.d.ts`
- `ReadHandlerDescriptor` · `types.d.ts`
- `ReadOptions` · `types.d.ts`
- `ReadOrdering` · `types.d.ts`
- `ReadRequest` · `types.d.ts`
- `ReadResult` · `types.d.ts`
- `ReadUnavailableReason` · `types.d.ts`
- `ReceiptV2` · `types.d.ts`
- `RecordedReply` · `types.d.ts`
- `RegisterRejectReason` · `types.d.ts`
- `RegisterResultV2` · `types.d.ts`
- `RegistrationKey` · `types.d.ts`
- `RolledBackV2` · `types.d.ts`
- `SqlIdentity` · `types.d.ts`
- `SqlMaterialCatalog` · `types.d.ts`
- `SqlStorage` · `types.d.ts`
- `SqlStorageProtocol1Query` · `types.d.ts`
- `StoppingEntry` · `types.d.ts`
- `StoppingReply` · `types.d.ts`
- `StorageCloseResult` · `types.d.ts`
- `StorageControl` · `types.d.ts`
- `StorageDiagnostic` · `types.d.ts`
- `StorageHost` · `types.d.ts`
- `StorageResidual` · `types.d.ts`
- `StorageScope` · `types.d.ts`
- `TenantDomain` · `types.d.ts`
- `TenantDomainAccess` · `types.d.ts`
- `TenantDomainListing` · `types.d.ts`
- `TenantDomainLookup` · `types.d.ts`
- `TenantDomainLookupResult` · `types.d.ts`
- `TenantDomainResolution` · `types.d.ts`
- `TenantDomainSnapshot` · `types.d.ts`
- `TenantDomainSnapshotResult` · `types.d.ts`
- `TenantDomains` · `types.d.ts`
- `UnknownV2` · `types.d.ts`
- `combinationManifest` · `manifest.d.ts`
- `inputDigestV2` · `digest.d.ts`
- `manifestDigest` · `manifest.d.ts`

## 入口 `./cordis` · `cordis.d.ts`

- `StorageHostService` · `cordis.d.ts`
- `StorageService` · `cordis.d.ts`
- `TenantDomainLookupService` · `cordis.d.ts`
- `TenantDomainsService` · `cordis.d.ts`
- `storageHostKey` · `cordis.d.ts`
- `storageKey` · `cordis.d.ts`
- `tenantDomainLookupKey` · `cordis.d.ts`
- `tenantDomainsKey` · `cordis.d.ts`

## 入口 `./testing` · `testing/index.d.ts`

- `MemorySqlStorageInput` · `testing/memory.d.ts`
- `MemorySqlStorageLimits` · `testing/memory.d.ts`
- `MemoryTenantDomainLookup` · `testing/tenant-domain-lookup.d.ts`
- `SqlConformanceFailure` · `testing/conformance.d.ts`
- `SqlConformanceSubject` · `testing/conformance.d.ts`
- `TenantDomainLookupFixture` · `testing/tenant-domain-lookup.d.ts`
- `TenantDomainLookupVerdicts` · `testing/tenant-domain-lookup.d.ts`
- `createMemorySqlStorage` · `testing/memory.d.ts`
- `createMemoryTenantDomainLookup` · `testing/tenant-domain-lookup.d.ts`
- `runSqlStorageConformance` · `testing/conformance.d.ts`
- `runTenantDomainLookupConformance` · `testing/tenant-domain-lookup.d.ts`

## 入口 `./worker` · `worker.d.ts`

- `HandlerOutcome` · `worker.d.ts`
- `MigrationModule` · `worker.d.ts`
- `MigrationPort` · `worker.d.ts`
- `MigrationVerdict` · `worker.d.ts`
- `ParticipantModule` · `worker.d.ts`
- `ParticipantPort` · `worker.d.ts`
- `ParticipantReply` · `worker.d.ts`
- `QueryRows` · `worker.d.ts`
- `ReadHandlerModule` · `worker.d.ts`
- `ReadPort` · `worker.d.ts`
- `SqlCell` · `worker.d.ts`
- `SqlValue` · `worker.d.ts`

## 声明文件 `canonical.d.ts`

```ts
import type { JsonValue } from './types.ts';
export declare function sha256Hex(text: string): string;
export declare function utf8Length(text: string): number;
export declare function isStrictJson(value: unknown): value is JsonValue;
export declare function canonicalJson(value: unknown): string;
export declare function jsonShape(value: JsonValue): Readonly<{
    depth: number;
    members: number;
}>;
```

## 声明文件 `cordis.d.ts`

```ts
import { Service, type Context } from '@deepseek-ai/cordis';
import type { SqlStorage, StorageHost, TenantDomainLookup, TenantDomains } from './types.ts';
export declare abstract class StorageService extends Service implements SqlStorage {
    static readonly provide = "storage";
    constructor(ctx: Context);
    abstract readonly registerCombination: SqlStorage['registerCombination'];
    abstract readonly commit: SqlStorage['commit'];
    abstract readonly query: SqlStorage['query'];
    abstract readonly read: SqlStorage['read'];
}
export declare const storageKey = "storage";
export declare abstract class StorageHostService extends Service implements StorageHost {
    static readonly provide = "storageHost";
    constructor(ctx: Context);
    abstract readonly materials: StorageHost['materials'];
    abstract readonly closeLeases: StorageHost['closeLeases'];
    abstract readonly attachControl: StorageHost['attachControl'];
}
export declare const storageHostKey = "storageHost";
export declare abstract class TenantDomainsService<P> extends Service implements TenantDomains<P> {
    static readonly provide = "tenantDomains";
    constructor(ctx: Context);
    abstract readonly enumerate: TenantDomains<P>['enumerate'];
}
export declare const tenantDomainsKey = "tenantDomains";
export declare abstract class TenantDomainLookupService extends Service implements TenantDomainLookup {
    static readonly provide = "tenantDomainLookup";
    constructor(ctx: Context);
    abstract readonly lookup: TenantDomainLookup['lookup'];
}
export declare const tenantDomainLookupKey = "tenantDomainLookup";
declare module '@deepseek-ai/cordis' {
    interface Context {
        storage: StorageService;
        storageHost: StorageHostService;
        tenantDomains: TenantDomainsService<unknown>;
        tenantDomainLookup: TenantDomainLookupService;
    }
}
```

## 声明文件 `digest.d.ts`

```ts
import type { CommitRequestV2 } from './types.ts';
export declare function inputDigestV2(request: CommitRequestV2): string;
```

## 声明文件 `fields.d.ts`

```ts
import type { SqlIdentity, StorageScope } from './types.ts';
export declare const NAME_BYTES = 1024;
export declare const DOMAIN_BYTES = 120;
export declare function isName(value: unknown, limit?: number): value is string;
export declare function isDigest(value: unknown): value is string;
export declare function decodeScope(value: unknown): StorageScope | null;
export type DecodedIdentity = Readonly<{
    fields: Omit<SqlIdentity, 'protocolVersion'> | null;
    identity: SqlIdentity | null;
    protocol: unknown;
}>;
export declare function decodeIdentity(value: unknown): DecodedIdentity;
export declare function scopeKey(scope: StorageScope): string;
export declare function clipDiagnostic(text: string, limit: number): string;
```

## 声明文件 `index.d.ts`

```ts
export type * from './types.ts';
export { combinationManifest, manifestDigest } from './manifest.ts';
export { inputDigestV2 } from './digest.ts';
```

## 声明文件 `manifest.d.ts`

```ts
import type { CombinationManifest, CombinationManifestResult, SqlMaterialCatalog } from './types.ts';
export declare function combinationManifest(input: Readonly<{
    catalog: SqlMaterialCatalog;
    participants: readonly string[];
}>): CombinationManifestResult;
export declare function manifestDigest(manifest: CombinationManifest): string;
```

## 声明文件 `testing/builders.d.ts`

```ts
import type { CombinationRegistrationV2, CommitRequestV2, FactCommandV2, SqlIdentity, SqlMaterialCatalog, SqlStorage, StorageScope } from '../types.ts';
export declare const TENANT_A: StorageScope;
export declare const TENANT_B: StorageScope;
export declare const SYSTEM: StorageScope;
export declare const DOMAIN_A = "domain-a";
type WithMaterials = Readonly<{
    materials: SqlMaterialCatalog;
}>;
export declare function digestOf(source: WithMaterials, participants: readonly string[]): string;
export declare function registration(source: WithMaterials, overrides?: Partial<CombinationRegistrationV2>): CombinationRegistrationV2;
export declare function identity(overrides?: Partial<SqlIdentity>): SqlIdentity;
export declare function commitRequest(source: WithMaterials, overrides?: Partial<CommitRequestV2>): CommitRequestV2;
export declare function command(participant: string, facts?: FactCommandV2['facts']): FactCommandV2;
export declare function registerSmall(storage: SqlStorage, source: WithMaterials, scope?: StorageScope, transactionDomain?: string): Promise<void>;
export declare function registerAll(storage: SqlStorage, source: WithMaterials, scope?: StorageScope, transactionDomain?: string): Promise<void>;
export {};
```

## 声明文件 `testing/conformance.d.ts`

```ts
import type { SqlMaterialCatalog, SqlStorage, StorageControl } from '../types.ts';
export type SqlConformanceSubject = Readonly<{
    create(input: Readonly<{
        materials: SqlMaterialCatalog;
    }>): Promise<Readonly<{
        storage: SqlStorage;
        control: StorageControl;
    }>>;
    durability: 'none' | 'process' | 'power-loss-tested';
}>;
export type SqlConformanceFailure = Readonly<{
    id: string;
    message: string;
}>;
export declare const CONFORMANCE_SCENARIO_IDS: readonly string[];
export declare function runSqlStorageConformance(subject: SqlConformanceSubject): Promise<void>;
```

## 声明文件 `testing/fixtures.d.ts`

```ts
import type { FactKey, SqlMaterialCatalog } from '../types.ts';
export declare const SESSION_REVISION: FactKey;
export declare const GAMMA_FACT: FactKey;
export declare const ALL_PARTICIPANTS: readonly [
    'agent-journal',
    'alpha',
    'beta',
    'gamma',
    'needy',
    'probe',
    'session'
];
export declare const SMALL_PARTICIPANTS: readonly [
    'agent-journal',
    'session'
];
export declare const HANDLER_MAX_OUTPUT_BYTES = 256;
export type FixtureMaterials = Readonly<{
    materials: SqlMaterialCatalog;
    directory: string;
    remove(): Promise<void>;
}>;
export declare function createFixtureMaterials(): Promise<FixtureMaterials>;
```

## 声明文件 `testing/index.d.ts`

```ts
export { createMemorySqlStorage } from './memory.ts';
export type { MemorySqlStorageInput, MemorySqlStorageLimits } from './memory.ts';
export { runSqlStorageConformance } from './conformance.ts';
export type { SqlConformanceFailure, SqlConformanceSubject } from './conformance.ts';
export { createMemoryTenantDomainLookup, runTenantDomainLookupConformance, } from './tenant-domain-lookup.ts';
export type { MemoryTenantDomainLookup, TenantDomainLookupFixture, TenantDomainLookupVerdicts, } from './tenant-domain-lookup.ts';
```

## 声明文件 `testing/manifest-vector.d.ts`

```ts
import type { SqlMaterialCatalog } from '../types.ts';
export declare const MANIFEST_VECTOR_PARTICIPANTS: readonly [
    'agent-journal',
    'session'
];
export declare const MANIFEST_VECTOR_DIGEST = "b8cb9846fa33866cea139ff67980096603ec26d41473dbed29e1a5784329e1dd";
export declare const MANIFEST_VECTOR_CATALOG: SqlMaterialCatalog;
```

## 声明文件 `testing/memory.d.ts`

```ts
import type { SqlMaterialCatalog, SqlStorage, StorageControl } from '../types.ts';
export type MemorySqlStorageLimits = Readonly<{
    maxCommandsPerCommit: number;
    maxCommandBytes: number;
    maxRequestBytes: number;
    maxResponseBytes: number;
    maxOperationResponseBytes: number;
    maxDiagnosticBytes: number;
    maxReadInputBytes: number;
    maxJsonDepth: number;
    maxJsonMembers: number;
}>;
export type MemorySqlStorageInput = Readonly<{
    materials: SqlMaterialCatalog;
    limits?: Partial<MemorySqlStorageLimits>;
}>;
export declare function createMemorySqlStorage(input: MemorySqlStorageInput): Promise<Readonly<{
    storage: SqlStorage;
    control: StorageControl;
}>>;
```

## 声明文件 `testing/tenant-domain-lookup.d.ts`

```ts
import type { TenantDomain, TenantDomainLookup } from '../types.ts';
export interface MemoryTenantDomainLookup extends TenantDomainLookup {
    readonly durability: 'none';
    readonly controls: Readonly<{
        publish(entry: TenantDomain): void;
        setUnavailable(diagnostic: string | null): void;
        asked(): readonly Readonly<{
            tenant: string;
        }>[];
    }>;
}
export declare function createMemoryTenantDomainLookup(published?: readonly TenantDomain[]): MemoryTenantDomainLookup;
export type TenantDomainLookupFixture = Readonly<{
    lookup: TenantDomainLookup;
    registered: TenantDomain;
    unregistered: string;
    setUnavailable?: (diagnostic: string | null) => void;
}>;
export type TenantDomainLookupVerdicts = Readonly<{
    passed: readonly string[];
    failed: readonly Readonly<{
        id: string;
        message: string;
    }>[];
    notApplicable: readonly string[];
}>;
export declare function runTenantDomainLookupConformance(fixture: () => TenantDomainLookupFixture | Promise<TenantDomainLookupFixture>): Promise<TenantDomainLookupVerdicts>;
```

## 声明文件 `types.d.ts`

```ts
export type JsonValue = null | boolean | number | string | readonly JsonValue[] | {
    readonly [key: string]: JsonValue;
};
export type StorageScope = Readonly<{
    kind: 'tenant';
    tenant: string;
}> | Readonly<{
    kind: 'system';
}>;
export type DomainRef = Readonly<{
    scope: StorageScope;
    transactionDomain: string;
}>;
export type ProtocolVersionV2 = '2';
export type SqlIdentity = Readonly<{
    scope: StorageScope;
    transactionDomain: string;
    operation: string;
    protocolVersion: ProtocolVersionV2;
    operationKey: string;
}>;
export type FactCommandV2 = Readonly<{
    participant: string;
    facts: Readonly<Record<string, JsonValue>>;
}>;
export type CommitRequestV2 = Readonly<{
    identity: SqlIdentity;
    combinationVersion: string;
    manifestDigest: string;
    commands: readonly FactCommandV2[];
}>;
export type CommitOptions = Readonly<{
    signal?: AbortSignal;
}>;
export type FailureCategory = 'participant_reported' | 'sql_error' | 'port_violation' | 'fact_violation' | 'participant_threw' | 'invalid_reply' | 'response_limit';
export type ParticipatedReply = Readonly<{
    kind: 'participated';
    response: JsonValue;
}>;
export type StoppingReply = Readonly<{
    kind: 'conflict';
    basis: JsonValue;
}> | Readonly<{
    kind: 'unsupported';
    basis: JsonValue;
}> | Readonly<{
    kind: 'failed';
    category: FailureCategory;
    diagnostic: string;
}>;
export type RecordedReply = ParticipatedReply | StoppingReply;
export type ParticipatedEntry = Readonly<{
    participant: string;
    protocol: string;
    reply: ParticipatedReply;
}>;
export type StoppingEntry = Readonly<{
    participant: string;
    protocol: string;
    reply: StoppingReply;
}>;
export type CommittedV2 = Readonly<{
    kind: 'committed';
    identity: SqlIdentity;
    inputDigest: string;
    combinationVersion: string;
    manifestDigest: string;
    responses: readonly [
        ParticipatedEntry,
        ...ParticipatedEntry[]
    ];
}>;
export type RolledBackV2 = Readonly<{
    kind: 'rolled_back';
    identity: SqlIdentity;
    inputDigest: string;
    combinationVersion: string;
    manifestDigest: string;
    responses: readonly [
        ...ParticipatedEntry[],
        StoppingEntry
    ];
}>;
export type ReceiptV2 = CommittedV2 | RolledBackV2;
export type StorageDiagnostic = string | null;
export type UnknownV2 = Readonly<{
    kind: 'unknown';
    identity: SqlIdentity;
    diagnostic: StorageDiagnostic;
}>;
export type IdentityConflictV2 = Readonly<{
    kind: 'identity_conflict';
    identity: SqlIdentity;
    existing: ReceiptV2;
}>;
export type CommitRejectReason = 'closing' | 'cancelled' | 'field_missing' | 'unsupported_protocol' | 'participant_repeated' | 'facts_not_json' | 'command_limit' | 'queue_full' | 'writer_not_current' | 'domain_unavailable' | 'combination_unregistered' | 'manifest_mismatch' | 'material_unavailable' | 'participant_not_in_combination' | 'participant_dependency_missing';
export type PreDecodeRejectReason = 'closing' | 'cancelled' | 'field_missing' | 'unsupported_protocol';
export type CommitRejectedV2 = Readonly<{
    kind: 'rejected_before_accept';
    identity: SqlIdentity | null;
    reason: PreDecodeRejectReason;
    diagnostic: StorageDiagnostic;
}> | Readonly<{
    kind: 'rejected_before_accept';
    identity: SqlIdentity;
    reason: Exclude<CommitRejectReason, PreDecodeRejectReason>;
    diagnostic: StorageDiagnostic;
}>;
export type CommitResultV2 = CommittedV2 | RolledBackV2 | UnknownV2 | IdentityConflictV2 | CommitRejectedV2;
export type NotCommittedV2 = Readonly<{
    kind: 'not_committed';
    identity: SqlIdentity;
    proofs: Readonly<{
        writerGenerationExcluded: true;
        oldTransactionTerminated: true;
        databaseRecoveryFinished: true;
        authoritativeReadSucceeded: true;
        operationNotQueued: true;
    }>;
}>;
export type QueryResultV2 = CommittedV2 | RolledBackV2 | UnknownV2 | NotCommittedV2;
export type RegistrationKey = Readonly<{
    scope: StorageScope;
    transactionDomain: string;
    combinationVersion: string;
}>;
export type CombinationRegistrationV2 = Readonly<{
    scope: StorageScope;
    transactionDomain: string;
    combinationVersion: string;
    manifestDigest: string;
    participants: readonly string[];
}>;
export type RegisterRejectReason = 'closing' | 'field_missing' | 'participant_empty' | 'participant_repeated' | 'material_unavailable' | 'combination_invalid' | 'manifest_mismatch' | 'queue_full' | 'writer_not_current' | 'domain_unavailable' | 'domain_occupied' | 'registration_conflict';
export type RegisterResultV2 = Readonly<{
    kind: 'registered';
    registration: CombinationRegistrationV2;
}> | Readonly<{
    kind: 'rejected_before_accept';
    reason: RegisterRejectReason;
    diagnostic: StorageDiagnostic;
}> | Readonly<{
    kind: 'unknown';
    key: RegistrationKey;
    diagnostic: StorageDiagnostic;
}>;
export type ReadOrdering = 'snapshot' | 'domain-serial';
export type ReadRequest = Readonly<{
    domain: DomainRef;
    handler: string;
    protocol: string;
    requestKey: string;
    input: JsonValue;
}>;
export type ReadOptions = Readonly<{
    signal?: AbortSignal;
}>;
export type ReadUnavailableReason = 'closing' | 'invalid' | 'read_limit' | 'handler_unavailable' | 'queue_full' | 'domain_unavailable' | 'schema_unavailable' | 'queue_timeout' | 'read_timeout' | 'worker_exited' | 'read_failed';
type PreDecodeReadReason = 'closing' | 'invalid';
export type ReadResult = Readonly<{
    kind: 'read';
    requestKey: string;
    output: JsonValue;
}> | Readonly<{
    kind: 'cancelled';
    requestKey: string | null;
}> | Readonly<{
    kind: 'unavailable';
    requestKey: string | null;
    reason: PreDecodeReadReason;
    diagnostic: StorageDiagnostic;
}> | Readonly<{
    kind: 'unavailable';
    requestKey: string;
    reason: Exclude<ReadUnavailableReason, PreDecodeReadReason>;
    diagnostic: StorageDiagnostic;
}>;
export interface SqlStorage {
    registerCombination(input: CombinationRegistrationV2): Promise<RegisterResultV2>;
    commit(input: CommitRequestV2, options?: CommitOptions): Promise<CommitResultV2>;
    query(identity: SqlIdentity): Promise<QueryResultV2>;
    read(input: ReadRequest, options?: ReadOptions): Promise<ReadResult>;
}
export type FactKey = Readonly<{
    key: string;
    protocol: string;
}>;
export type MigrationRef = Readonly<{
    owner: string;
    id: string;
}>;
export type GroupingDeclaration = 'groupable' | 'singleton';
export type ParticipantDescriptor = Readonly<{
    participant: string;
    protocol: string;
    moduleUrl: string;
    codeDigest: string;
    ownedTables: readonly string[];
    readTables: readonly string[];
    requiresFacts: readonly FactKey[];
    providesFacts: readonly FactKey[];
    allowedFunctions: readonly string[];
    grouping: GroupingDeclaration;
}>;
export type MigrationDescriptor = Readonly<{
    owner: string;
    id: string;
    moduleUrl: string;
    checksum: string;
    requires: readonly MigrationRef[];
}>;
export type ReadHandlerDescriptor = Readonly<{
    handler: string;
    protocol: string;
    moduleUrl: string;
    codeDigest: string;
    ordering: ReadOrdering;
    readTables: readonly string[];
    requiresMigrations: readonly MigrationRef[];
    maxOutputBytes: number;
    maxRowsRead: number;
}>;
export type DeclaredCombination = Readonly<{
    combinationVersion: string;
    participants: readonly string[];
}>;
export type SqlMaterialCatalog = Readonly<{
    catalogProtocol: 'sql-catalog/1';
    participants: readonly ParticipantDescriptor[];
    migrations: readonly MigrationDescriptor[];
    readHandlers: readonly ReadHandlerDescriptor[];
    declaredCombinations: Readonly<{
        tenant: DeclaredCombination | null;
        system: DeclaredCombination | null;
    }>;
}>;
export type ManifestParticipant = Omit<ParticipantDescriptor, 'moduleUrl'>;
export type ManifestMigration = Omit<MigrationDescriptor, 'moduleUrl'>;
export type CombinationManifest = Readonly<{
    manifestProtocol: 'sql-manifest/1';
    participants: readonly ManifestParticipant[];
    migrations: readonly ManifestMigration[];
}>;
export type CombinationProblem = Readonly<{
    kind: 'fact_cycle';
    participants: readonly string[];
}> | Readonly<{
    kind: 'fact_unprovided';
    participant: string;
    fact: FactKey;
}> | Readonly<{
    kind: 'fact_provided_twice';
    fact: FactKey;
    participants: readonly string[];
}> | Readonly<{
    kind: 'table_owned_twice';
    table: string;
    participants: readonly string[];
}> | Readonly<{
    kind: 'read_table_unowned';
    participant: string;
    table: string;
}> | Readonly<{
    kind: 'migration_missing';
    required: MigrationRef;
}> | Readonly<{
    kind: 'migration_cycle';
    migrations: readonly MigrationRef[];
}>;
export type CombinationManifestResult = Readonly<{
    kind: 'manifest';
    manifest: CombinationManifest;
}> | Readonly<{
    kind: 'material_unavailable';
    participant: string;
}> | Readonly<{
    kind: 'combination_invalid';
    problems: readonly CombinationProblem[];
}>;
export type CloseLeaseHandle = object;
export interface CloseLeasePort {
    admit(name: string): CloseLeaseHandle;
    release(handle: CloseLeaseHandle): void;
}
export type CloseInitiator = 'assembly' | 'disposal';
export type StorageResidual = Readonly<{
    domain: DomainRef;
    workerRole: 'writer' | 'reader';
    workerGeneration: string;
    leaseName: string;
    inFlight: readonly SqlIdentity[];
}>;
export type StorageCloseResult = Readonly<{
    kind: 'closed';
}> | Readonly<{
    kind: 'incomplete';
    residuals: readonly StorageResidual[];
}>;
export interface StorageControl {
    close(input: Readonly<{
        initiator: CloseInitiator;
    }>): Promise<StorageCloseResult>;
    assemblyReportSettled(): void;
}
export interface StorageHost {
    readonly materials: SqlMaterialCatalog;
    readonly closeLeases: CloseLeasePort;
    attachControl(control: StorageControl): void;
}
export type TenantDomain = Readonly<{
    tenant: string;
    domain: DomainRef;
}>;
export type TenantDomainResolution = Readonly<{
    kind: 'ready';
    entry: TenantDomain;
}> | Readonly<{
    kind: 'unavailable';
    diagnostic: string;
}>;
export type TenantDomainSnapshot = Readonly<{
    revision: string;
    entries: readonly TenantDomain[];
}>;
export type TenantDomainSnapshotResult = Readonly<{
    kind: 'ready';
    value: TenantDomainSnapshot;
}> | Readonly<{
    kind: 'unavailable';
    diagnostic: string;
}>;
export interface TenantDomainAccess {
    resolve(input: Readonly<{
        tenant: string;
    }>): Promise<TenantDomainResolution>;
    snapshot(): Promise<TenantDomainSnapshotResult>;
}
export type TenantDomainListing = Readonly<{
    kind: 'ready';
    revision: string;
    entries: readonly TenantDomain[];
}> | Readonly<{
    kind: 'denied';
}> | Readonly<{
    kind: 'unavailable';
    diagnostic: string;
}>;
export interface TenantDomains<P> {
    enumerate(input: Readonly<{
        principal: P;
    }>): Promise<TenantDomainListing>;
}
export type TenantDomainLookupResult = Readonly<{
    kind: 'ready';
    domain: DomainRef;
}> | Readonly<{
    kind: 'unregistered';
}> | Readonly<{
    kind: 'unavailable';
    diagnostic: string;
}>;
export interface TenantDomainLookup {
    lookup(input: Readonly<{
        tenant: string;
    }>): Promise<TenantDomainLookupResult>;
}
export type OperationIdentityV1 = Readonly<{
    tenant: string;
    transactionDomain: string;
    operation: string;
    protocolVersion: '1';
    operationKey: string;
}>;
export type QueryResultV1 = Readonly<{
    kind: 'committed';
    identity: OperationIdentityV1;
    inputDigest: string;
}> | Readonly<{
    kind: 'rolled_back';
    identity: OperationIdentityV1;
    inputDigest: string;
}> | Readonly<{
    kind: 'unknown';
    identity: OperationIdentityV1;
}> | Readonly<{
    kind: 'not_committed';
    identity: OperationIdentityV1;
    proofs: NotCommittedV2['proofs'];
}>;
export interface SqlStorageProtocol1Query {
    queryProtocol1(identity: OperationIdentityV1): Promise<QueryResultV1>;
}
export {};
```

## 声明文件 `worker.d.ts`

```ts
import type { FactKey, JsonValue, ParticipatedReply } from './types.ts';
export type SqlValue = null | boolean | number | bigint | string | Uint8Array;
export type SqlCell = null | number | bigint | string | Uint8Array;
export type QueryRows = Readonly<{
    columns: readonly string[];
    rows: readonly (readonly SqlCell[])[];
    changes: bigint;
    lastInsertRowid: bigint | null;
}>;
export interface ParticipantPort {
    execute(sql: string, params: readonly SqlValue[]): QueryRows;
    requireFact(key: FactKey): JsonValue;
    provideFact(key: FactKey, value: JsonValue): void;
}
export type ParticipantReply = ParticipatedReply | Readonly<{
    kind: 'conflict';
    basis: JsonValue;
}> | Readonly<{
    kind: 'unsupported';
    basis: JsonValue;
}> | Readonly<{
    kind: 'failed';
    diagnostic: string;
}>;
export interface ParticipantModule {
    readonly participant: string;
    readonly protocol: string;
    execute(facts: Readonly<Record<string, JsonValue>>, port: ParticipantPort): ParticipantReply;
}
export interface MigrationPort {
    execute(sql: string, params: readonly SqlValue[]): QueryRows;
}
export type MigrationVerdict = Readonly<{
    kind: 'verified';
}> | Readonly<{
    kind: 'failed';
    diagnostic: string;
}>;
export interface MigrationModule {
    readonly owner: string;
    readonly id: string;
    up(port: MigrationPort): void;
    verify(port: MigrationPort): MigrationVerdict;
}
export interface ReadPort {
    execute(sql: string, params: readonly SqlValue[]): QueryRows;
}
export type HandlerOutcome = Readonly<{
    kind: 'read';
    output: JsonValue;
}> | Readonly<{
    kind: 'failed';
    diagnostic: string;
}>;
export interface ReadHandlerModule {
    readonly handler: string;
    readonly protocol: string;
    read(input: JsonValue, port: ReadPort): HandlerOutcome;
}
```
