# @omne-harness/runtime-context-contract 的 API 快照

<!-- omne-contract-api 快照格式 1 -->

> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。

## 入口 `.` · `index.d.ts`

- `ApplyCommitResult` · `operations.d.ts`
- `BindResult` · `operations.d.ts`
- `BindingRejection` · `judge.d.ts`
- `BlockDescriptorBase` · `descriptor.d.ts`
- `BlockEntry` · `reader.d.ts`
- `BlockRevision` · `shared.d.ts`
- `BlockState` · `reader.d.ts`
- `BlockValue` · `shared.d.ts`
- `ChangeEntry` · `reader.d.ts`
- `ChangeMaterial` · `reader.d.ts`
- `Changes` · `reader.d.ts`
- `ChangesResult` · `reader.d.ts`
- `CommitInput` · `operations.d.ts`
- `CommitRef` · `shared.d.ts`
- `ConsumerClass` · `shared.d.ts`
- `ContextBlockDescriptor` · `descriptor.d.ts`
- `ContextBlockKey` · `shared.d.ts`
- `ContextBlockKeyRejection` · `decode.d.ts`
- `ContextBlocks` · `shared.d.ts`
- `ContextNeed` · `need.d.ts`
- `ContextReader` · `reader.d.ts`
- `ContextUpdate` · `update.d.ts`
- `Cursor` · `reader.d.ts`
- `CursorInvalidated` · `reader.d.ts`
- `DescriptorCatalog` · `descriptor.d.ts`
- `DiffInput` · `diff.d.ts`
- `Eligibility` · `registration.d.ts`
- `EligibilityId` · `registration.d.ts`
- `EligibilityMaterial` · `registration.d.ts`
- `EligibilityState` · `registration.d.ts`
- `Generation` · `shared.d.ts`
- `HolderOperations` · `operations.d.ts`
- `InvalidateResult` · `producer.d.ts`
- `IssueEligibilityResult` · `operations.d.ts`
- `JudgeRegistrationContext` · `judge.d.ts`
- `JudgedRegistration` · `judge.d.ts`
- `MissingCause` · `reader.d.ts`
- `MissingItem` · `reader.d.ts`
- `Necessity` · `need.d.ts`
- `NeedBinding` · `need.d.ts`
- `NeedBindingRef` · `need.d.ts`
- `NeedRejection` · `judge.d.ts`
- `NeedRequest` · `reader.d.ts`
- `NeedValue` · `reader.d.ts`
- `PerRequestEntry` · `reader.d.ts`
- `PrepareRegistrationResult` · `operations.d.ts`
- `PreviousValue` · `reader.d.ts`
- `ProducerHandle` · `producer.d.ts`
- `ProducerOperations` · `operations.d.ts`
- `ProducerRef` · `shared.d.ts`
- `ProducerRegistration` · `producer.d.ts`
- `PublishResult` · `producer.d.ts`
- `ReadOutcome` · `reader.d.ts`
- `ReadRefusalReason` · `reader.d.ts`
- `ReadResult` · `reader.d.ts`
- `ReaderOperations` · `operations.d.ts`
- `ReduceStepInput` · `reduce.d.ts`
- `ReduceStepResult` · `reduce.d.ts`
- `RegisterProducerResult` · `operations.d.ts`
- `Registration` · `registration.d.ts`
- `RegistrationChange` · `registration.d.ts`
- `RegistrationRejection` · `judge.d.ts`
- `RegistrationRevision` · `shared.d.ts`
- `RejectedUpdate` · `reduce.d.ts`
- `RevisionPair` · `reader.d.ts`
- `RevokeEligibilityResult` · `operations.d.ts`
- `RuntimeContextOperations` · `operations.d.ts`
- `ScopeRef` · `shared.d.ts`
- `ScopeRefRejection` · `decode.d.ts`
- `ScopeText` · `shared.d.ts`
- `Snapshot` · `reader.d.ts`
- `SnapshotResult` · `reader.d.ts`
- `SourceEvidence` · `reader.d.ts`
- `StatefulBlockDescriptor` · `descriptor.d.ts`
- `StepBlockMaterial` · `update.d.ts`
- `StepCommit` · `update.d.ts`
- `StepRef` · `shared.d.ts`
- `SuppliedBlockDescriptor` · `descriptor.d.ts`
- `SupplyAnswer` · `producer.d.ts`
- `SupplyCallback` · `producer.d.ts`
- `Translation` · `need.d.ts`
- `UnknownCause` · `reader.d.ts`
- `UpdateOriginRef` · `shared.d.ts`
- `UpdateRejection` · `reduce.d.ts`
- `ViewRevision` · `shared.d.ts`
- `declarationDigest` · `descriptor.d.ts`
- `decodeContextBlockKey` · `decode.d.ts`
- `decodeScopeRef` · `decode.d.ts`
- `diffForReminder` · `diff.d.ts`
- `judgeBinding` · `judge.d.ts`
- `judgeNeed` · `judge.d.ts`
- `judgeRegistration` · `judge.d.ts`
- `reduceStep` · `reduce.d.ts`

