# @omne-harness/execution-environment-contract 的 API 快照

> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。

## 入口 `.`

### `Access`

```ts
type Access<P> = Readonly<{
    principal: P;
    tenant: TenantId;
}>;
```

### `AcquireInput`

```ts
type AcquireInput<P> = Readonly<{
    acquisition: AcquisitionRef;
    origin: OriginRef;
    scope: ScopeRef;
    placement: Placement;
    ledger: ResourceLedger;
    guard: FacilityGuard<P>;
}>;
```

### `Acquired`

```ts
type Acquired = Readonly<{
    kind: 'acquired';
    lease: EnvironmentLease;
    adoption: EnvironmentAdoption;
}>;
```

### `AcquisitionRef`

```ts
type AcquisitionRef = string & {
    readonly __acquisition: unique symbol;
};
```

### `AcquisitionState`

```ts
type AcquisitionState = {
    readonly kind: 'unrecorded';
} | {
    readonly kind: 'invalidInput';
} | {
    readonly kind: 'acquiring';
} | {
    readonly kind: 'provisional';
} | {
    readonly kind: 'acquired';
    readonly adoption: EnvironmentAdoption;
} | {
    readonly kind: 'rejected';
    readonly reason: RejectReason;
} | {
    readonly kind: 'invalidated';
    readonly adoption: EnvironmentAdoption;
    readonly invalidation: LeaseInvalidation;
} | {
    readonly kind: 'releasing';
    readonly adoption: EnvironmentAdoption;
} | {
    readonly kind: 'pendingRelease';
    readonly adoption: EnvironmentAdoption | null;
    readonly resources: readonly ManagedResource[];
} | {
    readonly kind: 'released';
    readonly adoption: EnvironmentAdoption;
};
```

### `BindingKind`

```ts
type BindingKind = EnvironmentBinding['kind'];
```

### `CommandFacility`

```ts
interface CommandFacility<P> {
    start(request: FacilityRequest<P> & {
        readonly executable: string;
        readonly args: readonly string[];
        readonly cwd: string;
        readonly env: Readonly<Record<string, string>>;
        readonly stdin?: Uint8Array;
        readonly outputMode: 'separate' | 'terminal';
        readonly geometry?: {
            readonly columns: number;
            readonly rows: number;
        };
    }): Promise<FacilityResult<ProcessHandle>>;
}
```

### `CommandOutcome`

```ts
type CommandOutcome = {
    readonly kind: 'completed';
    readonly exit: {
        readonly kind: 'code';
        readonly code: number;
    } | {
        readonly kind: 'signal';
        readonly signal: string;
    } | {
        readonly kind: 'unknown';
    };
    readonly durationMs: number;
    readonly output: OutputSummary;
} | {
    readonly kind: 'failed';
    readonly reason: 'unavailable' | 'effectUnknown';
    readonly observedDurationMs: number;
    readonly output: OutputSummary;
};
```

### `DecodeIssue` = `Issue`

```ts
type Issue = Readonly<{
    message: string;
    path: Path;
}>;
```

### `EnvironmentAdoption`

```ts
type EnvironmentAdoption = Readonly<{
    acquisition: AcquisitionRef;
    origin: OriginRef;
    placement: Placement;
    provider: ProviderIdentity;
    instance: InstanceIdentity;
    continuity: EnvironmentContinuity;
    evidence: JsonValue;
}>;
```

### `EnvironmentBinding`

```ts
type EnvironmentBinding = {
    readonly kind: 'host_machine';
} | {
    readonly kind: 'stateless_sandbox';
    readonly scope: ScopeRef;
    readonly origin: OriginRef;
} | {
    readonly kind: 'session_sandbox';
    readonly scope: ScopeRef;
} | {
    readonly kind: 'tenant_sandbox';
    readonly tenant: TenantId;
};
```

### `EnvironmentContinuity`

```ts
type EnvironmentContinuity = {
    readonly kind: 'not_guaranteed';
} | {
    readonly kind: 'continuous';
    readonly data: string;
    readonly revision: string;
} | {
    readonly kind: 'lost';
    readonly previous: string;
};
```

### `EnvironmentDescription`

```ts
type EnvironmentDescription = Readonly<{
    acquisition: AcquisitionRef;
    origin: OriginRef;
    binding: EnvironmentBinding;
    provider: ProviderIdentity;
    instance: InstanceIdentity;
    continuity: EnvironmentContinuity;
    facilities: readonly FacilityKey[];
    state: Exclude<AcquisitionState['kind'], 'invalidInput'>;
}>;
```

### `EnvironmentFacilities`

```ts
interface EnvironmentFacilities {
}
```

