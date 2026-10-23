# @omne-harness/runtime-context-contract 的 API 快照

> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。

## 入口 `.`

### `ApplyCommitResult`

```ts
type ApplyCommitResult = Readonly<{
    kind: 'applied';
    registrationRevision: RegistrationRevision;
    viewRevision: ViewRevision;
}> | Readonly<{
    kind: 'invalid';
    reason: 'out-of-order' | 'commit-conflict' | 'tenant-mismatch' | 'registration' | 'rejected-update';
    current: RegistrationRevision;
    rejections?: readonly RegistrationRejection[];
    rejected?: readonly RejectedUpdate[];
}> | Readonly<{
    kind: 'refused';
    reason: 'unauthorized' | 'closed' | 'callerMismatch';
}>;
```

### `BindResult`

```ts
type BindResult = Readonly<{
    kind: 'bound';
    reader: ContextReader;
}> | Readonly<{
    kind: 'refused';
    reason: 'unauthorized' | 'closed' | 'callerMismatch';
}>;
```

### `BindingRejection`

```ts
type BindingRejection = Readonly<{
    need: string;
    key: ContextBlockKey;
    reason: 'declaration-missing' | 'required-on-optional' | 'shape-mismatch' | 'integrator-not-allowed';
}>;
```

### `BlockDescriptorBase`

```ts
interface BlockDescriptorBase<K extends ContextBlockKey, V> {
    readonly key: K;
    readonly schema: StandardSchemaV1<unknown, V>;
    readonly consumers: readonly ConsumerClass[];
    readonly required: boolean;
    readonly disclosure: 'plain' | 'eligibility-checked';
    readonly carriesPrevious: boolean;
    readonly volatility: 'stable' | 'per-step' | 'per-request';
    readonly parameterSchema?: StandardSchemaV1<unknown, unknown>;
}
```

### `BlockEntry`

```ts
type BlockEntry = Readonly<{
    key: ContextBlockKey;
    revision: BlockRevision;
    state: BlockState;
    evidence: SourceEvidence;
    volatility: BlockDescriptorBase<ContextBlockKey, unknown>['volatility'];
}>;
```

### `BlockRevision`

```ts
type BlockRevision = number;
```

### `BlockState`

```ts
type BlockState<V = unknown> = Readonly<{
    kind: 'value';
    value: V;
}> | Readonly<{
    kind: 'none';
}>;
```

### `BlockValue`

```ts
type BlockValue<K extends ContextBlockKey> = K extends keyof ContextBlocks ? ContextBlocks[K] : unknown;
```

### `ChangeEntry`

```ts
type ChangeEntry = Readonly<{
    key: ContextBlockKey;
    revision: BlockRevision;
    state: BlockState;
    evidence: SourceEvidence;
}>;
```

### `ChangeMaterial`

```ts
type ChangeMaterial = Readonly<{
    key: ContextBlockKey;
    from: BlockRevision | null;
    to: BlockRevision;
    previous: PreviousValue;
}>;
```

### `Changes`

```ts
type Changes = Readonly<{
    scope: ScopeRef;
    from: ViewRevision;
    to: ViewRevision;
    cursor: Cursor;
    entries: readonly ChangeEntry[];
    missing: readonly MissingItem[];
    perRequest: readonly PerRequestEntry[];
}>;
```

### `ChangesResult`

```ts
type ChangesResult = ReadOutcome<Changes> | CursorInvalidated;
```

### `CommitInput`

```ts
type CommitInput = Readonly<{
    kind: 'registration';
    commit: CommitRef;
    change: RegistrationChange;
}> | Readonly<{
    kind: 'step';
    commit: CommitRef;
    stepCommit: StepCommit;
    executionEnded: boolean;
}>;
```

### `CommitRef`

```ts
type CommitRef = Readonly<{
    commit: string;
}>;
```

### `ConsumerClass`

```ts
type ConsumerClass = 'model' | 'tool' | 'extension' | 'coordinator';
```

### `ContextBlockDescriptor`

```ts
type ContextBlockDescriptor<K extends ContextBlockKey, V, U = V> = SuppliedBlockDescriptor<K, V> | StatefulBlockDescriptor<K, V, U>;
```

### `ContextBlockKey`

```ts
type ContextBlockKey = `${string}.${string}`;
```

### `ContextBlockKeyRejection`

```ts
type ContextBlockKeyRejection = Readonly<{
    reason: 'type' | 'empty' | 'owner' | 'name' | 'character';
}>;
```