## 入口 `./testing` · `testing/index.d.ts`

- `CaseVerdict` · `testing/case.d.ts`
- `ConformanceCase` · `testing/case.d.ts`
- `MemoryRuntimeContext` · `testing/memory.d.ts`
- `MemoryRuntimeContextOptions` · `testing/memory.d.ts`
- `NotApplicable` · `testing/case.d.ts`
- `RUNTIME_CONTEXT_OBLIGATIONS` · `testing/conformance.d.ts`
- `RuntimeContextFixture` · `testing/conformance.d.ts`
- `RuntimeContextObligation` · `testing/conformance.d.ts`
- `createMemoryRuntimeContext` · `testing/memory.d.ts`
- `runConformanceCase` · `testing/case.d.ts`
- `runtimeContextConformance` · `testing/conformance.d.ts`

## 声明文件 `decode.d.ts`

```ts
import { type Outcome } from '@omne-harness/operation-result';
import type { ScopeRef, ContextBlockKey } from './shared.js';
export type ScopeRefRejection = Readonly<{
    path: readonly (string | number)[];
    reason: 'type' | 'missing-key' | 'unknown-key' | 'empty' | 'parent';
}>;
export type ContextBlockKeyRejection = Readonly<{
    reason: 'type' | 'empty' | 'owner' | 'name' | 'character';
}>;
export declare function decodeScopeRef(value: unknown): Outcome<ScopeRef, ScopeRefRejection>;
export declare function decodeContextBlockKey(value: unknown): Outcome<ContextBlockKey, ContextBlockKeyRejection>;
```

## 声明文件 `descriptor.d.ts`

```ts
import type { ContextBlockKey, ConsumerClass } from './shared.js';
import type { StandardSchemaV1 } from '@standard-schema/spec';
export interface BlockDescriptorBase<K extends ContextBlockKey, V> {
    readonly key: K;
    readonly schema: StandardSchemaV1<unknown, V>;
    readonly consumers: readonly ConsumerClass[];
    readonly required: boolean;
    readonly disclosure: 'plain' | 'eligibility-checked';
    readonly carriesPrevious: boolean;
    readonly volatility: 'stable' | 'per-step' | 'per-request';
    readonly parameterSchema?: StandardSchemaV1<unknown, unknown>;
}
export interface SuppliedBlockDescriptor<K extends ContextBlockKey, V> extends BlockDescriptorBase<K, V> {
    readonly kind: 'supplied';
    readonly recovery: 'persisted' | 'reread' | 'recompute';
}
export interface StatefulBlockDescriptor<K extends ContextBlockKey, V, U = V> extends BlockDescriptorBase<K, V> {
    readonly updateSchema?: StandardSchemaV1<unknown, U>;
    readonly kind: 'stateful';
    readonly writers: readonly ConsumerClass[];
    readonly reduce: (current: V | undefined, update: U) => V;
    readonly persistence: 'checkpointed' | 'untracked';
    readonly singleWriterPerStep: boolean;
}
export type ContextBlockDescriptor<K extends ContextBlockKey, V, U = V> = SuppliedBlockDescriptor<K, V> | StatefulBlockDescriptor<K, V, U>;
export type DescriptorCatalog = Readonly<{
    get(key: ContextBlockKey): ContextBlockDescriptor<ContextBlockKey, unknown, unknown> | undefined;
}>;
export declare function declarationDigest(descriptor: ContextBlockDescriptor<ContextBlockKey, unknown, unknown>): string;
```