### `EnvironmentLease`

```ts
interface EnvironmentLease<K extends FacilityKey = FacilityKey> {
    readonly placement: Placement;
    readonly instance: InstanceIdentity;
    readonly continuity: EnvironmentContinuity;
    facility<F extends K>(key: F): EnvironmentFacilities[F] | undefined;
    readonly invalidated: Promise<LeaseInvalidation>;
    release(): Promise<LeaseRelease>;
}
```

### `EnvironmentNeedDeclaration`

```ts
type EnvironmentNeedDeclaration = Readonly<{
    facilities: readonly FacilityKey[];
    isolation: readonly IsolationClaim[];
    layers: readonly BindingKind[];
}>;
```

### `EnvironmentProvider`

```ts
interface EnvironmentProvider {
    readonly name: string;
    readonly generation: string;
    readonly version: string;
    readonly bindingKinds: readonly BindingKind[];
    readonly continuity: EnvironmentContinuity;
    readonly facilities: readonly FacilityKey[];
    readonly isolation: readonly IsolationClaim[];
    describe(): Promise<ProviderFacts>;
    acquire(input: ProviderAcquireInput): Promise<ProviderAcquisition>;
    listRecoveryResources?(scope: ScopeRef): Promise<RecoveryListing>;
    recover?(resource: ManagedResource): Promise<ResourceRecovery>;
    retire(): Promise<Retirement>;
}
```

### `EnvironmentRequirement`

```ts
interface EnvironmentRequirement {
    readonly allowedBindings: readonly EnvironmentBinding[];
    readonly facilities: readonly FacilityKey[];
    readonly isolation: readonly IsolationClaim[];
}
```

### `ExecutionEnvironment`

```ts
interface ExecutionEnvironment<P> {
    resolvePlacement(access: Access<P>, input: PlacementInput): Promise<Placement | Rejected>;
    acquire(access: Access<P>, input: AcquireInput<P>): Promise<Acquired | Pending | Rejected>;
    inspectAcquisition(access: Access<P>, acquisition: AcquisitionRef): Promise<AcquisitionState>;
    describe(access: Access<P>, scope: ScopeRef): Promise<readonly EnvironmentDescription[] | Rejected>;
    recoverOwned(scope: ScopeRef, access: RecoveryAccess): Promise<OwnedRecovery | Rejected>;
    releaseScope(scope: ScopeRef, access: RecoveryAccess): Promise<OwnedRecovery | Rejected>;
}
```

### `ExecutionHostFactsValue`

```ts
type ExecutionHostFactsValue = Readonly<{
    date: HostDate;
    providers: readonly ProviderFacts[];
}>;
```

### `ExecutionPlacementEntry`

```ts
type ExecutionPlacementEntry = Readonly<{
    origin: OriginRef;
    binding: EnvironmentBinding;
    instance: InstanceIdentity;
    continuity: EnvironmentContinuity;
    facilities: readonly FacilityKey[];
    observedAt: number;
}>;
```

### `ExecutionPlacementValue`

```ts
type ExecutionPlacementValue = readonly ExecutionPlacementEntry[];
```

### `FacilityDescriptor`

```ts
interface FacilityDescriptor<K extends FacilityKey> {
    readonly key: K;
    readonly operations: readonly FacilityOperation<K>[];
    readonly guarded: readonly FacilityOperation<K>[];
}
```

### `FacilityGuard`

```ts
interface FacilityGuard<P> {
    authorize(facility: FacilityKey, operation: string, request: FacilityRequest<P>): Promise<'authorized' | 'notAuthorized' | 'unavailable'>;
}
```

### `FacilityKey`

```ts
type FacilityKey = keyof EnvironmentFacilities & string;
```

### `FacilityOperation`

```ts
type FacilityOperation<K extends FacilityKey> = keyof EnvironmentFacilities[K] & string;
```

### `FacilityReason`

```ts
type FacilityReason = 'invalidInput' | 'notAuthorized' | 'notFound' | 'conflict' | 'busy' | 'capacity' | 'unsupported' | 'closed' | 'unavailable' | 'effectUnknown';
```

### `FacilityRequest`

```ts
interface FacilityRequest<P> {
    readonly requestId: string;
    readonly access: Access<P>;
    readonly origin: OriginRef;
    readonly binding: EnvironmentBinding;
}
```

### `FacilityResult`

```ts
type FacilityResult<T> = {
    readonly kind: 'done';
    readonly requestId: string;
    readonly value: T;
} | {
    readonly kind: 'unresolved';
    readonly requestId: string;
} | {
    readonly kind: 'rejected';
    readonly requestId: string;
    readonly reason: FacilityReason;
} | {
    readonly kind: 'unknown';
    readonly requestId: string;
};
```