### `ContextBlocks`

```ts
interface ContextBlocks {
}
```

### `ContextNeed`

```ts
type ContextNeed<T = unknown> = Readonly<{
    name: string;
    shape: StandardSchemaV1<unknown, T>;
    consumer: ConsumerClass;
    purpose: string;
    necessity: Necessity;
}>;
```

### `ContextReader`

```ts
interface ContextReader {
    readonly consumer: ConsumerClass;
    readonly scope: ScopeRef;
    snapshot(): Promise<SnapshotResult>;
    changes(cursor: Cursor): Promise<ChangesResult>;
    read(needs: readonly NeedRequest[]): Promise<ReadResult>;
    end(): Promise<void>;
}
```

### `ContextUpdate`

```ts
type ContextUpdate<K extends ContextBlockKey = ContextBlockKey, U = unknown> = Readonly<{
    origin: UpdateOriginRef;
    key: K;
    update: U;
    writer: ConsumerClass;
}>;
```

### `Cursor`

```ts
type Cursor = Readonly<{
    cursor: string;
}>;
```

### `CursorInvalidated`

```ts
type CursorInvalidated = Readonly<{
    kind: 'cursor-invalidated';
}>;
```

### `DescriptorCatalog`

```ts
type DescriptorCatalog = Readonly<{
    get(key: ContextBlockKey): ContextBlockDescriptor<ContextBlockKey, unknown, unknown> | undefined;
}>;
```

### `DiffInput`

```ts
type DiffInput = Readonly<{
    previous: Snapshot | null;
    next: Snapshot | Changes;
    descriptors: DescriptorCatalog;
}>;
```

### `Eligibility`

```ts
type Eligibility<P = unknown> = Readonly<{
    id: EligibilityId;
    state: EligibilityState;
    supersedes: EligibilityId | null;
    scope: ScopeRef;
    consumer: ConsumerClass;
    principal: P;
    tenant: TenantId;
    keys: readonly ContextBlockKey[];
    bindings: readonly NeedBindingRef[];
    registrationRevision: RegistrationRevision;
}>;
```

### `EligibilityId`

```ts
type EligibilityId = Readonly<{
    eligibility: string;
}>;
```

### `EligibilityMaterial`

```ts
type EligibilityMaterial<P = unknown> = Omit<Eligibility<P>, 'id' | 'state'>;
```

### `EligibilityState`

```ts
type EligibilityState = Readonly<{
    kind: 'valid';
}> | Readonly<{
    kind: 'superseded';
    by: EligibilityId;
}> | Readonly<{
    kind: 'revoked';
}>;
```

### `Generation`

```ts
type Generation = number;
```

### `HolderOperations`

```ts
interface HolderOperations<P = unknown> {
    prepareRegistration(change: RegistrationChange): Promise<PrepareRegistrationResult>;
    issueEligibility(material: EligibilityMaterial<P>): Promise<IssueEligibilityResult<P>>;
    revokeEligibility(id: EligibilityId): Promise<RevokeEligibilityResult>;
    applyCommit(input: CommitInput): Promise<ApplyCommitResult>;
}
```

### `InvalidateResult`

```ts
type InvalidateResult = Readonly<{
    kind: 'invalidated';
    scopes: readonly ScopeRef[];
}> | Readonly<{
    kind: 'rejected';
    reason: 'stale-generation' | 'withdrawn' | 'closed';
}>;
```

### `IssueEligibilityResult`

```ts
type IssueEligibilityResult<P = unknown> = Readonly<{
    kind: 'issued';
    eligibility: Eligibility<P>;
}> | Readonly<{
    kind: 'refused';
    reason: 'unauthorized' | 'supersedes-unknown' | 'closed';
}>;
```

### `JudgeRegistrationContext`

```ts
type JudgeRegistrationContext = Readonly<{
    descriptors: DescriptorCatalog;
    scopeTenant: TenantId | null;
    existing: Registration | null;
    creating: boolean;
}>;
```

### `JudgedRegistration`

```ts
type JudgedRegistration = Readonly<{
    change: RegistrationChange;
    coverage: 'full' | 'declaration-independent';
}>;
```

### `MissingCause`

```ts
type MissingCause = 'no-value' | 'source-unavailable' | 'producer-withdrawn' | 'translation-failed' | 'uninterpretable';
```

### `MissingItem`