## 声明文件 `diff.d.ts`

```ts
import type { DescriptorCatalog } from './descriptor.js';
import type { Snapshot, Changes, ChangeMaterial } from './reader.js';
export type DiffInput = Readonly<{
    previous: Snapshot | null;
    next: Snapshot | Changes;
    descriptors: DescriptorCatalog;
}>;
export declare function diffForReminder(input: DiffInput): readonly ChangeMaterial[];
```

## 声明文件 `index.d.ts`

```ts
export type { Cursor, ReadRefusalReason, MissingCause, UnknownCause, MissingItem, RevisionPair, ReadOutcome, SourceEvidence, NeedValue, NeedRequest, ReadResult, BlockState, BlockEntry, PerRequestEntry, Snapshot, ChangeEntry, Changes, SnapshotResult, CursorInvalidated, ChangesResult, ContextReader, PreviousValue, ChangeMaterial, } from './reader.js';
export type { RegisterProducerResult, ProducerOperations, PrepareRegistrationResult, IssueEligibilityResult, RevokeEligibilityResult, CommitInput, ApplyCommitResult, HolderOperations, BindResult, ReaderOperations, RuntimeContextOperations, } from './operations.js';
export type { ContextUpdate, StepBlockMaterial, StepCommit } from './update.js';
export type { Registration, RegistrationChange, EligibilityId, EligibilityState, Eligibility, EligibilityMaterial, } from './registration.js';
export type { Necessity, ContextNeed, Translation, NeedBinding, NeedBindingRef } from './need.js';
export type { BlockDescriptorBase, SuppliedBlockDescriptor, StatefulBlockDescriptor, ContextBlockDescriptor, DescriptorCatalog, } from './descriptor.js';
export type { SupplyAnswer, SupplyCallback, ProducerRegistration, PublishResult, InvalidateResult, ProducerHandle, } from './producer.js';
export type { ScopeText, BlockValue, RegistrationRevision, ViewRevision, BlockRevision, Generation, CommitRef, ProducerRef, StepRef, UpdateOriginRef, } from './shared.js';
export { decodeScopeRef, decodeContextBlockKey } from './decode.js';
export type { ScopeRefRejection, ContextBlockKeyRejection } from './decode.js';
export { judgeNeed, judgeBinding, judgeRegistration } from './judge.js';
export type { NeedRejection, BindingRejection, RegistrationRejection, JudgeRegistrationContext, JudgedRegistration, } from './judge.js';
export { reduceStep } from './reduce.js';
export type { UpdateRejection, RejectedUpdate, ReduceStepInput, ReduceStepResult, } from './reduce.js';
export { diffForReminder } from './diff.js';
export type { DiffInput } from './diff.js';
export type { ScopeRef, ContextBlockKey, ConsumerClass, ContextBlocks } from './shared.js';
export { declarationDigest } from './descriptor.js';
```

## 声明文件 `judge.d.ts`