### `FacilitySet`

```ts
type FacilitySet<K extends FacilityKey> = Pick<EnvironmentFacilities, K>;
```

### `FileBatchOutcome`

```ts
type FileBatchOutcome = {
    readonly batch: FileBatchRef;
    readonly published: readonly string[];
} & ({
    readonly kind: 'committed';
} | {
    readonly kind: 'unknown';
    readonly reason: 'effectUnknown' | 'conflict' | 'closed' | 'unavailable';
});
```

### `FileBatchRecognition`

```ts
type FileBatchRecognition = {
    readonly batch: FileBatchRef;
    readonly state: 'complete' | 'partial' | 'interrupted' | 'conflict' | 'pending';
    readonly published: readonly string[];
    readonly matchingPrepared: readonly string[];
    readonly conflicting: readonly string[];
};
```

### `FileBatchRef`

```ts
type FileBatchRef = {
    readonly id: string;
    readonly generation: string;
};
```

### `FileIdentity`

```ts
type FileIdentity = {
    readonly object: ObjectToken;
    readonly handle: HandleGeneration;
    readonly version: FileVersion;
};
```

### `FileInformation`

```ts
type FileInformation = FileIdentity & {
    readonly type: 'file' | 'directory' | 'symlink';
    readonly sizeBytes: number;
    readonly modifiedMs: number;
};
```

### `FileRequest`

```ts
type FileRequest<P> = FacilityRequest<P> & {
    readonly path: string;
    readonly named: ObjectToken | null;
};
```

### `FileSystemFacility`

```ts
interface FileSystemFacility<P> {
    read(request: FileRequest<P> & {
        readonly offsetBytes?: number;
        readonly limitBytes?: number;
    }): Promise<FacilityResult<FileIdentity & {
        readonly bytes: Uint8Array;
        readonly nextOffsetBytes: number;
        readonly eof: boolean;
    }>>;
    stat(request: FileRequest<P>): Promise<FacilityResult<FileInformation>>;
    write(request: FileRequest<P> & {
        readonly bytes: Uint8Array;
        readonly mode: 'create' | 'replace';
        readonly expectedVersion?: FileVersion;
    }): Promise<FacilityResult<FileIdentity>>;
    close(request: FileRequest<P> & {
        readonly handle: HandleGeneration;
    }): Promise<FacilityResult<{
        readonly handle: HandleGeneration;
    }>>;
    list(request: FileRequest<P> & {
        readonly offset?: number;
        readonly limit?: number;
    }): Promise<FacilityResult<{
        readonly directory: FileIdentity;
        readonly entries: readonly FileInformation[];
        readonly nextOffset?: number;
    }>>;
    search(request: FileRequest<P> & {
        readonly pattern: Uint8Array;
        readonly match: 'name' | 'content';
        readonly recursive: boolean;
        readonly offset?: number;
        readonly limit?: number;
    }): Promise<FacilityResult<{
        readonly root: FileIdentity;
        readonly hits: readonly {
            readonly path: string;
            readonly object: ObjectToken;
            readonly offsetBytes?: number;
        }[];
        readonly nextOffset?: number;
        readonly truncated: boolean;
    }>>;
    mkdir(request: FileRequest<P> & {
        readonly parents: boolean;
    }): Promise<FacilityResult<FileIdentity>>;
    remove(request: FileRequest<P> & {
        readonly recursive: boolean;
        readonly expectedVersion?: FileVersion;
    }): Promise<FacilityResult<{
        readonly removed: ObjectToken;
    }>>;
    move(request: FileRequest<P> & {
        readonly target: FileTarget;
        readonly replace: boolean;
        readonly expectedVersion?: FileVersion;
    }): Promise<FacilityResult<{
        readonly source: ObjectToken;
        readonly target: FileIdentity;
    }>>;
    copy(request: FileRequest<P> & {
        readonly target: FileTarget;
        readonly replace: boolean;
        readonly expectedVersion?: FileVersion;
    }): Promise<FacilityResult<{
        readonly source: ObjectToken;
        readonly target: FileIdentity;
    }>>;
    commitBatch(request: FacilityRequest<P> & {
        readonly entries: readonly {
            readonly path: string;
            readonly named: ObjectToken | null;
            readonly bytes: Uint8Array;
            readonly expectedVersion: FileVersion | null;
        }[];
    }): Promise<FacilityResult<FileBatchOutcome>>;
    recoverBatch(request: FacilityRequest<P> & {
        readonly batch: FileBatchRef;
    }): Promise<FacilityResult<FileBatchRecognition>>;
}
```