```ts
type MissingItem = Readonly<{
    key: ContextBlockKey;
    cause: MissingCause;
    revision: BlockRevision | null;
}>;
```

### `Necessity`

```ts
type Necessity = 'required' | 'optional';
```

### `NeedBinding`

```ts
type NeedBinding<K extends ContextBlockKey = ContextBlockKey, T = unknown> = Readonly<{
    need: ContextNeed<T>;
    key: K;
    translate?: undefined;
}> | Readonly<{
    need: ContextNeed<T>;
    key: K;
    translate: Translation<BlockValue<K>, T>;
    integrator: ConsumerClass;
}>;
```

### `NeedBindingRef`

```ts
type NeedBindingRef = Readonly<{
    need: string;
    key: ContextBlockKey;
}>;
```

### `NeedRejection`

```ts
type NeedRejection = Readonly<{
    path: readonly string[];
    reason: 'type' | 'unknown-key' | 'name' | 'shape' | 'consumer' | 'purpose' | 'necessity' | 'schema-not-synchronous';
}>;
```

### `NeedRequest`

```ts
type NeedRequest = Readonly<{
    need: string;
    key: ContextBlockKey;
}>;
```

### `NeedValue`

```ts
type NeedValue<T = unknown> = Readonly<{
    kind: 'value';
    need: string;
    value: T;
    evidence: SourceEvidence;
}> | Readonly<{
    kind: 'none';
    need: string;
}>;
```

### `PerRequestEntry`

```ts
type PerRequestEntry = Readonly<{
    key: ContextBlockKey;
}> & (Readonly<{
    kind: 'value';
    value: unknown;
    evidence: SourceEvidence;
}> | Readonly<{
    kind: 'none';
}> | Readonly<{
    kind: 'missing';
    cause: MissingCause;
}> | Readonly<{
    kind: 'unknown';
    cause: UnknownCause;
}>);
```

### `PrepareRegistrationResult`

```ts
type PrepareRegistrationResult = Readonly<{
    kind: 'prepared';
    judged: JudgedRegistration;
    currentRevision: RegistrationRevision;
}> | Readonly<{
    kind: 'rejected';
    rejections: readonly RegistrationRejection[];
}> | Readonly<{
    kind: 'refused';
    reason: 'closed' | 'callerMismatch';
}>;
```

### `PreviousValue`

```ts
type PreviousValue = Readonly<{
    kind: 'value';
    value: unknown;
}> | Readonly<{
    kind: 'withheld';
}>;
```

### `ProducerHandle`

```ts
interface ProducerHandle<K extends ContextBlockKey = ContextBlockKey> {
    readonly key: K;
    readonly producer: ProducerRef;
    readonly generation: Generation;
    publish(scope: ScopeRef, value: unknown): Promise<PublishResult>;
    invalidate(scope?: ScopeRef): Promise<InvalidateResult>;
    dispose(): Promise<void>;
}
```

### `ProducerOperations`

```ts
interface ProducerOperations {
    registerProducer<K extends ContextBlockKey>(registration: ProducerRegistration<K>): Promise<RegisterProducerResult<K>>;
}
```

### `ProducerRef`

```ts
type ProducerRef = Readonly<{
    producer: string;
}>;
```

### `ProducerRegistration`

```ts
type ProducerRegistration<K extends ContextBlockKey = ContextBlockKey> = Readonly<{
    key: K;
    producer: ProducerRef;
}> & (Readonly<{
    declaration: SuppliedBlockDescriptor<K, BlockValue<K>> & {
        volatility: 'per-request';
    };
    scoped: boolean;
    supply: SupplyCallback<BlockValue<K>>;
}> | Readonly<{
    declaration: SuppliedBlockDescriptor<K, BlockValue<K>> & {
        volatility: 'stable' | 'per-step';
    };
    scoped: false;
    supply: SupplyCallback<BlockValue<K>>;
}> | Readonly<{
    declaration: SuppliedBlockDescriptor<K, BlockValue<K>> & {
        volatility: 'stable' | 'per-step';
    };
    scoped: true;
    supply?: SupplyCallback<BlockValue<K>>;
}>);
```

### `PublishResult`

```ts
type PublishResult = Readonly<{
    kind: 'published';
    scope: ScopeRef;
    revision: BlockRevision;
}> | Readonly<{
    kind: 'rejected';
    reason: 'shape';
    issues: readonly StandardSchemaV1.Issue[];
}> | Readonly<{
    kind: 'rejected';
    reason: 'stale-generation' | 'withdrawn' | 'closed';
}>;
```