```ts
import { type Outcome } from '@omne-harness/operation-result';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { ContextNeed, NeedBinding } from './need.js';
import type { DescriptorCatalog } from './descriptor.js';
import type { ContextBlockKey } from './shared.js';
import type { Registration, RegistrationChange } from './registration.js';
import type { TenantId } from '@omne-harness/legal-identity';
export type NeedRejection = Readonly<{
    path: readonly string[];
    reason: 'type' | 'unknown-key' | 'name' | 'shape' | 'consumer' | 'purpose' | 'necessity' | 'schema-not-synchronous';
}>;
export declare function judgeNeed(value: unknown): Outcome<ContextNeed, NeedRejection>;
export type BindingRejection = Readonly<{
    need: string;
    key: ContextBlockKey;
    reason: 'declaration-missing' | 'required-on-optional' | 'shape-mismatch' | 'integrator-not-allowed';
}>;
export declare function judgeBinding(binding: NeedBinding, context: Readonly<{
    descriptors: DescriptorCatalog;
    registrationRequired: boolean;
}>): Outcome<NeedBinding, BindingRejection>;
export type RegistrationRejection = Readonly<{
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
export type JudgeRegistrationContext = Readonly<{
    descriptors: DescriptorCatalog;
    scopeTenant: TenantId | null;
    existing: Registration | null;
    creating: boolean;
}>;
export type JudgedRegistration = Readonly<{
    change: RegistrationChange;
    coverage: 'full' | 'declaration-independent';
}>;
export declare function judgeRegistration(change: RegistrationChange, context: JudgeRegistrationContext): Outcome<JudgedRegistration, readonly RegistrationRejection[]>;
export declare function sameDeclaration(a: import('./descriptor.js').ContextBlockDescriptor<ContextBlockKey, unknown, unknown>, b: import('./descriptor.js').ContextBlockDescriptor<ContextBlockKey, unknown, unknown>): boolean;
```

## 声明文件 `need.d.ts`

```ts
import type { ContextBlockKey, ConsumerClass } from './shared.js';
import type { BlockValue } from './shared.js';
import type { StandardSchemaV1 } from '@standard-schema/spec';
export type Necessity = 'required' | 'optional';
export type ContextNeed<T = unknown> = Readonly<{
    name: string;
    shape: StandardSchemaV1<unknown, T>;
    consumer: ConsumerClass;
    purpose: string;
    necessity: Necessity;
}>;
export type Translation<V, T> = (value: V) => T;
export type NeedBinding<K extends ContextBlockKey = ContextBlockKey, T = unknown> = Readonly<{
    need: ContextNeed<T>;
    key: K;
    translate?: undefined;
}> | Readonly<{
    need: ContextNeed<T>;
    key: K;
    translate: Translation<BlockValue<K>, T>;
    integrator: ConsumerClass;
}>;
export type NeedBindingRef = Readonly<{
    need: string;
    key: ContextBlockKey;
}>;
```

## 声明文件 `operations.d.ts`

```ts
import type { RejectedUpdate } from './reduce.js';
import type { ContextBlockKey } from './shared.js';
import type { RegistrationRejection, JudgedRegistration } from './judge.js';
import type { ContextReader } from './reader.js';
import type { StepCommit } from './update.js';
import type { RegistrationChange, EligibilityId, Eligibility, EligibilityMaterial } from './registration.js';
import type { ProducerRegistration, ProducerHandle } from './producer.js';
import type { RegistrationRevision, ViewRevision, CommitRef } from './shared.js';
export type RegisterProducerResult<K extends ContextBlockKey = ContextBlockKey> = Readonly<{
    kind: 'registered';
    handle: ProducerHandle<K>;
}> | Readonly<{
    kind: 'rejected';
    reason: 'declaration-missing' | 'declaration-mismatch' | 'other-producer' | 'closed';
}>;
export interface ProducerOperations {
    registerProducer<K extends ContextBlockKey>(registration: ProducerRegistration<K>): Promise<RegisterProducerResult<K>>;
}
export type PrepareRegistrationResult = Readonly<{
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
export type IssueEligibilityResult<P = unknown> = Readonly<{
    kind: 'issued';
    eligibility: Eligibility<P>;
}> | Readonly<{
    kind: 'refused';
    reason: 'unauthorized' | 'supersedes-unknown' | 'closed';
}>;
export type RevokeEligibilityResult = Readonly<{
    kind: 'revoked';
}> | Readonly<{
    kind: 'refused';
    reason: 'unknown-eligibility' | 'closed' | 'callerMismatch';
}>;
export type CommitInput = Readonly<{
    kind: 'registration';
    commit: CommitRef;
    change: RegistrationChange;
}> | Readonly<{
    kind: 'step';
    commit: CommitRef;
    stepCommit: StepCommit;
    executionEnded: boolean;
}>;
export type ApplyCommitResult = Readonly<{
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
export interface HolderOperations<P = unknown> {
    prepareRegistration(change: RegistrationChange): Promise<PrepareRegistrationResult>;
    issueEligibility(material: EligibilityMaterial<P>): Promise<IssueEligibilityResult<P>>;
    revokeEligibility(id: EligibilityId): Promise<RevokeEligibilityResult>;
    applyCommit(input: CommitInput): Promise<ApplyCommitResult>;
}
export type BindResult = Readonly<{
    kind: 'bound';
    reader: ContextReader;
}> | Readonly<{
    kind: 'refused';
    reason: 'unauthorized' | 'closed' | 'callerMismatch';
}>;
export interface ReaderOperations {
    bind(eligibility: EligibilityId): Promise<BindResult>;
}
export type RuntimeContextOperations<P = unknown> = ProducerOperations & HolderOperations<P> & ReaderOperations;
```