### `FileTarget`

```ts
type FileTarget = {
    readonly path: string;
    readonly named: ObjectToken | null;
};
```

### `FileVersion`

```ts
type FileVersion = string;
```

### `HandleGeneration`

```ts
type HandleGeneration = {
    readonly object: ObjectToken;
    readonly generation: string;
};
```

### `HostDate`

```ts
type HostDate = string & {
    readonly __hostDate: unique symbol;
};
```

### `InstanceIdentity`

```ts
type InstanceIdentity = Readonly<{
    id: string;
    generation: string;
}>;
```

### `IsolationClaim`

```ts
type IsolationClaim = keyof IsolationClaims & string;
```

### `IsolationClaims`

```ts
interface IsolationClaims {
    readonly process: true;
    readonly 'filesystem-root': true;
    readonly 'network-none': true;
    readonly 'restricted-js': true;
}
```

### `LeaseInvalidation`

```ts
type LeaseInvalidation = {
    readonly source: 'registry';
    readonly reason: RegistryInvalidationReason;
} | {
    readonly source: 'provider';
    readonly reason: string;
};
```

### `LeaseRelease`

```ts
type LeaseRelease = {
    readonly kind: 'released';
} | {
    readonly kind: 'pending';
    readonly resources: readonly ManagedResource[];
};
```

### `ManagedResource`

```ts
interface ManagedResource {
    readonly key: string;
    readonly provider: string;
    readonly reference: JsonValue;
}
```

### `ObjectToken`

```ts
type ObjectToken = {
    readonly token: string;
};
```

### `OperationName`

```ts
type OperationName = keyof ExecutionEnvironment<unknown> | 'registerFacility' | 'registerProvider';
```

### `OperationSchema`

```ts
type OperationSchema<T> = StandardSchemaV1<unknown, T> & StandardTyped<T>;
```

### `OriginRef`

```ts
type OriginRef = string & {
    readonly __origin: unique symbol;
};
```

### `OutputChunk`

```ts
type OutputChunk = {
    readonly stream: 'stdout' | 'stderr' | 'terminal';
    readonly data: Uint8Array;
    readonly observedOffset: number;
};
```

### `OutputCount`

```ts
type OutputCount = {
    readonly observedBytes: number;
    readonly discardedBytes: number;
};
```

### `OutputPolicy`

```ts
type OutputPolicy = {
    readonly maxBufferedBytes: number;
    readonly maxChunkBytes: number;
    readonly overflow: 'discard';
};
```

### `OutputSummary`

```ts
type OutputSummary = {
    readonly mode: 'separate';
    readonly stdout: OutputCount;
    readonly stderr: OutputCount;
} | {
    readonly mode: 'terminal';
    readonly terminal: OutputCount;
};
```

### `OwnedRecovery`

```ts
type OwnedRecovery = Readonly<{
    kind: 'recovered';
    scope: ScopeRef;
    stopped: readonly ManagedResource[];
    pending: readonly ManagedResource[];
    unsupported: readonly UnsupportedRecovery[];
    unavailable: readonly ProviderIdentity[];
}>;
```

### `Pending`

```ts
type Pending = Readonly<{
    kind: 'pending';
    state: Exclude<AcquisitionState, {
        readonly kind: 'unrecorded' | 'invalidInput' | 'acquired' | 'rejected';
    }>;
}>;
```

### `Placement`

```ts
type Placement = Readonly<{
    kind: 'placement';
    requirement: EnvironmentRequirement;
    binding: EnvironmentBinding;
    provider: ProviderIdentity;
    continuity: EnvironmentContinuity;
}>;
```

### `PlacementInput`

```ts
type PlacementInput = Readonly<{
    scope: ScopeRef;
    requirement: EnvironmentRequirement;
}>;
```

### `PlatformFacts`

```ts
type PlatformFacts = Readonly<{
    os: string;
    release: string;
}>;
```

### `ProcessHandle`

```ts
interface ProcessHandle {
    readonly process: {
        readonly id: string;
        readonly generation: string;
    };
    readonly outputMode: 'separate' | 'terminal';
    readonly output: AsyncIterable<OutputChunk>;
    readonly outputPolicy: OutputPolicy;
    readonly result: Promise<CommandOutcome>;
    stop(mode: 'graceful' | 'forced'): Promise<'confirmed' | 'unconfirmed'>;
}
```

### `ProviderAcquireInput`

```ts
type ProviderAcquireInput = Readonly<{
    acquisition: AcquisitionRef;
    origin: OriginRef;
    scope: ScopeRef;
    placement: Placement;
    tenant: TenantId;
    ledger: ResourceLedger;
}>;
```