### `ReadOutcome`

```ts
type ReadOutcome<T> = Readonly<{
    kind: 'success';
    value: T;
    registration: RevisionPair;
}> | Readonly<{
    kind: 'refused';
    reason: ReadRefusalReason;
}> | Readonly<{
    kind: 'missing';
    items: readonly MissingItem[];
}> | Readonly<{
    kind: 'unknown';
    cause: UnknownCause;
}>;
```

### `ReadRefusalReason`

```ts
type ReadRefusalReason = 'unauthorized' | 'no-registration' | 'closed';
```

### `ReadResult`

```ts
type ReadResult = ReadOutcome<readonly NeedValue[]>;
```

### `ReaderOperations`

```ts
interface ReaderOperations {
    bind(eligibility: EligibilityId): Promise<BindResult>;
}
```

### `ReduceStepInput`

```ts
type ReduceStepInput = Readonly<{
    scope: ScopeRef;
    step: StepRef;
    updates: readonly ContextUpdate[];
    descriptors: DescriptorCatalog;
    current: (key: ContextBlockKey) => unknown;
}>;
```

### `ReduceStepResult`

```ts
type ReduceStepResult = Readonly<{
    committed: readonly StepBlockMaterial[];
    rejected: readonly RejectedUpdate[];
}>;
```

### `RegisterProducerResult`

```ts
type RegisterProducerResult<K extends ContextBlockKey = ContextBlockKey> = Readonly<{
    kind: 'registered';
    handle: ProducerHandle<K>;
}> | Readonly<{
    kind: 'rejected';
    reason: 'declaration-missing' | 'declaration-mismatch' | 'other-producer' | 'closed';
}>;
```

### `Registration`

```ts
type Registration<K extends ContextBlockKey = ContextBlockKey> = Readonly<{
    scope: ScopeRef;
    tenant: TenantId;
    key: K;
    bindings: readonly NeedBinding<K>[];
    parameters: unknown;
    required: boolean;
    revision: RegistrationRevision;
}>;
```

### `RegistrationChange`

```ts
type RegistrationChange<K extends ContextBlockKey = ContextBlockKey> = (ChangeHead<K> & Readonly<{
    kind: 'add';
    bindings: readonly NeedBinding<K>[];
    parameters: unknown;
    required: boolean;
    declaration?: StatefulBlockDescriptor<K, BlockValue<K>, unknown>;
}>) | (ChangeHead<K> & Readonly<{
    kind: 'update';
    bindings: readonly NeedBinding<K>[];
    parameters: unknown;
}>) | (ChangeHead<K> & Readonly<{
    kind: 'remove';
}>);
```

### `RegistrationRejection`

```ts
type RegistrationRejection = Readonly<{
    path: readonly (string | number)[];
}> & (Readonly<{
    reason: 'key' | 'tenant-mismatch' | 'declaration-mismatch' | 'parameters-not-declared' | 'required-removed' | 'required-downgraded' | 'required-after-creation' | 'identity-changed' | 'schema-not-synchronous';
}> | Readonly<{
    reason: 'parameters-shape';
    issues: readonly StandardSchemaV1.Issue[];
}> | Readonly<{
    reason: 'binding';
    rejections: readonly BindingRejection[];
}>);
```

### `RegistrationRevision`

```ts
type RegistrationRevision = number;
```

### `RejectedUpdate`

```ts
type RejectedUpdate = Readonly<{
    update: ContextUpdate;
    rejection: UpdateRejection;
}>;
```

### `RevisionPair`

```ts
type RevisionPair = Readonly<{
    issued: RegistrationRevision;
    current: RegistrationRevision;
}>;
```

### `RevokeEligibilityResult`

```ts
type RevokeEligibilityResult = Readonly<{
    kind: 'revoked';
}> | Readonly<{
    kind: 'refused';
    reason: 'unknown-eligibility' | 'closed' | 'callerMismatch';
}>;
```

### `RuntimeContextOperations`

```ts
type RuntimeContextOperations<P = unknown> = ProducerOperations & HolderOperations<P> & ReaderOperations;
```

### `ScopeRef`

```ts
type ScopeRef = Readonly<{
    ref: string & {
        readonly __scope: unique symbol;
    };
    parent?: ScopeRef;
}>;
```

### `ScopeRefRejection`