## 声明文件 `producer.d.ts`

```ts
import type { ScopeRef, ContextBlockKey } from './shared.js';
import type { SuppliedBlockDescriptor } from './descriptor.js';
import type { BlockValue, BlockRevision, Generation, ProducerRef } from './shared.js';
import type { StandardSchemaV1 } from '@standard-schema/spec';
export type SupplyAnswer<V> = Readonly<{
    kind: 'value';
    value: V;
}> | Readonly<{
    kind: 'none';
}> | Readonly<{
    kind: 'unavailable';
}>;
export type SupplyCallback<V> = (scope: ScopeRef) => Promise<SupplyAnswer<V>>;
export type ProducerRegistration<K extends ContextBlockKey = ContextBlockKey> = Readonly<{
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
export type PublishResult = Readonly<{
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
export type InvalidateResult = Readonly<{
    kind: 'invalidated';
    scopes: readonly ScopeRef[];
}> | Readonly<{
    kind: 'rejected';
    reason: 'stale-generation' | 'withdrawn' | 'closed';
}>;
export interface ProducerHandle<K extends ContextBlockKey = ContextBlockKey> {
    readonly key: K;
    readonly producer: ProducerRef;
    readonly generation: Generation;
    publish(scope: ScopeRef, value: unknown): Promise<PublishResult>;
    invalidate(scope?: ScopeRef): Promise<InvalidateResult>;
    dispose(): Promise<void>;
}
```

## 声明文件 `reader.d.ts`