### `ProviderAcquisition`

```ts
type ProviderAcquisition = Readonly<{
    kind: 'acquired';
    lease: EnvironmentLease;
    evidence: JsonValue;
}> | Rejected;
```

### `ProviderCapabilities`

```ts
type ProviderCapabilities = Pick<EnvironmentProvider, 'bindingKinds' | 'facilities' | 'isolation'>;
```

### `ProviderFacts`

```ts
type ProviderFacts = Readonly<{
    provider: string;
    generation: string;
    version: string;
    platform: PlatformFacts;
    facilities: readonly FacilityKey[];
    isolation: readonly IsolationClaim[];
    prerequisites: 'satisfied' | 'unsatisfied' | 'unknown';
}>;
```

### `ProviderIdentity`

```ts
type ProviderIdentity = Readonly<{
    name: string;
    generation: string;
    version: string;
}>;
```

### `ProviderMatch`

```ts
type ProviderMatch<T extends ProviderCapabilities> = Readonly<{
    kind: 'matched';
    provider: T;
    binding: EnvironmentBinding;
}>;
```

### `ProviderRegistrations`

```ts
interface ProviderRegistrations {
    registerFacility<K extends FacilityKey>(descriptor: FacilityDescriptor<K>): () => Promise<void>;
    registerProvider(provider: EnvironmentProvider): () => Promise<void>;
}
```

### `RecoveryAccess`

```ts
interface RecoveryAccess {
    readonly [recoveryAccessMark]: true;
}
```

### `RecoveryAuthority`

```ts
interface RecoveryAuthority {
    authorizeRecovery(access: RecoveryAccess, scope: ScopeRef, resources: readonly ManagedResource[]): Promise<'authorized' | 'notAuthorized' | 'unavailable'>;
}
```

### `RecoveryListing`

```ts
type RecoveryListing = Readonly<{
    kind: 'listed';
    resources: readonly ManagedResource[];
}> | Readonly<{
    kind: 'unavailable';
}>;
```

### `RegistryInvalidationReason`

```ts
type RegistryInvalidationReason = 'providerRetired' | 'scopeReleased' | 'registryClosed' | 'released' | 'providerInvalidated';
```

### `RejectReason`

```ts
type RejectReason = 'notAuthorized' | 'noMatchingEnvironment' | 'missingFacility' | 'unsupportedFacility' | 'isolationUnconfirmed' | 'referenceExpired' | 'providerUnavailable' | 'ownerStopped' | 'invalidInput' | 'unavailable' | 'ambiguousEnvironment' | 'callerMismatch';
```

### `Rejected`

```ts
type Rejected = Readonly<{
    kind: 'rejected';
    reason: RejectReason;
}>;
```

### `RequirementRefusal`

```ts
type RequirementRefusal = Readonly<{
    reason: 'invalidInput';
    issues: readonly Issue[];
}>;
```

### `ResourceLedger`

```ts
interface ResourceLedger {
    readonly closed: AbortSignal;
    plan(resource: ManagedResource): Promise<'recorded' | 'conflict' | 'closed' | 'unavailable'>;
    permit(key: string): Promise<'confirmed' | 'closed' | 'unavailable'>;
    adopt(key: string): Promise<'confirmed' | 'closed' | 'unavailable'>;
    stopped(key: string, status: 'confirmed' | 'unconfirmed'): Promise<'recorded' | 'unavailable'>;
}
```

### `ResourceRecovery`

```ts
type ResourceRecovery = Readonly<{
    status: 'confirmedStopped' | 'pending' | 'unsupported';
    evidence: JsonValue | null;
}>;
```

### `Retirement`

```ts
type Retirement = Readonly<{
    kind: 'drained';
}> | Readonly<{
    kind: 'pending';
    resources: readonly ManagedResource[];
}>;
```

### `TerminalFacility`

```ts
interface TerminalFacility<P> {
    create(request: FacilityRequest<P> & {
        readonly cwd: string;
        readonly env: Readonly<Record<string, string>>;
        readonly geometry?: {
            readonly columns: number;
            readonly rows: number;
        };
    }): Promise<FacilityResult<{
        readonly terminal: TerminalRef;
    }>>;
    execute(request: FacilityRequest<P> & {
        readonly terminal: TerminalRef;
        readonly script: string;
        readonly cwd?: string;
        readonly env?: Readonly<Record<string, string>>;
        readonly stdin?: Uint8Array;
    }): Promise<FacilityResult<ProcessHandle>>;
    close(request: FacilityRequest<P> & {
        readonly terminal: TerminalRef;
    }): Promise<FacilityResult<{
        readonly status: 'confirmed' | 'unconfirmed';
    }>>;
    list(request: FacilityRequest<P>): Promise<FacilityResult<readonly TerminalInformation[]>>;
}
```

