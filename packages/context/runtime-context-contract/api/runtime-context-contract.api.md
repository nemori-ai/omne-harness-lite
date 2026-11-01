# @omne-harness/runtime-context-contract 的 API 快照

<!-- omne-contract-api 快照格式 1 -->

> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。

## 入口 `.` · `index.d.ts`

- `AppliedCommit` · `replay.d.ts`
- `ApplyCommitResult` · `operations.d.ts`
- `AuthorityDecision` · `authority.d.ts`
- `BeginReplayAction` · `authority.d.ts`
- `BeginReplayInput` · `replay.d.ts`
- `BeginReplayResult` · `replay.d.ts`
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
- `CheckCause` · `authority.d.ts`
- `CheckUnavailable` · `authority.d.ts`
- `CheckUnknown` · `authority.d.ts`
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
- `FinishReplayAction` · `authority.d.ts`
- `FinishReplayInput` · `replay.d.ts`
- `FinishReplayResult` · `replay.d.ts`
- `Generation` · `shared.d.ts`
- `HolderAction` · `authority.d.ts`
- `HolderDecision` · `authority.d.ts`
- `HolderOperations` · `operations.d.ts`
- `InvalidateResult` · `producer.d.ts`
- `InvalidateTarget` · `producer.d.ts`
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
- `OrdinaryHolderAction` · `authority.d.ts`
- `PerRequestEntry` · `reader.d.ts`
- `PrepareRegistrationResult` · `operations.d.ts`
- `PreviousValue` · `reader.d.ts`
- `ProducerAction` · `authority.d.ts`
- `ProducerHandle` · `producer.d.ts`
- `ProducerOperations` · `operations.d.ts`
- `ProducerRef` · `shared.d.ts`
- `ProducerRegistration` · `producer.d.ts`
- `PublishInput` · `producer.d.ts`
- `PublishResult` · `producer.d.ts`
- `ReadOutcome` · `reader.d.ts`
- `ReadRefusalReason` · `reader.d.ts`
- `ReadResult` · `reader.d.ts`
- `ReaderEligibilityHandoff` · `reader-eligibility.d.ts`
- `ReaderEligibilityRequest` · `reader-eligibility.d.ts`
- `ReaderEligibilityResult` · `reader-eligibility.d.ts`
- `ReaderOperations` · `operations.d.ts`
- `ReduceStepInput` · `reduce.d.ts`
- `ReduceStepResult` · `reduce.d.ts`
- `RegisterProducerResult` · `operations.d.ts`
- `Registration` · `registration.d.ts`
- `RegistrationChange` · `registration.d.ts`
- `RegistrationRejection` · `judge.d.ts`
- `RegistrationRevision` · `shared.d.ts`
- `RejectedUpdate` · `reduce.d.ts`
- `ReplayBlock` · `replay.d.ts`
- `ReplayMaterial` · `replay.d.ts`
- `ReplayPrevious` · `replay.d.ts`
- `ReplayRef` · `replay.d.ts`
- `RevisionPair` · `reader.d.ts`
- `RevokeEligibilityResult` · `operations.d.ts`
- `RuntimeContextAuthority` · `authority.d.ts`
- `RuntimeContextOperations` · `operations.d.ts`
- `RuntimeContextTrust` · `trust.d.ts`
- `ScopeBinding` · `authority.d.ts`
- `ScopeBindingSource` · `authority.d.ts`
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
- `SupplyInput` · `producer.d.ts`
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

- `AuthorityCall` · `testing/ports.d.ts`
- `AuthorityFace` · `testing/ports.d.ts`
- `AuthorityScript` · `testing/ports.d.ts`
- `CaseVerdict` · `testing/case.d.ts`
- `ConformanceCase` · `testing/case.d.ts`
- `MemoryRuntimeContext` · `testing/memory.d.ts`
- `MemoryRuntimeContextOptions` · `testing/memory.d.ts`
- `NotApplicable` · `testing/case.d.ts`
- `RUNTIME_CONTEXT_OBLIGATIONS` · `testing/conformance.d.ts`
- `RUNTIME_CONTEXT_TRUST_OBLIGATIONS` · `testing/trust-conformance.d.ts`
- `RuntimeContextFixture` · `testing/suite.d.ts`
- `RuntimeContextObligation` · `testing/conformance.d.ts`
- `RuntimeContextPorts` · `testing/suite.d.ts`
- `RuntimeContextTrustControls` · `testing/trust.d.ts`
- `RuntimeContextTrustFixture` · `testing/trust.d.ts`
- `TestAuthorityPorts` · `testing/ports.d.ts`
- `TestRuntimeContextTrust` · `testing/trust.d.ts`
- `createMemoryRuntimeContext` · `testing/memory.d.ts`
- `createTestAuthorityPorts` · `testing/ports.d.ts`
- `createTestRuntimeContextTrust` · `testing/trust.d.ts`
- `runConformanceCase` · `testing/case.d.ts`
- `runtimeContextConformance` · `testing/conformance.d.ts`
- `runtimeContextTrustConformance` · `testing/trust-conformance.d.ts`

## 声明文件 `authority.d.ts`