```ts
import type { ScopeRef, ContextBlockKey, ConsumerClass } from './shared.js';
import type { BlockDescriptorBase } from './descriptor.js';
import type { RegistrationRevision, ViewRevision, BlockRevision, Generation } from './shared.js';
export type Cursor = Readonly<{
    cursor: string;
}>;
export type ReadRefusalReason = 'unauthorized' | 'no-registration' | 'closed';
export type MissingCause = 'no-value' | 'source-unavailable' | 'producer-withdrawn' | 'translation-failed' | 'uninterpretable';
export type UnknownCause = 'source-unknown' | 'eligibility-unknown' | 'commit-unknown';
export type MissingItem = Readonly<{
    key: ContextBlockKey;
    cause: MissingCause;
    revision: BlockRevision | null;
}>;
export type RevisionPair = Readonly<{
    issued: RegistrationRevision;
    current: RegistrationRevision;
}>;
export type ReadOutcome<T> = Readonly<{
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
export type SourceEvidence = Readonly<{
    key: ContextBlockKey;
    revision: BlockRevision;
    scope: ScopeRef;
    generation: Generation | null;
}>;
export type NeedValue<T = unknown> = Readonly<{
    kind: 'value';
    need: string;
    value: T;
    evidence: SourceEvidence;
}> | Readonly<{
    kind: 'none';
    need: string;
}>;
export type NeedRequest = Readonly<{
    need: string;
    key: ContextBlockKey;
}>;
export type ReadResult = ReadOutcome<readonly NeedValue[]>;
export type BlockState<V = unknown> = Readonly<{
    kind: 'value';
    value: V;
}> | Readonly<{
    kind: 'none';
}>;
export type BlockEntry = Readonly<{
    key: ContextBlockKey;
    revision: BlockRevision;
    state: BlockState;
    evidence: SourceEvidence;
    volatility: BlockDescriptorBase<ContextBlockKey, unknown>['volatility'];
}>;
export type PerRequestEntry = Readonly<{
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
export type Snapshot = Readonly<{
    scope: ScopeRef;
    viewRevision: ViewRevision;
    cursor: Cursor;
    blocks: readonly BlockEntry[];
    missing: readonly MissingItem[];
    perRequest: readonly PerRequestEntry[];
}>;
export type ChangeEntry = Readonly<{
    key: ContextBlockKey;
    revision: BlockRevision;
    state: BlockState;
    evidence: SourceEvidence;
}>;
export type Changes = Readonly<{
    scope: ScopeRef;
    from: ViewRevision;
    to: ViewRevision;
    cursor: Cursor;
    entries: readonly ChangeEntry[];
    missing: readonly MissingItem[];
    perRequest: readonly PerRequestEntry[];
}>;
export type SnapshotResult = ReadOutcome<Snapshot>;
export type CursorInvalidated = Readonly<{
    kind: 'cursor-invalidated';
}>;
export type ChangesResult = ReadOutcome<Changes> | CursorInvalidated;
export interface ContextReader {
    readonly consumer: ConsumerClass;
    readonly scope: ScopeRef;
    snapshot(): Promise<SnapshotResult>;
    changes(cursor: Cursor): Promise<ChangesResult>;
    read(needs: readonly NeedRequest[]): Promise<ReadResult>;
    end(): Promise<void>;
}
export type PreviousValue = Readonly<{
    kind: 'value';
    value: unknown;
}> | Readonly<{
    kind: 'withheld';
}>;
export type ChangeMaterial = Readonly<{
    key: ContextBlockKey;
    from: BlockRevision | null;
    to: BlockRevision;
    previous: PreviousValue;
}>;
```

## 声明文件 `reduce.d.ts`

```ts
import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { ContextBlockKey, UpdateOriginRef, ScopeRef, StepRef } from './shared.js';
import type { DescriptorCatalog } from './descriptor.js';
import type { ContextUpdate, StepBlockMaterial } from './update.js';
export type UpdateRejection = Readonly<{
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
export type RejectedUpdate = Readonly<{
    update: ContextUpdate;
    rejection: UpdateRejection;
}>;
export type ReduceStepInput = Readonly<{
    scope: ScopeRef;
    step: StepRef;
    updates: readonly ContextUpdate[];
    descriptors: DescriptorCatalog;
    current: (key: ContextBlockKey) => unknown;
}>;
export type ReduceStepResult = Readonly<{
    committed: readonly StepBlockMaterial[];
    rejected: readonly RejectedUpdate[];
}>;
export declare function reduceStep(input: ReduceStepInput): ReduceStepResult;
```

## 声明文件 `registration.d.ts`

```ts
import type { ScopeRef, ContextBlockKey, ConsumerClass } from './shared.js';
import type { NeedBinding, NeedBindingRef } from './need.js';
import type { StatefulBlockDescriptor } from './descriptor.js';
import type { BlockValue, RegistrationRevision } from './shared.js';
import type { TenantId } from '@omne-harness/legal-identity';
export type Registration<K extends ContextBlockKey = ContextBlockKey> = Readonly<{
    scope: ScopeRef;
    tenant: TenantId;
    key: K;
    bindings: readonly NeedBinding<K>[];
    parameters: unknown;
    required: boolean;
    revision: RegistrationRevision;
}>;
type ChangeHead<K extends ContextBlockKey> = Readonly<{
    scope: ScopeRef;
    tenant: TenantId;
    key: K;
    basedOn: RegistrationRevision;
    creating: boolean;
}>;
export type RegistrationChange<K extends ContextBlockKey = ContextBlockKey> = (ChangeHead<K> & Readonly<{
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
export type EligibilityId = Readonly<{
    eligibility: string;
}>;
export type EligibilityState = Readonly<{
    kind: 'valid';
}> | Readonly<{
    kind: 'superseded';
    by: EligibilityId;
}> | Readonly<{
    kind: 'revoked';
}>;
export type Eligibility<P = unknown> = Readonly<{
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
export type EligibilityMaterial<P = unknown> = Omit<Eligibility<P>, 'id' | 'state'>;
export {};
```