### `TerminalInformation`

```ts
type TerminalInformation = {
    readonly terminal: TerminalRef;
    readonly state: 'idle' | 'running' | 'invalid' | 'closed';
    readonly observedCwd: string;
};
```

### `TerminalRef`

```ts
type TerminalRef = {
    readonly id: string;
    readonly generation: string;
};
```

### `UnsupportedRecovery`

```ts
type UnsupportedRecovery = Readonly<{
    kind: 'provider';
    provider: ProviderIdentity;
}> | Readonly<{
    kind: 'resource';
    resource: ManagedResource;
}>;
```

### `acquireParamsSchema`

```ts
const acquireParamsSchema: OperationSchema<Parameters<ExecutionEnvironment<unknown>['acquire']>>;
```

### `acquireResultSchema`

```ts
const acquireResultSchema: OperationSchema<Awaited<ReturnType<ExecutionEnvironment<unknown>['acquire']>>>;
```

### `acquisitionRef`

```ts
function acquisitionRef(text: string): AcquisitionRef;
```

### `bindingKinds`

```ts
const bindingKinds: readonly BindingKind[];
```

### `bindingScope`

```ts
function bindingScope(binding: EnvironmentBinding): ScopeRef | undefined;
```

### `commandFacility`

```ts
const commandFacility: FacilityDescriptor<'command'>;
```

### `createRecoveryAccess`

```ts
function createRecoveryAccess(): RecoveryAccess;
```

### `describeFacility`

```ts
function describeFacility<K extends FacilityKey>(key: K, operations: {
    readonly [O in FacilityOperation<K>]: 'guarded' | 'open';
}): FacilityDescriptor<K>;
```

### `describeParamsSchema`

```ts
const describeParamsSchema: OperationSchema<Parameters<ExecutionEnvironment<unknown>['describe']>>;
```

### `describeResultSchema`

```ts
const describeResultSchema: OperationSchema<Awaited<ReturnType<ExecutionEnvironment<unknown>['describe']>>>;
```

### `environmentNeedAdoption`

```ts
const environmentNeedAdoption: Readonly<{
    owner: 'execution-environment';
    name: 'environment-need';
    revision: '1';
    digest: `sha256:${string}`;
}>;
```

### `environmentNeedSchema`

```ts
const environmentNeedSchema: StandardSchemaV1<unknown, EnvironmentNeedDeclaration> & StandardTyped<EnvironmentNeedDeclaration>;
```

### `executionHostFactsBlock`

```ts
const executionHostFactsBlock: SuppliedBlockDescriptor<'execution.host-facts', ExecutionHostFactsValue>;
```

### `executionPlacementBlock`

```ts
const executionPlacementBlock: SuppliedBlockDescriptor<'execution.placement', ExecutionPlacementValue>;
```

### `filesFacility`

```ts
const filesFacility: FacilityDescriptor<'files'>;
```

### `inspectAcquisitionParamsSchema`

```ts
const inspectAcquisitionParamsSchema: OperationSchema<Parameters<ExecutionEnvironment<unknown>['inspectAcquisition']>>;
```

### `inspectAcquisitionResultSchema`

```ts
const inspectAcquisitionResultSchema: OperationSchema<Awaited<ReturnType<ExecutionEnvironment<unknown>['inspectAcquisition']>>>;
```

### `judgeRequirement`

```ts
function judgeRequirement(value: unknown): Outcome<EnvironmentRequirement, RequirementRefusal>;
```

### `managedResourceSchema`

```ts
const managedResourceSchema: StandardSchemaV1<unknown, {
    readonly key: string;
    readonly provider: string;
    readonly reference: import("@omne-harness/json-text").JsonValue;
}> & StandardTyped<{
    readonly key: string;
    readonly provider: string;
    readonly reference: import("@omne-harness/json-text").JsonValue;
}>;
```

### `matchProviders`

```ts
function matchProviders<T extends ProviderCapabilities>(providers: readonly T[], requirement: EnvironmentRequirement): ProviderMatch<T> | Rejected;
```

### `operationSchemas`

```ts
const operationSchemas: EnvironmentSchemas & Readonly<{
    registerFacility: Readonly<{
        params: typeof registerFacilityParamsSchema;
    }>;
    registerProvider: Readonly<{
        params: typeof registerProviderParamsSchema;
    }>;
}>;
```