```ts
type ScopeRefRejection = Readonly<{
    path: readonly (string | number)[];
    reason: 'type' | 'missing-key' | 'unknown-key' | 'empty' | 'parent';
}>;
```

### `ScopeText`

```ts
type ScopeText = ScopeRef['ref'];
```

### `Snapshot`

```ts
type Snapshot = Readonly<{
    scope: ScopeRef;
    viewRevision: ViewRevision;
    cursor: Cursor;
    blocks: readonly BlockEntry[];
    missing: readonly MissingItem[];
    perRequest: readonly PerRequestEntry[];
}>;
```

### `SnapshotResult`

```ts
type SnapshotResult = ReadOutcome<Snapshot>;
```

### `SourceEvidence`

```ts
type SourceEvidence = Readonly<{
    key: ContextBlockKey;
    revision: BlockRevision;
    scope: ScopeRef;
    generation: Generation | null;
}>;
```

### `StatefulBlockDescriptor`

```ts
interface StatefulBlockDescriptor<K extends ContextBlockKey, V, U = V> extends BlockDescriptorBase<K, V> {
    readonly updateSchema?: StandardSchemaV1<unknown, U>;
    readonly kind: 'stateful';
    readonly writers: readonly ConsumerClass[];
    readonly reduce: (current: V | undefined, update: U) => V;
    readonly persistence: 'checkpointed' | 'untracked';
    readonly singleWriterPerStep: boolean;
}
```

### `StepBlockMaterial`

```ts
type StepBlockMaterial<K extends ContextBlockKey = ContextBlockKey> = Readonly<{
    key: K;
    value: BlockValue<K>;
    updates: readonly ContextUpdate<K>[];
}>;
```

### `StepCommit`

```ts
type StepCommit = Readonly<{
    scope: ScopeRef;
    step: StepRef;
    committed: readonly StepBlockMaterial[];
    pending: readonly ContextUpdate[];
}>;
```

### `StepRef`

```ts
type StepRef = Readonly<{
    step: string;
}>;
```

### `SuppliedBlockDescriptor`

```ts
interface SuppliedBlockDescriptor<K extends ContextBlockKey, V> extends BlockDescriptorBase<K, V> {
    readonly kind: 'supplied';
    readonly recovery: 'persisted' | 'reread' | 'recompute';
}
```

### `SupplyAnswer`

```ts
type SupplyAnswer<V> = Readonly<{
    kind: 'value';
    value: V;
}> | Readonly<{
    kind: 'none';
}> | Readonly<{
    kind: 'unavailable';
}>;
```

### `SupplyCallback`

```ts
type SupplyCallback<V> = (scope: ScopeRef) => Promise<SupplyAnswer<V>>;
```

### `Translation`

```ts
type Translation<V, T> = (value: V) => T;
```

### `UnknownCause`

```ts
type UnknownCause = 'source-unknown' | 'eligibility-unknown' | 'commit-unknown';
```

### `UpdateOriginRef`

```ts
type UpdateOriginRef = Readonly<{
    origin: string;
}>;
```

### `UpdateRejection`

```ts
type UpdateRejection = Readonly<{
    kind: 'definition';
    reason: 'schema-not-synchronous';
    path: readonly string[];
}> | Readonly<{
    kind: 'unauthorized';
    cause: 'not-a-stateful-block' | 'writer-not-allowed' | 'single-writer';
    first?: UpdateOriginRef;
}> | Readonly<{
    kind: 'shape';
    issues: readonly StandardSchemaV1.Issue[];
}>;
```

### `ViewRevision`

```ts
type ViewRevision = number;
```

### `declarationDigest`

```ts
function declarationDigest(descriptor: ContextBlockDescriptor<ContextBlockKey, unknown, unknown>): string;
```

### `decodeContextBlockKey`

```ts
function decodeContextBlockKey(value: unknown): Outcome<ContextBlockKey, ContextBlockKeyRejection>;
```

### `decodeScopeRef`

```ts
function decodeScopeRef(value: unknown): Outcome<ScopeRef, ScopeRefRejection>;
```

### `diffForReminder`

```ts
function diffForReminder(input: DiffInput): readonly ChangeMaterial[];
```

### `judgeBinding`

```ts
function judgeBinding(binding: NeedBinding, context: Readonly<{
    descriptors: DescriptorCatalog;
    registrationRequired: boolean;
}>): Outcome<NeedBinding, BindingRejection>;
```