```ts
import type { TenantId } from '@omne-harness/legal-identity';
import type { ScopeRef, ContextBlockKey, CommitRef, ProducerRef } from './shared.js';
import type { RegistrationChange, EligibilityId, Eligibility, EligibilityMaterial } from './registration.js';
import type { CommitInput } from './operations.js';
import type { ReplayRef, ReplayMaterial, ReplayPrevious, AppliedCommit } from './replay.js';
export type ScopeBinding = Readonly<{
    kind: 'bound';
    tenant: TenantId;
}> | Readonly<{
    kind: 'unbound';
}> | Readonly<{
    kind: 'unavailable';
}> | Readonly<{
    kind: 'unknown';
}>;
export interface ScopeBindingSource {
    lookup(scope: ScopeRef): Promise<ScopeBinding>;
}
export type AuthorityDecision<P> = Readonly<{
    kind: 'authorized';
    principal: P;
    current(): boolean;
}> | Readonly<{
    kind: 'refused';
}> | Readonly<{
    kind: 'unavailable';
}> | Readonly<{
    kind: 'unknown';
}>;
export type OrdinaryHolderAction<P = unknown> = Readonly<{
    kind: 'prepare';
    change: RegistrationChange;
}> | Readonly<{
    kind: 'commit';
    input: CommitInput;
}> | Readonly<{
    kind: 'issue';
    material: EligibilityMaterial<P>;
}> | Readonly<{
    kind: 'revoke';
    eligibility: EligibilityId;
}>;
export type BeginReplayAction = Readonly<{
    kind: 'begin-replay';
    scope: ScopeRef;
    tenant: TenantId;
    through: CommitRef | null;
    supersedes: ReplayRef | null;
    previous: ReplayPrevious;
}>;
export type FinishReplayAction = Readonly<{
    kind: 'finish-replay';
    scope: ScopeRef;
    tenant: TenantId;
    replay: ReplayRef;
    through: CommitRef | null;
    material: ReplayMaterial;
    previous: ReplayPrevious;
    appliedCommits: readonly AppliedCommit[];
}>;
export type HolderAction<P = unknown> = OrdinaryHolderAction<P> | BeginReplayAction | FinishReplayAction;
export type HolderDecision<P> = AuthorityDecision<P> | Readonly<{
    kind: 'invalid';
    reason: 'checkpoint-conflict' | 'replay-incomplete';
}>;
export type ProducerAction = Readonly<{
    kind: 'register';
    tenant: TenantId;
    key: ContextBlockKey;
    producer: ProducerRef;
}> | Readonly<{
    kind: 'publish' | 'invalidate' | 'supply';
    scope: ScopeRef;
    tenant: TenantId;
    key: ContextBlockKey;
    producer: ProducerRef;
}> | Readonly<{
    kind: 'invalidate-tenant';
    tenant: TenantId;
    key: ContextBlockKey;
    producer: ProducerRef;
}>;
export interface RuntimeContextAuthority<P> {
    holder(principal: P, action: HolderAction<P>): Promise<HolderDecision<P>>;
    producer(principal: P, action: ProducerAction): Promise<AuthorityDecision<P>>;
    reader(principal: P, eligibility: Eligibility<P>): Promise<AuthorityDecision<P>>;
}
export type CheckCause = 'authority' | 'scope-binding' | 'replay';
export type CheckUnavailable = Readonly<{
    kind: 'unavailable';
    cause: CheckCause;
}>;
export type CheckUnknown = Readonly<{
    kind: 'unknown';
    cause: CheckCause;
}>;
```

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
export type { ReaderEligibilityRequest, ReaderEligibilityResult, ReaderEligibilityHandoff, } from './reader-eligibility.js';
export type { Necessity, ContextNeed, Translation, NeedBinding, NeedBindingRef } from './need.js';
export type { BlockDescriptorBase, SuppliedBlockDescriptor, StatefulBlockDescriptor, ContextBlockDescriptor, DescriptorCatalog, } from './descriptor.js';
export type { SupplyAnswer, SupplyInput, SupplyCallback, ProducerRegistration, PublishInput, PublishResult, InvalidateTarget, InvalidateResult, ProducerHandle, } from './producer.js';
export type { ScopeBinding, ScopeBindingSource, AuthorityDecision, OrdinaryHolderAction, BeginReplayAction, FinishReplayAction, HolderAction, HolderDecision, ProducerAction, RuntimeContextAuthority, CheckCause, CheckUnavailable, CheckUnknown, } from './authority.js';
export type { RuntimeContextTrust } from './trust.js';
export type { ReplayRef, BeginReplayInput, ReplayBlock, ReplayMaterial, FinishReplayInput, ReplayPrevious, AppliedCommit, BeginReplayResult, FinishReplayResult, } from './replay.js';
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
import type { TenantId } from '@omne-harness/legal-identity';
import type { RejectedUpdate } from './reduce.js';
import type { ContextBlockKey, ScopeRef } from './shared.js';
import type { RegistrationRejection, JudgedRegistration } from './judge.js';
import type { ContextReader } from './reader.js';
import type { StepCommit } from './update.js';
import type { RegistrationChange, EligibilityId, Eligibility, EligibilityMaterial } from './registration.js';
import type { ProducerRegistration, ProducerHandle } from './producer.js';
import type { RegistrationRevision, ViewRevision, CommitRef } from './shared.js';
import type { CheckUnavailable, CheckUnknown } from './authority.js';
import type { BeginReplayInput, BeginReplayResult, FinishReplayInput, FinishReplayResult } from './replay.js';
export type RegisterProducerResult<K extends ContextBlockKey = ContextBlockKey> = Readonly<{
    kind: 'registered';
    handle: ProducerHandle<K>;
}> | Readonly<{
    kind: 'rejected';
    reason: 'declaration-missing' | 'declaration-mismatch' | 'other-producer' | 'closed';
}> | Readonly<{
    kind: 'refused';
    reason: 'unauthorized';
}> | CheckUnavailable | CheckUnknown;
export interface ProducerOperations<P = unknown> {
    registerProducer<K extends ContextBlockKey>(principal: P, registration: ProducerRegistration<K, P>): Promise<RegisterProducerResult<K>>;
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
    reason: 'closed' | 'callerMismatch' | 'unauthorized' | 'scope-ended';
}> | CheckUnavailable | CheckUnknown;
export type IssueEligibilityResult<P = unknown> = Readonly<{
    kind: 'issued';
    eligibility: Eligibility<P>;
}> | Readonly<{
    kind: 'refused';
    reason: 'unauthorized' | 'supersedes-unknown' | 'closed' | 'scope-ended' | 'replay-incomplete';
}> | CheckUnavailable | CheckUnknown;
export type RevokeEligibilityResult = Readonly<{
    kind: 'revoked';
}> | Readonly<{
    kind: 'refused';
    reason: 'unknown-eligibility' | 'closed' | 'callerMismatch' | 'unauthorized';
}> | CheckUnavailable | CheckUnknown;
export type CommitInput = Readonly<{
    kind: 'registration';
    commit: CommitRef;
    change: RegistrationChange;
    scopeEnded?: true;
}> | Readonly<{
    kind: 'step';
    commit: CommitRef;
    tenant: TenantId;
    stepCommit: StepCommit;
    executionEnded: boolean;
    scopeEnded?: true;
}> | Readonly<{
    kind: 'scope';
    commit: CommitRef;
    scope: ScopeRef;
    tenant: TenantId;
    scopeEnded: true;
}>;
export type ApplyCommitResult = Readonly<{
    kind: 'applied';
    registrationRevision: RegistrationRevision;
    viewRevision: ViewRevision;
}> | Readonly<{
    kind: 'invalid';
    reason: 'out-of-order' | 'commit-conflict' | 'tenant-mismatch' | 'registration' | 'rejected-update' | 'malformed-input';
    current: RegistrationRevision;
    rejections?: readonly RegistrationRejection[];
    rejected?: readonly RejectedUpdate[];
}> | Readonly<{
    kind: 'refused';
    reason: 'unauthorized' | 'closed' | 'callerMismatch' | 'scope-ended' | 'replay-incomplete';
}> | CheckUnavailable | CheckUnknown;
export interface HolderOperations<P = unknown> {
    prepareRegistration(principal: P, change: RegistrationChange): Promise<PrepareRegistrationResult>;
    issueEligibility(principal: P, material: EligibilityMaterial<P>): Promise<IssueEligibilityResult<P>>;
    revokeEligibility(principal: P, id: EligibilityId): Promise<RevokeEligibilityResult>;
    applyCommit(principal: P, input: CommitInput): Promise<ApplyCommitResult>;
    beginReplay(principal: P, input: BeginReplayInput): Promise<BeginReplayResult>;
    finishReplay(principal: P, input: FinishReplayInput): Promise<FinishReplayResult>;
}
export type BindResult = Readonly<{
    kind: 'bound';
    reader: ContextReader;
}> | Readonly<{
    kind: 'refused';
    reason: 'unauthorized' | 'closed' | 'callerMismatch' | 'scope-ended' | 'replay-incomplete';
}> | Readonly<{
    kind: 'unknown';
    cause: 'eligibility-unknown' | 'scope-binding-unknown' | 'replay-unknown';
}>;
export interface ReaderOperations {
    bind(eligibility: EligibilityId): Promise<BindResult>;
}
export type RuntimeContextOperations<P = unknown> = ProducerOperations<P> & HolderOperations<P> & ReaderOperations;
```

## 声明文件 `producer.d.ts`

```ts
import type { TenantId } from '@omne-harness/legal-identity';
import type { ScopeRef, ContextBlockKey } from './shared.js';
import type { SuppliedBlockDescriptor } from './descriptor.js';
import type { BlockValue, BlockRevision, Generation, ProducerRef } from './shared.js';
import type { CheckUnavailable, CheckUnknown } from './authority.js';
import type { StandardSchemaV1 } from '@standard-schema/spec';
export type SupplyAnswer<V> = Readonly<{
    kind: 'value';
    value: V;
}> | Readonly<{
    kind: 'none';
}> | Readonly<{
    kind: 'unavailable';
}> | Readonly<{
    kind: 'refused';
}> | Readonly<{
    kind: 'unknown';
}>;
export type SupplyInput<P = unknown> = Readonly<{
    scope: ScopeRef;
    tenant: TenantId;
    principal: P;
}>;
export type SupplyCallback<V, P = unknown> = (input: SupplyInput<P>) => Promise<SupplyAnswer<V>>;
export type ProducerRegistration<K extends ContextBlockKey = ContextBlockKey, P = unknown> = Readonly<{
    key: K;
    tenant: TenantId;
    producer: ProducerRef;
}> & (Readonly<{
    declaration: SuppliedBlockDescriptor<K, BlockValue<K>> & {
        volatility: 'per-request';
    };
    scoped: boolean;
    supply: SupplyCallback<BlockValue<K>, P>;
}> | Readonly<{
    declaration: SuppliedBlockDescriptor<K, BlockValue<K>> & {
        volatility: 'stable' | 'per-step';
    };
    scoped: false;
    supply: SupplyCallback<BlockValue<K>, P>;
}> | Readonly<{
    declaration: SuppliedBlockDescriptor<K, BlockValue<K>> & {
        volatility: 'stable' | 'per-step';
    };
    scoped: true;
    supply?: SupplyCallback<BlockValue<K>, P>;
}>);
type HandleRejection = 'stale-generation' | 'withdrawn' | 'closed' | 'scope-unregistered' | 'scope-ended' | 'replay-incomplete';
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
    reason: HandleRejection;
}> | Readonly<{
    kind: 'refused';
    reason: 'unauthorized';
}> | CheckUnavailable | CheckUnknown;
export type InvalidateResult = Readonly<{
    kind: 'invalidated';
    scopes: readonly ScopeRef[];
}> | Readonly<{
    kind: 'rejected';
    reason: HandleRejection;
}> | Readonly<{
    kind: 'refused';
    reason: 'unauthorized';
}> | CheckUnavailable | CheckUnknown;
export type InvalidateTarget = Readonly<{
    kind: 'scope';
    scope: ScopeRef;
    tenant: TenantId;
}> | Readonly<{
    kind: 'tenant';
    tenant: TenantId;
}>;
export type PublishInput = Readonly<{
    scope: ScopeRef;
    tenant: TenantId;
    value: unknown;
}>;
export interface ProducerHandle<K extends ContextBlockKey = ContextBlockKey> {
    readonly key: K;
    readonly tenant: TenantId;
    readonly producer: ProducerRef;
    readonly generation: Generation;
    publish(input: PublishInput): Promise<PublishResult>;
    invalidate(target: InvalidateTarget): Promise<InvalidateResult>;
    dispose(): Promise<void>;
}
export {};
```

## 声明文件 `reader-eligibility.d.ts`

```ts
import type { TenantId } from '@omne-harness/legal-identity';
import type { EligibilityId } from './registration.js';
import type { ConsumerClass, ScopeRef } from './shared.js';
export type ReaderEligibilityRequest<P = unknown> = Readonly<{
    principal: P;
    tenant: TenantId;
    scope: ScopeRef;
    consumer: ConsumerClass;
}>;
export type ReaderEligibilityResult = Readonly<{
    kind: 'current';
    eligibility: EligibilityId;
}> | Readonly<{
    kind: 'absent';
}> | Readonly<{
    kind: 'refused';
}> | Readonly<{
    kind: 'unknown';
}> | Readonly<{
    kind: 'unavailable';
    diagnostic: string;
}>;
export interface ReaderEligibilityHandoff<P = unknown> {
    current(request: ReaderEligibilityRequest<P>): Promise<ReaderEligibilityResult>;
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
export type ReadRefusalReason = 'unauthorized' | 'no-registration' | 'closed' | 'scope-ended' | 'replay-incomplete';
export type MissingCause = 'no-value' | 'source-unavailable' | 'producer-withdrawn' | 'translation-failed' | 'uninterpretable';
export type UnknownCause = 'source-unknown' | 'eligibility-unknown' | 'commit-unknown' | 'scope-binding-unknown' | 'replay-unknown';
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

## 声明文件 `replay.d.ts`

```ts
import type { TenantId } from '@omne-harness/legal-identity';
import type { RejectedUpdate } from './reduce.js';
import type { RegistrationRejection } from './judge.js';
import type { ScopeRef, ContextBlockKey, CommitRef, StepRef, RegistrationRevision, ViewRevision } from './shared.js';
import type { RegistrationChange } from './registration.js';
import type { CheckUnavailable, CheckUnknown } from './authority.js';
export type ReplayRef = Readonly<{
    replay: string;
}>;
export type BeginReplayInput = Readonly<{
    scope: ScopeRef;
    tenant: TenantId;
    through: CommitRef | null;
    supersedes: ReplayRef | null;
}>;
export type ReplayBlock = Readonly<{
    key: ContextBlockKey;
    value: unknown;
    updates: readonly [
    ];
}>;
export type ReplayMaterial = Readonly<{
    registrations: readonly Readonly<{
        commit: CommitRef;
        change: RegistrationChange;
    }>[];
    checkpoints: readonly Readonly<{
        commit: CommitRef;
        step: StepRef;
        blocks: readonly ReplayBlock[];
    }>[];
    end: Readonly<{
        commit: CommitRef;
    }> | null;
}>;
export type FinishReplayInput = Readonly<{
    replay: ReplayRef;
    material: ReplayMaterial;
}>;
export type ReplayPrevious = Readonly<{
    checkpoint: CommitRef | null;
    registrationRevision: RegistrationRevision;
    end: CommitRef | null;
}>;
export type AppliedCommit = Readonly<{
    commit: CommitRef;
    digest: string;
}>;
export type BeginReplayResult = Readonly<{
    kind: 'replaying';
    replay: ReplayRef;
}> | Readonly<{
    kind: 'invalid';
    reason: 'checkpoint-conflict' | 'replay-conflict' | 'malformed-input';
}> | Readonly<{
    kind: 'refused';
    reason: 'unauthorized' | 'closed' | 'callerMismatch';
}> | CheckUnavailable | CheckUnknown;
export type FinishReplayResult = Readonly<{
    kind: 'ready';
    state: 'open' | 'ended';
    registrationRevision: RegistrationRevision;
    viewRevision: ViewRevision;
}> | Readonly<{
    kind: 'invalid';
    reason: 'replay-incomplete' | 'checkpoint-conflict' | 'replay-conflict' | 'registration' | 'rejected-update' | 'malformed-input';
    rejections?: readonly RegistrationRejection[];
    rejected?: readonly RejectedUpdate[];
}> | Readonly<{
    kind: 'refused';
    reason: 'unauthorized' | 'closed' | 'callerMismatch';
}> | CheckUnavailable | CheckUnknown;
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

## 声明文件 `testing/authority-conformance.d.ts`

```ts
import type { ConformanceCase } from './case.js';
import { type RuntimeContextFixture } from './suite.js';
export declare const AUTHORITY_OBLIGATIONS: readonly [
    'forged-first-binding-refused',
    'principal-tenant-mismatch-refused',
    'authority-unavailable-and-unknown',
    'stale-current-refused',
    'revocation-during-supply-discarded',
    'input-snapshot-stable',
    'producer-slot-per-tenant',
    'publish-tenant-mismatch-refused',
    'tenant-invalidate-scoped-to-tenant',
    'tenant-invalidate-batch-atomic',
    'supply-answer-mapping'
];
export declare function authorityConformance<P>(): readonly ConformanceCase<RuntimeContextFixture<P>>[];
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
import { type ConformanceCase } from './case.js';
import { type RuntimeContextFixture } from './suite.js';
export type { RuntimeContextFixture, RuntimeContextPorts } from './suite.js';
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
    "register-before-producer-then-incompatible-reads-missing",
    "forged-first-binding-refused",
    "principal-tenant-mismatch-refused",
    "authority-unavailable-and-unknown",
    "stale-current-refused",
    "revocation-during-supply-discarded",
    "input-snapshot-stable",
    "producer-slot-per-tenant",
    "publish-tenant-mismatch-refused",
    "tenant-invalidate-scoped-to-tenant",
    "tenant-invalidate-batch-atomic",
    "supply-answer-mapping",
    "scope-end-only",
    "scope-end-commit-conflict",
    "scope-end-atomic-with-registration",
    "replay-fence-closed-until-finish",
    "replay-begin-invalidates-readers",
    "replay-retry-and-conflict",
    "replay-restores-projection",
    "replay-capacity-unavailable",
    "replay-cannot-reopen-ended",
    "refresh-after-replay",
    "out-of-order-recovered-by-replay"
];
export type RuntimeContextObligation = (typeof RUNTIME_CONTEXT_OBLIGATIONS)[number];
export declare function runtimeContextConformance<P>(): readonly ConformanceCase<RuntimeContextFixture<P>>[];
```

## 声明文件 `testing/extended-conformance.d.ts`

```ts
import { type ConformanceCase } from './case.js';
import { type RuntimeContextFixture } from './suite.js';
import type { StatefulBlockDescriptor } from '../index.js';
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
export declare function statefulDeclaration(persistence: 'untracked' | 'checkpointed'): StatefulBlockDescriptor<'suite.state', unknown, unknown>;
```

## 声明文件 `testing/fixtures.d.ts`

```ts
import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { ScopeRef, SuppliedBlockDescriptor, RuntimeContextOperations, ProducerHandle, ContextReader, Eligibility, EligibilityMaterial, ReplayRef } from '../index.js';
import type { TenantId } from '@omne-harness/legal-identity';
import type { TestAuthorityPorts } from './ports.js';
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
export declare function openScope<P>(subject: RuntimeContextOperations<P>, ports: TestAuthorityPorts<P>, principal: P, target: ScopeRef, tenant: TenantId): Promise<ReplayRef>;
export declare function requiredBinding(): {
    readonly key: 'suite.value';
    readonly need: {
        readonly name: 'value';
        readonly shape: StandardSchemaV1<unknown, number>;
        readonly consumer: 'model';
        readonly purpose: 'conformance';
        readonly necessity: 'required';
    };
};
export type Setup<P> = Readonly<{
    subject: RuntimeContextOperations<P>;
    ports: TestAuthorityPorts<P>;
    principal: P;
    tenant: TenantId;
    scope: ScopeRef;
    handle: ProducerHandle<'suite.value'>;
    reader: ContextReader;
    eligibility: Eligibility<P>;
    material: EligibilityMaterial<P>;
}>;
export declare function setup<P>(subject: RuntimeContextOperations<P>, ports: TestAuthorityPorts<P>, tenant: TenantId, principal: P, descriptor?: SuppliedBlockDescriptor<'suite.value', unknown> & {
    volatility: 'stable';
}, scopeRef?: ScopeRef): Promise<Setup<P>>;
export declare function snapshotValue(reader: ContextReader): Promise<unknown>;
```

## 声明文件 `testing/index.d.ts`

```ts
export { createMemoryRuntimeContext } from './memory.js';
export type { MemoryRuntimeContextOptions, MemoryRuntimeContext } from './memory.js';
export { createTestAuthorityPorts } from './ports.js';
export type { TestAuthorityPorts, AuthorityCall, AuthorityFace, AuthorityScript } from './ports.js';
export { NotApplicable, runConformanceCase } from './case.js';
export type { ConformanceCase, CaseVerdict } from './case.js';
export { RUNTIME_CONTEXT_OBLIGATIONS, runtimeContextConformance } from './conformance.js';
export type { RuntimeContextFixture, RuntimeContextPorts, RuntimeContextObligation, } from './conformance.js';
export { createTestRuntimeContextTrust } from './trust.js';
export type { TestRuntimeContextTrust, RuntimeContextTrustControls, RuntimeContextTrustFixture, } from './trust.js';
export { RUNTIME_CONTEXT_TRUST_OBLIGATIONS, runtimeContextTrustConformance, } from './trust-conformance.js';
```

## 声明文件 `testing/memory-holder.d.ts`

```ts
import type { TenantId } from '@omne-harness/legal-identity';
import type { ScopeRef, RegistrationChange, EligibilityId, EligibilityMaterial, CommitInput, ApplyCommitResult, PrepareRegistrationResult, IssueEligibilityResult, RevokeEligibilityResult } from '../index.js';
import { type Authorized, type CheckFailure, type ScopeState, type World } from './memory-world.js';
import type { Supplier } from './memory-producer.js';
type Gate<P> = Authorized<P> | CheckFailure;
export declare function holderGate<P>(world: World<P>, principal: P, action: Parameters<World<P>['options']['authority']['holder']>[1], scope: ScopeRef, tenant: TenantId): Promise<Gate<P>>;
export declare function ownChange(change: RegistrationChange): RegistrationChange | undefined;
export declare function ownCommit(input: CommitInput): CommitInput | undefined;
export declare function createHolder<P>(world: World<P>, supplier: Supplier<P>): {
    prepareRegistration: (principal: P, raw: RegistrationChange) => Promise<PrepareRegistrationResult>;
    issueEligibility: (principal: P, raw: EligibilityMaterial<P>) => Promise<IssueEligibilityResult<P>>;
    revokeEligibility: (principal: P, raw: EligibilityId) => Promise<RevokeEligibilityResult>;
    applyCommit: (principal: P, raw: CommitInput) => Promise<ApplyCommitResult>;
};
export declare function storeRegistration<P>(world: World<P>, change: RegistrationChange, s: ScopeState): void;
export {};
```

## 声明文件 `testing/memory-producer.d.ts`

```ts
import type { ContextBlockKey, ProducerRegistration, RegisterProducerResult } from '../index.js';
import { type Producer, type ScopeState, type World } from './memory-world.js';
export type SupplyOutcome = Readonly<{
    kind: 'stored';
}> | Readonly<{
    kind: 'refused';
}> | Readonly<{
    kind: 'unknown';
}> | Readonly<{
    kind: 'unavailable';
}> | Readonly<{
    kind: 'stale';
}> | Readonly<{
    kind: 'value';
    value: unknown;
    generation: number;
}> | Readonly<{
    kind: 'none';
}> | Readonly<{
    kind: 'uninterpretable';
}>;
export type Supplier<P> = ReturnType<typeof createSupplier<P>>;
export declare function createSupplier<P>(world: World<P>): {
    registerProducer: <K extends ContextBlockKey>(principal: P, raw: ProducerRegistration<K, P>) => Promise<RegisterProducerResult<K>>;
    supplyOnce: (producer: Producer<P>, s: ScopeState, store: boolean) => Promise<SupplyOutcome>;
    producerFor: (s: ScopeState, key: ContextBlockKey) => Producer<P> | undefined;
    afterRegistration: (s: ScopeState, key: ContextBlockKey) => Promise<void>;
    drivesSupply: (producer: Producer<P>) => boolean;
    isCurrent: (producer: Producer<P>) => boolean;
};
```

## 声明文件 `testing/memory-reader.d.ts`

```ts
import type { EligibilityId, BindResult } from '../index.js';
import { type World } from './memory-world.js';
import type { Supplier } from './memory-producer.js';
export declare function createReaders<P>(world: World<P>, supplier: Supplier<P>): {
    bind: (raw: EligibilityId) => Promise<BindResult>;
};
```

## 声明文件 `testing/memory-replay.d.ts`

```ts
import type { BeginReplayInput, BeginReplayResult, FinishReplayInput, FinishReplayResult } from '../index.js';
import { type World } from './memory-world.js';
export declare function createReplay<P>(world: World<P>): {
    beginReplay: (principal: P, raw: BeginReplayInput) => Promise<BeginReplayResult>;
    finishReplay: (principal: P, raw: FinishReplayInput) => Promise<FinishReplayResult>;
};
```

## 声明文件 `testing/memory-world.d.ts`

```ts
import type { TenantId } from '@omne-harness/legal-identity';
import type { ScopeRef, ContextBlockKey, ContextBlockDescriptor, Registration, Eligibility, EligibilityId, CommitInput, ApplyCommitResult, RuntimeContextAuthority, ScopeBindingSource, AuthorityDecision, HolderDecision, CheckCause, CheckUnavailable, CheckUnknown, CommitRef, ReplayRef, FinishReplayResult, SupplyCallback, ProducerRef } from '../index.js';
export type Descriptor = ContextBlockDescriptor<ContextBlockKey, unknown, unknown>;
export type Stored = {
    value: unknown;
    revision: number;
    generation: number | null;
    present: boolean;
    cause?: 'no-value' | 'source-unavailable' | 'producer-withdrawn' | 'uninterpretable';
    unknown?: boolean;
    refused?: boolean;
};
export type ReplaySession = {
    ref: ReplayRef;
    scope: string;
    epoch: number;
    through: CommitRef | null;
    supersedes: ReplayRef | null;
    finished: {
        fingerprint: string;
        result: FinishReplayResult;
    } | null;
};
export type ScopeState = {
    scope: ScopeRef;
    tenant: TenantId;
    revision: number;
    view: number;
    epoch: number;
    registrations: Map<ContextBlockKey, Registration>;
    values: Map<ContextBlockKey, Stored>;
    fence: 'open' | 'closed';
    ended: CommitRef | null;
    replayEpoch: number;
    replay: ReplaySession | null;
    checkpoint: CommitRef | null;
    needsSupply: Map<ContextBlockKey, number>;
    supplySeq: Map<ContextBlockKey, number>;
    commitsVersion: number;
};
export type Producer<P> = {
    key: ContextBlockKey;
    tenant: TenantId;
    tenantText: string;
    producer: ProducerRef;
    principal: P;
    generation: number;
    scoped: boolean;
    supply: SupplyCallback<unknown, P> | undefined;
    declaration: Descriptor;
    active: boolean;
    inFlight: Set<Promise<unknown>>;
};
export type AppliedEntry = {
    input: CommitInput;
    digest: string;
    result: ApplyCommitResult;
};
export type Authorized<P> = Readonly<{
    principal: P;
    current: () => boolean;
}>;
export type CheckFailure = Readonly<{
    kind: 'refused';
    reason: 'unauthorized';
}> | CheckUnavailable | CheckUnknown;
export type WorldOptions<P> = Readonly<{
    authority: RuntimeContextAuthority<P>;
    bindings: ScopeBindingSource;
    retention: number;
    replayCapacity: number;
    supplyBoundMs: number;
    settleBoundMs: number;
}>;
type Registered = {
    s: ScopeState;
    r: Registration;
};
type Decided<P> = Authorized<P> | CheckFailure | Readonly<{
    kind: 'invalid';
    reason: string;
}>;
export interface World<P> {
    readonly options: WorldOptions<P>;
    closed: boolean;
    serial: number;
    targetsVersion: number;
    readonly incompatible: Set<string>;
    readonly descriptors: Map<ContextBlockKey, Descriptor>;
    readonly scopes: Map<string, ScopeState>;
    readonly producers: Map<string, Producer<P>>;
    readonly generations: Map<string, number>;
    readonly eligibilities: Map<string, Eligibility<P>>;
    readonly commits: Map<string, AppliedEntry>;
    readonly sessions: Map<string, ReplaySession>;
    readonly listeners: Set<(scope: ScopeRef, revision: number) => void>;
    readonly catalog: {
        get(key: ContextBlockKey): Descriptor | undefined;
    };
    state(scope: ScopeRef): ScopeState | undefined;
    changed(s: ScopeState, key: ContextBlockKey | null): void;
    put(s: ScopeState, key: ContextBlockKey, value: unknown, generation: number | null, present: boolean, cause?: Stored['cause']): void;
    nextSeq(s: ScopeState, key: ContextBlockKey): number;
    registration(scope: ScopeRef, key: ContextBlockKey): Registered | undefined;
    currentEligibility(id: EligibilityId): Eligibility<P> | undefined;
    newScope(scope: ScopeRef, tenant: TenantId): ScopeState;
    decide(ask: () => Promise<AuthorityDecision<P> | HolderDecision<P>>): Promise<Decided<P>>;
    bound(scope: ScopeRef, tenant: TenantId): Promise<CheckFailure | null>;
}
export declare function createWorld<P>(options: WorldOptions<P>): World<P>;
export declare function isMinted(tenant: TenantId): boolean;
export declare function tenantText(tenant: TenantId): string | undefined;
export declare function isFailure<P>(value: Authorized<P> | CheckFailure | Readonly<{
    kind: 'invalid';
    reason: string;
}>): value is CheckFailure | Readonly<{
    kind: 'invalid';
    reason: string;
}>;
export declare function unavailable(cause: CheckCause): CheckUnavailable;
export declare function ownScope(value: ScopeRef, seen?: Set<object>): ScopeRef | undefined;
export declare function ownData(value: unknown): {
    value: unknown;
} | undefined;
export declare function digest(value: unknown): string;
export {};
```

## 声明文件 `testing/memory.d.ts`

```ts
import type { RuntimeContextOperations, RuntimeContextTrust, ScopeRef } from '../index.js';
export type MemoryRuntimeContextOptions<P = unknown> = RuntimeContextTrust<P> & Readonly<{
    retention?: number;
    replayCapacity?: number;
    supplyBoundMs?: number;
    settleBoundMs?: number;
}>;
export type MemoryRuntimeContext<P = unknown> = RuntimeContextOperations<P> & Readonly<{
    durability: 'none';
    close(): Promise<void>;
    onChange(listener: (scope: ScopeRef, revision: number) => void): () => void;
}>;
export declare function createMemoryRuntimeContext<P = unknown>(options: MemoryRuntimeContextOptions<P>): MemoryRuntimeContext<P>;
```

## 声明文件 `testing/ports.d.ts`

```ts
import type { TenantId } from '@omne-harness/legal-identity';
import type { ScopeRef, ScopeBinding, ScopeBindingSource, RuntimeContextAuthority, HolderAction, HolderDecision, ProducerAction, Eligibility } from '../index.js';
export type AuthorityFace = 'holder' | 'producer' | 'reader';
export type AuthorityCall<P> = Readonly<{
    face: 'holder';
    principal: P;
    action: HolderAction<P>;
}> | Readonly<{
    face: 'producer';
    principal: P;
    action: ProducerAction;
}> | Readonly<{
    face: 'reader';
    principal: P;
    eligibility: Eligibility<P>;
}>;
export type AuthorityScript<P> = (call: AuthorityCall<P>) => HolderDecision<P> | undefined;
export type TestAuthorityPorts<P> = Readonly<{
    authority: RuntimeContextAuthority<P>;
    bindings: ScopeBindingSource;
    bind(scope: ScopeRef, tenant: TenantId): void;
    answerBinding(scope: ScopeRef, answer: ScopeBinding): void;
    script(next: AuthorityScript<P> | undefined): void;
    revokeAll(): void;
    readonly calls: readonly AuthorityCall<P>[];
}>;
export declare function createTestAuthorityPorts<P>(): TestAuthorityPorts<P>;
```

## 声明文件 `testing/replay-conformance.d.ts`

```ts
import { type ConformanceCase } from './case.js';
import { type RuntimeContextFixture } from './suite.js';
export declare const REPLAY_OBLIGATIONS: readonly [
    'scope-end-only',
    'scope-end-commit-conflict',
    'scope-end-atomic-with-registration',
    'replay-fence-closed-until-finish',
    'replay-begin-invalidates-readers',
    'replay-retry-and-conflict',
    'replay-restores-projection',
    'replay-capacity-unavailable',
    'replay-cannot-reopen-ended',
    'refresh-after-replay',
    'out-of-order-recovered-by-replay'
];
export declare function replayConformance<P>(): readonly ConformanceCase<RuntimeContextFixture<P>>[];
```

## 声明文件 `testing/suite.d.ts`

```ts
import type { TenantId } from '@omne-harness/legal-identity';
import type { RuntimeContextOperations, RuntimeContextAuthority, ScopeBindingSource, ScopeRef } from '../index.js';
import { type Setup } from './fixtures.js';
import { type TestAuthorityPorts } from './ports.js';
export type RuntimeContextPorts<P> = Readonly<{
    authority: RuntimeContextAuthority<P>;
    bindings: ScopeBindingSource;
}>;
export type RuntimeContextFixture<P = unknown> = Readonly<{
    subject(ports: RuntimeContextPorts<P>): Promise<RuntimeContextOperations<P>>;
    tenant: TenantId;
    otherTenant: TenantId;
    principal: P;
    retention?: number;
    replayCapacity?: number;
    close?(subject: RuntimeContextOperations<P>): Promise<void>;
}>;
export declare function start<P>(fixture: RuntimeContextFixture<P>): Promise<{
    subject: RuntimeContextOperations<P>;
    ports: TestAuthorityPorts<P>;
}>;
export declare function started<P>(fixture: RuntimeContextFixture<P>): Promise<Setup<P>>;
export declare function addScope<P>(s: Setup<P>, ref: string, required?: boolean): Promise<ScopeRef>;
```

## 声明文件 `testing/trust-conformance.d.ts`

```ts
import { type ConformanceCase } from './case.js';
import { type RuntimeContextTrustFixture } from './trust.js';
export declare const RUNTIME_CONTEXT_TRUST_OBLIGATIONS: readonly [
    'cross-tenant-zero-source-calls',
    'authorization-revocation-synchronous',
    'work-revocation-synchronous',
    'request-generation-synchronous',
    'bridge-invalidates-while-original-current',
    'original-current-false-refused',
    'revocation-during-await-discarded',
    'revocation-during-original-answer',
    'authorization-revocation-scoped',
    'work-revocation-scoped',
    'request-generation-scoped',
    'bridge-generation-scoped',
    'work-revocation-during-await-discarded',
    'request-replacement-old-disclosure-refused',
    'bridge-unload-late-callback-discarded',
    'scope-rebind-refused',
    'recovery-source-unknown',
    'async-notification-pending-revoked'
];
type Fixture<P> = RuntimeContextTrustFixture<P>;
export declare function runtimeContextTrustConformance<P>(): readonly ConformanceCase<Fixture<P>>[];
export {};
```

## 声明文件 `testing/trust.d.ts`

```ts
import type { TenantId } from '@omne-harness/legal-identity';
import type { RuntimeContextAuthority, RuntimeContextTrust, ScopeBindingSource } from '../index.js';
export type RuntimeContextTrustControls = Readonly<{
    revokeAuthorization(): void;
    revokeWork(): void;
    advanceRequestGeneration(): void;
    advanceBridgeGeneration(): void;
}>;
export interface RuntimeContextTrustFixture<P = unknown> {
    create(input: Readonly<{
        authority: RuntimeContextAuthority<P>;
        bindings: ScopeBindingSource;
    }>): Readonly<{
        trust: RuntimeContextTrust<P>;
        controls: RuntimeContextTrustControls;
    }>;
    tenant: TenantId;
    otherTenant: TenantId;
    principal: P;
}
export type RuntimeContextTrustFace = 'holder' | 'producer' | 'reader';
export declare const RUNTIME_CONTEXT_TRUST_DEPENDENCIES: {
    readonly revokeAuthorization: readonly [
        "holder",
        "producer",
        "reader"
    ];
    readonly revokeWork: readonly [
        "holder",
        "reader"
    ];
    readonly advanceRequestGeneration: readonly [
        "producer",
        "reader"
    ];
    readonly advanceBridgeGeneration: readonly [
        "holder",
        "producer",
        "reader"
    ];
};
export type TestRuntimeContextTrust<P> = Readonly<{
    trust: RuntimeContextTrust<P>;
    controls: RuntimeContextTrustControls;
    durability: 'none';
}>;
export declare function createTestRuntimeContextTrust<P>(input: RuntimeContextTrust<P>): TestRuntimeContextTrust<P>;
```

## 声明文件 `trust.d.ts`

```ts
import type { RuntimeContextAuthority, ScopeBindingSource } from './authority.js';
export type RuntimeContextTrust<P> = Readonly<{
    authority: RuntimeContextAuthority<P>;
    bindings: ScopeBindingSource;
}>;
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