### `originRef`

```ts
function originRef(text: string): OriginRef;
```

### `providerFactsSchema`

```ts
const providerFactsSchema: StandardSchemaV1<unknown, Readonly<{
    provider: string;
    generation: string;
    version: string;
    platform: import("./environment.ts").PlatformFacts;
    facilities: readonly import("./facility.ts").FacilityKey[];
    isolation: readonly import("./requirement.ts").IsolationClaim[];
    prerequisites: 'satisfied' | 'unsatisfied' | 'unknown';
}>> & StandardTyped<Readonly<{
    provider: string;
    generation: string;
    version: string;
    platform: import("./environment.ts").PlatformFacts;
    facilities: readonly import("./facility.ts").FacilityKey[];
    isolation: readonly import("./requirement.ts").IsolationClaim[];
    prerequisites: 'satisfied' | 'unsatisfied' | 'unknown';
}>>;
```

### `recoverOwnedParamsSchema`

```ts
const recoverOwnedParamsSchema: OperationSchema<Parameters<ExecutionEnvironment<unknown>['recoverOwned']>>;
```

### `recoverOwnedResultSchema`

```ts
const recoverOwnedResultSchema: OperationSchema<Awaited<ReturnType<ExecutionEnvironment<unknown>['recoverOwned']>>>;
```

### `registerFacilityParamsSchema`

```ts
const registerFacilityParamsSchema: OperationSchema<[
    Readonly<{
        key: import('./facility.ts').FacilityKey;
        operations: readonly string[];
        guarded: readonly string[];
    }>
]>;
```

### `registerProviderParamsSchema`

```ts
const registerProviderParamsSchema: OperationSchema<[
    EnvironmentProvider
]>;
```

### `releaseScopeParamsSchema`

```ts
const releaseScopeParamsSchema: OperationSchema<Parameters<ExecutionEnvironment<unknown>['releaseScope']>>;
```

### `releaseScopeResultSchema`

```ts
const releaseScopeResultSchema: OperationSchema<Awaited<ReturnType<ExecutionEnvironment<unknown>['releaseScope']>>>;
```

### `resolvePlacementParamsSchema`

```ts
const resolvePlacementParamsSchema: OperationSchema<Parameters<ExecutionEnvironment<unknown>['resolvePlacement']>>;
```

### `resolvePlacementResultSchema`

```ts
const resolvePlacementResultSchema: OperationSchema<Awaited<ReturnType<ExecutionEnvironment<unknown>['resolvePlacement']>>>;
```

### `terminalFacility`

```ts
const terminalFacility: FacilityDescriptor<'terminal'>;
```

## 入口 `./testing`

### `CaseVerdict`

```ts
type CaseVerdict = Readonly<{
    name: string;
    status: 'pass' | 'not-applicable';
    reason?: string;
}>;
```

### `ConformanceCase`

```ts
type ConformanceCase = Readonly<{
    name: string;
    run(): Promise<void>;
}>;
```

### `EnvironmentConformanceOptions`

```ts
type EnvironmentConformanceOptions<P> = Readonly<{
    subject(): EnvironmentConformanceSubject<P> | Promise<EnvironmentConformanceSubject<P>>;
    waitMs?: number;
}>;
```

### `EnvironmentConformanceSubject`

```ts
type EnvironmentConformanceSubject<P> = Readonly<{
    environment: ExecutionEnvironment<P> & ProviderRegistrations;
    access: Access<P>;
    otherAccess?: Access<P>;
    scope: ProviderAcquireInput['scope'];
    hooks?: {
        close?(): Promise<void>;
    };
    dispose?(): Promise<void>;
}>;
```

### `MemoryResourceLedger`

```ts
type MemoryResourceLedger = ReturnType<typeof createMemoryResourceLedger>;
```

### `NotApplicable`

```ts
class NotApplicable extends Error {
}
```

### `ProviderConformanceOptions`

```ts
type ProviderConformanceOptions = Readonly<{
    subject(): ProviderConformanceSubject | Promise<ProviderConformanceSubject>;
    waitMs?: number;
}>;
```

### `ProviderConformanceSubject`

```ts
type ProviderConformanceSubject = Readonly<{
    provider: EnvironmentProvider;
    binding: EnvironmentBinding;
    scope: ProviderAcquireInput['scope'];
    tenant: ProviderAcquireInput['tenant'];
    facility: FacilityKey;
    hooks?: {
        prepareHeldOperation?(context: Readonly<{
            lease: EnvironmentLease;
            input: ProviderAcquireInput;
        }>): Promise<{
            run(): Promise<FacilityResult<unknown>>;
            effectSnapshot(): Promise<unknown>;
        }>;
        holdNextOperation?(): Promise<{
            entered: Promise<void>;
            release(): void;
            operation(): Promise<unknown>;
        }>;
    };
    dispose?(): Promise<void>;
}>;
```