## 声明文件 `shared.d.ts`

```ts
export type ScopeRef = Readonly<{
    ref: string & {
        readonly __scope: unique symbol;
    };
    parent?: ScopeRef;
}>;
export type ContextBlockKey = `${string}.${string}`;
export type ConsumerClass = 'model' | 'tool' | 'extension' | 'coordinator';
export interface ContextBlocks {
}
export type ScopeText = ScopeRef['ref'];
export type BlockValue<K extends ContextBlockKey> = K extends keyof ContextBlocks ? ContextBlocks[K] : unknown;
export type RegistrationRevision = number;
export type ViewRevision = number;
export type BlockRevision = number;
export type Generation = number;
export type CommitRef = Readonly<{
    commit: string;
}>;
export type ProducerRef = Readonly<{
    producer: string;
}>;
export type StepRef = Readonly<{
    step: string;
}>;
export type UpdateOriginRef = Readonly<{
    origin: string;
}>;
```

## 声明文件 `testing/case.d.ts`

```ts
export type ConformanceCase<F> = Readonly<{
    name: string;
    clause: string;
    run(fixture: F): Promise<void>;
}>;
export declare class NotApplicable extends Error {
    readonly handle: string;
    constructor(handle: string);
}
export type CaseVerdict = Readonly<{
    kind: 'passed';
}> | Readonly<{
    kind: 'not-applicable';
    handle: string;
}>;
export declare function runConformanceCase<F>(test: ConformanceCase<F>, fixture: F): Promise<CaseVerdict>;
```

## 声明文件 `testing/conformance.d.ts`

```ts
import type { TenantId } from '@omne-harness/legal-identity';
import type { RuntimeContextOperations } from '../index.js';
import { type ConformanceCase } from './case.js';
export type RuntimeContextFixture<P = unknown> = Readonly<{
    subject(): Promise<RuntimeContextOperations<P>>;
    tenant: TenantId;
    otherTenant: TenantId;
    principal: P;
    retention?: number;
    close?(subject: RuntimeContextOperations<P>): Promise<void>;
}>;
export declare const RUNTIME_CONTEXT_OBLIGATIONS: readonly [
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
export type RuntimeContextObligation = (typeof RUNTIME_CONTEXT_OBLIGATIONS)[number];
export declare function runtimeContextConformance<P>(): readonly ConformanceCase<RuntimeContextFixture<P>>[];
```

## 声明文件 `testing/extended-conformance.d.ts`

```ts
import type { RuntimeContextFixture } from './conformance.js';
import { type ConformanceCase } from './case.js';
export declare const EXTENDED_OBLIGATIONS: readonly [
    'reissue-cannot-change-reader-consumer',
    'reissue-cannot-change-reader-scope',
    'removed-plain-registration-refused',
    'removed-eligibility-checked-registration-concealed',
    'cursor-invalidated-below-retention',
    'scope-independent-callback-at-three-points',
    'invalidate-reads-missing-and-advances',
    'step-commit-idempotent',
    'pending-updates-not-applied',
    'unauthorized-update-rejected-and-commit-invalid',
    'single-writer-per-step-rejects-second',
    'untracked-block-ends-with-execution',
    'translated-binding-gives-consumer-shape',
    'translated-block-not-readable-raw',
    'translation-throw-reads-missing',
    'unlisted-binding-refused',
    'per-request-block-outside-snapshot',
    'optional-need-reads-none',
    'child-scope-shadows-parent',
    'declaration-digest-mismatch-refused',
    'register-before-producer-then-incompatible-reads-missing'
];
export declare function extendedConformance<P>(): readonly ConformanceCase<RuntimeContextFixture<P>>[];
```