### `judgeNeed`

```ts
function judgeNeed(value: unknown): Outcome<ContextNeed, NeedRejection>;
```

### `judgeRegistration`

```ts
function judgeRegistration(change: RegistrationChange, context: JudgeRegistrationContext): Outcome<JudgedRegistration, readonly RegistrationRejection[]>;
```

### `reduceStep`

```ts
function reduceStep(input: ReduceStepInput): ReduceStepResult;
```

## 入口 `./testing`

### `CaseVerdict`

```ts
type CaseVerdict = Readonly<{
    kind: 'passed';
}> | Readonly<{
    kind: 'not-applicable';
    handle: string;
}>;
```

### `ConformanceCase`

```ts
type ConformanceCase<F> = Readonly<{
    name: string;
    clause: string;
    run(fixture: F): Promise<void>;
}>;
```

### `MemoryRuntimeContext`

```ts
type MemoryRuntimeContext<P = unknown> = RuntimeContextOperations<P> & Readonly<{
    durability: 'none';
    close(): Promise<void>;
    onChange(listener: (scope: ScopeRef, revision: number) => void): () => void;
}>;
```

### `MemoryRuntimeContextOptions`

```ts
type MemoryRuntimeContextOptions = Readonly<{
    retention?: number;
}>;
```

### `NotApplicable`

```ts
class NotApplicable extends Error {
    readonly handle: string;
    constructor(handle: string);
}
```

### `RUNTIME_CONTEXT_OBLIGATIONS`

```ts
const RUNTIME_CONTEXT_OBLIGATIONS: readonly [
    "scope-isolated-publication",
    "cross-tenant-refused",
    "missing-required-block",
    "publication-shape",
    "old-generation-publication",
    "producer-identity",
    "withdrawn-producer-missing",
    "registration-replay",
    "registration-order",
    "registration-conflict",
    "scope-tenant-fixed",
    "required-removal-refused",
    "required-after-creation-refused",
    "eligibility-revoked",
    "eligibility-superseded",
    "cursor-reader-bound",
    "cursor-generation-invalidated",
    "optional-block-none",
    "consumer-filter",
    "reader-ended",
    "closed-instance-refuses",
    "reissue-cannot-change-reader-consumer",
    "reissue-cannot-change-reader-scope",
    "removed-plain-registration-refused",
    "removed-eligibility-checked-registration-concealed",
    "cursor-invalidated-below-retention",
    "scope-independent-callback-at-three-points",
    "invalidate-reads-missing-and-advances",
    "step-commit-idempotent",
    "pending-updates-not-applied",
    "unauthorized-update-rejected-and-commit-invalid",
    "single-writer-per-step-rejects-second",
    "untracked-block-ends-with-execution",
    "translated-binding-gives-consumer-shape",
    "translated-block-not-readable-raw",
    "translation-throw-reads-missing",
    "unlisted-binding-refused",
    "per-request-block-outside-snapshot",
    "optional-need-reads-none",
    "child-scope-shadows-parent",
    "declaration-digest-mismatch-refused",
    "register-before-producer-then-incompatible-reads-missing"
];
```

### `RuntimeContextFixture`

```ts
type RuntimeContextFixture<P = unknown> = Readonly<{
    subject(): Promise<RuntimeContextOperations<P>>;
    tenant: TenantId;
    otherTenant: TenantId;
    principal: P;
    retention?: number;
    close?(subject: RuntimeContextOperations<P>): Promise<void>;
}>;
```

### `RuntimeContextObligation`

```ts
type RuntimeContextObligation = (typeof RUNTIME_CONTEXT_OBLIGATIONS)[number];
```

### `createMemoryRuntimeContext`

```ts
function createMemoryRuntimeContext<P = unknown>(options?: MemoryRuntimeContextOptions): MemoryRuntimeContext<P>;
```

### `runConformanceCase`

```ts
function runConformanceCase<F>(test: ConformanceCase<F>, fixture: F): Promise<CaseVerdict>;
```

### `runtimeContextConformance`

```ts
function runtimeContextConformance<P>(): readonly ConformanceCase<RuntimeContextFixture<P>>[];
```

## 内部引用

### `ChangeHead`

```ts
type ChangeHead<K extends ContextBlockKey> = Readonly<{
    scope: ScopeRef;
    tenant: TenantId;
    key: K;
    basedOn: RegistrationRevision;
    creating: boolean;
}>;
```