### `ProviderScript`

```ts
type ProviderScript = Readonly<{
    name?: string;
    generation?: string;
    version?: string;
    bindingKinds?: EnvironmentProvider['bindingKinds'];
    continuity?: EnvironmentContinuity;
    facilities?: readonly FacilityKey[];
    isolation?: EnvironmentProvider['isolation'];
    lease?: Partial<EnvironmentFacilities>;
    acquire?: (input: ProviderAcquireInput) => Promise<ProviderAcquisition>;
    receiptBinding?: EnvironmentBinding;
    extraReceiptFields?: Readonly<Record<string, unknown>>;
    release?: () => Promise<LeaseRelease>;
    retire?: () => Promise<Retirement>;
    recoverable?: {
        list(scope: ProviderAcquireInput['scope']): Promise<RecoveryListing>;
        recover(resource: ManagedResource): Promise<ResourceRecovery>;
    };
}>;
```

### `ScriptedEnvironmentProvider`

```ts
type ScriptedEnvironmentProvider = ReturnType<typeof createScriptedEnvironmentProvider>;
```

### `ScriptedFacilityGuard`

```ts
type ScriptedFacilityGuard<P> = ReturnType<typeof createScriptedFacilityGuard<P>>;
```

### `ScriptedRecoveryAuthority`

```ts
type ScriptedRecoveryAuthority = ReturnType<typeof createScriptedRecoveryAuthority>;
```

### `createMemoryResourceLedger`

```ts
function createMemoryResourceLedger(answers?: Partial<{
    plan: 'recorded' | 'conflict' | 'closed' | 'unavailable';
    permit: 'confirmed' | 'closed' | 'unavailable';
    adopt: 'confirmed' | 'closed' | 'unavailable';
    stopped: 'recorded' | 'unavailable';
}>): {
    durability: 'none';
    ledger: ResourceLedger;
    calls: {
        method: 'plan' | 'permit' | 'adopt' | 'stopped';
        key: string;
    }[];
    close(): void;
};
```

### `createScriptedEnvironmentProvider`

```ts
function createScriptedEnvironmentProvider(script?: ProviderScript): EnvironmentProvider & {
    durability: 'none';
    calls: {
        acquire: number;
        release: number;
        retire: number;
        start: number;
        list: number;
        recover: number;
    };
    invalidateLeases(value: LeaseInvalidation): void;
};
```

### `createScriptedFacilityGuard`

```ts
function createScriptedFacilityGuard<P>(answer?: 'authorized' | 'notAuthorized' | 'unavailable'): FacilityGuard<P> & {
    durability: 'none';
    calls: {
        facility: FacilityKey;
        operation: string;
    }[];
};
```

### `createScriptedRecoveryAuthority`

```ts
function createScriptedRecoveryAuthority(answer?: 'authorized' | 'notAuthorized' | 'unavailable'): RecoveryAuthority & {
    readonly durability: 'none';
};
```

### `environmentProviderConformance`

```ts
function environmentProviderConformance(options: ProviderConformanceOptions): readonly ConformanceCase[];
```

### `executionEnvironmentConformance`

```ts
function executionEnvironmentConformance<P>(options: EnvironmentConformanceOptions<P>): readonly ConformanceCase[];
```

### `runConformanceCase`

```ts
function runConformanceCase(test: ConformanceCase): Promise<CaseVerdict>;
```

## 内部引用

### `EnvironmentSchemas`

```ts
type EnvironmentSchemas = {
    readonly [K in keyof ExecutionEnvironment<unknown>]: Readonly<{
        params: OperationSchema<Parameters<ExecutionEnvironment<unknown>[K]>>;
        result: OperationSchema<Awaited<ReturnType<ExecutionEnvironment<unknown>[K]>>>;
    }>;
};
```

### `Path`

```ts
type Path = readonly (string | number)[];
```

## 模块扩充 `./facility.ts`

### `EnvironmentFacilities`

```ts
interface EnvironmentFacilities {
    command: CommandFacility<unknown>;
    files: FileSystemFacility<unknown>;
    terminal: TerminalFacility<unknown>;
}
```

## 模块扩充 `@omne-harness/runtime-context-contract`

### `ContextBlocks`

```ts
interface ContextBlocks {
    'execution.placement': ExecutionPlacementValue;
    'execution.host-facts': ExecutionHostFactsValue;
}
```