## 声明文件 `testing/fixtures.d.ts`

```ts
import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { ScopeRef, SuppliedBlockDescriptor, RuntimeContextOperations, ProducerHandle, ContextReader, Eligibility, EligibilityMaterial } from '../index.js';
import type { TenantId } from '@omne-harness/legal-identity';
export declare const numberSchema: StandardSchemaV1<unknown, number>;
export declare function scope(ref: string, parent?: ScopeRef): ScopeRef;
export declare function declaration(overrides: Partial<SuppliedBlockDescriptor<'suite.value', unknown>> & {
    volatility: 'per-request';
}): SuppliedBlockDescriptor<'suite.value', unknown> & {
    volatility: 'per-request';
};
export declare function declaration(overrides?: Partial<SuppliedBlockDescriptor<'suite.value', unknown>> & {
    volatility?: 'stable';
}): SuppliedBlockDescriptor<'suite.value', unknown> & {
    volatility: 'stable';
};
export declare function setup<P>(subject: RuntimeContextOperations<P>, tenant: TenantId, principal: P, descriptor?: SuppliedBlockDescriptor<'suite.value', unknown> & {
    volatility: 'stable';
}, scopeRef?: ScopeRef): Promise<{
    subject: RuntimeContextOperations<P>;
    scope: ScopeRef;
    handle: ProducerHandle<'suite.value'>;
    reader: ContextReader;
    eligibility: Eligibility<P>;
    material: EligibilityMaterial<P>;
}>;
```

## 声明文件 `testing/index.d.ts`

```ts
export { createMemoryRuntimeContext } from './memory.js';
export type { MemoryRuntimeContextOptions, MemoryRuntimeContext } from './memory.js';
export { NotApplicable, runConformanceCase } from './case.js';
export type { ConformanceCase, CaseVerdict } from './case.js';
export { RUNTIME_CONTEXT_OBLIGATIONS, runtimeContextConformance } from './conformance.js';
export type { RuntimeContextFixture, RuntimeContextObligation } from './conformance.js';
```

## 声明文件 `testing/memory.d.ts`

```ts
import type { RuntimeContextOperations, ScopeRef } from '../index.js';
export type MemoryRuntimeContextOptions = Readonly<{
    retention?: number;
}>;
export type MemoryRuntimeContext<P = unknown> = RuntimeContextOperations<P> & Readonly<{
    durability: 'none';
    close(): Promise<void>;
    onChange(listener: (scope: ScopeRef, revision: number) => void): () => void;
}>;
export declare function createMemoryRuntimeContext<P = unknown>(options?: MemoryRuntimeContextOptions): MemoryRuntimeContext<P>;
```

## 声明文件 `update.d.ts`

```ts
import type { ScopeRef, ContextBlockKey, ConsumerClass } from './shared.js';
import type { BlockValue, StepRef, UpdateOriginRef } from './shared.js';
export type ContextUpdate<K extends ContextBlockKey = ContextBlockKey, U = unknown> = Readonly<{
    origin: UpdateOriginRef;
    key: K;
    update: U;
    writer: ConsumerClass;
}>;
export type StepBlockMaterial<K extends ContextBlockKey = ContextBlockKey> = Readonly<{
    key: K;
    value: BlockValue<K>;
    updates: readonly ContextUpdate<K>[];
}>;
export type StepCommit = Readonly<{
    scope: ScopeRef;
    step: StepRef;
    committed: readonly StepBlockMaterial[];
    pending: readonly ContextUpdate[];
}>;
```

## 声明文件 `validation.d.ts`

```ts
import type { StandardSchemaV1 } from '@standard-schema/spec';
export declare function record(value: unknown): value is Record<string, unknown>;
export declare function schema(value: unknown): value is StandardSchemaV1;
export declare function validate(schema: StandardSchemaV1, value: unknown): readonly StandardSchemaV1.Issue[];
export declare class SynchronousSchemaRequired extends Error {
    constructor();
}
```
