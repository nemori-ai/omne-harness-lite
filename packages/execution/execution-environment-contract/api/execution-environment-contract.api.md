# @omne-harness/execution-environment-contract 的 API 快照

<!-- omne-contract-api 快照格式 1 -->

> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。

## 入口 `.` · `index.d.ts`

- `Access` · 包 `@omne-harness/legal-identity`
- `AcquireInput` · `environment.d.ts`
- `Acquired` · `lease.d.ts`
- `AcquisitionInspection` · `lease.d.ts`
- `AcquisitionListing` · `environment.d.ts`
- `AcquisitionQuery` · `lease.d.ts`
- `AcquisitionRef` · `identity.d.ts`
- `AcquisitionSettlement` · `environment.d.ts`
- `AcquisitionState` · `lease.d.ts`
- `AllocationCleanup` · `lease.d.ts`
- `AllocationFailed` · `lease.d.ts`
- `BindingKind` · `binding.d.ts`
- `CommandFacility` · `facilities/command.d.ts`
- `CommandOutcome` · `facilities/command.d.ts`
- `DecodeIssue` = `Issue` · `decode.d.ts`
- `EnvironmentAction` · `environment.d.ts`
- `EnvironmentAdoption` · `lease.d.ts`
- `EnvironmentAuthority` · `environment.d.ts`
- `EnvironmentBinding` · `binding.d.ts`
- `EnvironmentContinuity` · `binding.d.ts`
- `EnvironmentDescription` · `environment.d.ts`
- `EnvironmentFacilities` · `facility.d.ts`
- `EnvironmentLease` · `lease.d.ts`
- `EnvironmentNeedDeclaration` · `need-declaration.d.ts`
- `EnvironmentProvider` · `environment.d.ts`
- `EnvironmentRequirement` · `requirement.d.ts`
- `ExecutionEnvironment` · `environment.d.ts`
- `ExecutionHostFactsValue` · `blocks.d.ts`
- `ExecutionPlacementEntry` · `blocks.d.ts`
- `ExecutionPlacementValue` · `blocks.d.ts`
- `FacilityDescriptor` · `facility.d.ts`
- `FacilityGuard` · `ports.d.ts`
- `FacilityKey` · `facility.d.ts`
- `FacilityOperation` · `facility.d.ts`
- `FacilityReason` · `facility.d.ts`
- `FacilityRequest` · `facility.d.ts`
- `FacilityResult` · `facility.d.ts`
- `FacilitySet` · `lease.d.ts`
- `FileBatchOutcome` · `facilities/files.d.ts`
- `FileBatchRecognition` · `facilities/files.d.ts`
- `FileBatchRef` · `facilities/files.d.ts`
- `FileIdentity` · `facilities/files.d.ts`
- `FileInformation` · `facilities/files.d.ts`
- `FileRequest` · `facilities/files.d.ts`
- `FileSystemFacility` · `facilities/files.d.ts`
- `FileTarget` · `facilities/files.d.ts`
- `FileVersion` · `facilities/files.d.ts`
- `HandleGeneration` · `facilities/files.d.ts`
- `HostDate` · `blocks.d.ts`
- `InstanceIdentity` · `lease.d.ts`
- `IsolationClaim` · `requirement.d.ts`
- `IsolationClaims` · `requirement.d.ts`
- `LeaseInvalidation` · `lease.d.ts`
- `LeaseRelease` · `lease.d.ts`
- `LookupUnknown` · `lease.d.ts`
- `ManagedResource` · `ports.d.ts`
- `ObjectToken` · `facilities/files.d.ts`
- `OperationName` · `operation-schemas.d.ts`
- `OperationSchema` · `operation-schemas.d.ts`
- `OriginRef` · `identity.d.ts`
- `OriginalAcquisition` · `lease.d.ts`
- `OriginalInspection` · `lease.d.ts`
- `OutputChunk` · `facilities/command.d.ts`
- `OutputCount` · `facilities/command.d.ts`
- `OutputPolicy` · `facilities/command.d.ts`
- `OutputSummary` · `facilities/command.d.ts`
- `OwnedRecovery` · `environment.d.ts`
- `Pending` · `lease.d.ts`
- `Placement` · `lease.d.ts`
- `PlacementInput` · `environment.d.ts`
- `PlatformFacts` · `environment.d.ts`
- `ProcessHandle` · `facilities/command.d.ts`
- `ProviderAcquireInput` · `environment.d.ts`
- `ProviderAcquisition` · `environment.d.ts`
- `ProviderAcquisitionStatus` · `environment.d.ts`
- `ProviderCapabilities` · `judge.d.ts`
- `ProviderFacts` · `environment.d.ts`
- `ProviderIdentity` · `lease.d.ts`
- `ProviderMatch` · `judge.d.ts`
- `ProviderQuota` · `environment.d.ts`
- `ProviderRegistrations` · `environment.d.ts`
- `QuotaAnswer` · `environment.d.ts`
- `RecoveryAccess` · `ports.d.ts`
- `RecoveryAuthority` · `ports.d.ts`
- `RecoveryInspection` · `lease.d.ts`
- `RecoveryListing` · `environment.d.ts`
- `RegistryInvalidationReason` · `lease.d.ts`
- `RejectReason` · `lease.d.ts`
- `Rejected` · `lease.d.ts`
- `RequirementRefusal` · `judge.d.ts`
- `ResourceLedger` · `ports.d.ts`
- `ResourceRecovery` · `environment.d.ts`
- `Retirement` · `environment.d.ts`
- `TerminalFacility` · `facilities/terminal.d.ts`
- `TerminalInformation` · `facilities/terminal.d.ts`
- `TerminalRef` · `facilities/terminal.d.ts`
- `UnknownAcquisition` · `lease.d.ts`
- `UnsupportedRecovery` · `environment.d.ts`
- `acquireParamsSchema` · `operation-schemas.d.ts`
- `acquireResultSchema` · `operation-schemas.d.ts`
- `acquisitionRef` · `identity.d.ts`
- `bindingKinds` · `binding.d.ts`
- `bindingScope` · `binding.d.ts`
- `commandFacility` · `facilities/command.d.ts`
- `createRecoveryAccess` · `ports.d.ts`
- `describeFacility` · `facility.d.ts`
- `describeParamsSchema` · `operation-schemas.d.ts`
- `describeResultSchema` · `operation-schemas.d.ts`
- `environmentNeedAdoption` · `need-declaration.d.ts`
- `environmentNeedSchema` · `need-declaration.d.ts`
- `executionHostFactsBlock` · `blocks.d.ts`
- `executionPlacementBlock` · `blocks.d.ts`
- `filesFacility` · `facilities/files.d.ts`
- `inspectAcquisitionParamsSchema` · `operation-schemas.d.ts`
- `inspectAcquisitionResultSchema` · `operation-schemas.d.ts`
- `inspectRecoveryAcquisitionParamsSchema` · `operation-schemas.d.ts`
- `inspectRecoveryAcquisitionResultSchema` · `operation-schemas.d.ts`
- `judgeRequirement` · `judge.d.ts`
- `managedResourceSchema` · `operation-schemas.d.ts`
- `matchProviders` · `judge.d.ts`
- `operationSchemas` · `operation-schemas.d.ts`
- `originRef` · `identity.d.ts`
- `originalAcquisitionSchema` · `operation-schemas.d.ts`
- `providerFactsSchema` · `operation-schemas.d.ts`
- `recoverOwnedParamsSchema` · `operation-schemas.d.ts`
- `recoverOwnedResultSchema` · `operation-schemas.d.ts`
- `registerFacilityParamsSchema` · `operation-schemas.d.ts`
- `registerProviderParamsSchema` · `operation-schemas.d.ts`
- `releaseScopeParamsSchema` · `operation-schemas.d.ts`
- `releaseScopeResultSchema` · `operation-schemas.d.ts`
- `resolvePlacementParamsSchema` · `operation-schemas.d.ts`
- `resolvePlacementResultSchema` · `operation-schemas.d.ts`
- `terminalFacility` · `facilities/terminal.d.ts`

## 入口 `./testing` · `testing/index.d.ts`

- `CaseVerdict` · `testing/case.d.ts`
- `CommandScript` · `testing/scripted-command.d.ts`
- `ConformanceCase` · `testing/case.d.ts`
- `EnvironmentAuthorityScript` · `testing/doubles.d.ts`
- `EnvironmentConformanceOptions` · `testing/environment-conformance.d.ts`
- `EnvironmentConformancePorts` · `testing/environment-conformance.d.ts`
- `EnvironmentConformanceSubject` · `testing/environment-conformance.d.ts`
- `MemoryFileSystem` · `testing/memory-files.d.ts`
- `MemoryFileSystemOptions` · `testing/memory-files.d.ts`
- `MemoryResourceLedger` · `testing/doubles.d.ts`
- `NotApplicable` · `testing/case.d.ts`
- `ProviderConformanceOptions` · `testing/provider-conformance.d.ts`
- `ProviderConformanceSubject` · `testing/provider-conformance.d.ts`
- `ProviderScript` · `testing/doubles.d.ts`
- `ScriptedCommandAnswer` · `testing/scripted-command.d.ts`
- `ScriptedCommandFacility` · `testing/scripted-command.d.ts`
- `ScriptedEnvironmentAuthority` · `testing/doubles.d.ts`
- `ScriptedEnvironmentProvider` · `testing/doubles.d.ts`
- `ScriptedFacilityGuard` · `testing/doubles.d.ts`
- `ScriptedRecoveryAuthority` · `testing/doubles.d.ts`
- `ScriptedScopeBindings` · `testing/doubles.d.ts`
- `createMemoryFileSystem` · `testing/memory-files.d.ts`
- `createMemoryResourceLedger` · `testing/doubles.d.ts`
- `createScriptedCommandFacility` · `testing/scripted-command.d.ts`
- `createScriptedEnvironmentAuthority` · `testing/doubles.d.ts`
- `createScriptedEnvironmentProvider` · `testing/doubles.d.ts`
- `createScriptedFacilityGuard` · `testing/doubles.d.ts`
- `createScriptedRecoveryAuthority` · `testing/doubles.d.ts`
- `createScriptedScopeBindings` · `testing/doubles.d.ts`
- `environmentProviderConformance` · `testing/provider-conformance.d.ts`
- `executionEnvironmentConformance` · `testing/environment-conformance.d.ts`
- `runConformanceCase` · `testing/case.d.ts`

## 声明文件 `binding.d.ts`

```ts
import type { TenantId } from '@omne-harness/legal-identity';
import type { ScopeRef } from '@omne-harness/runtime-context-contract';
import type { OriginRef } from './identity.ts';
export type EnvironmentBinding = {
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
export type BindingKind = EnvironmentBinding['kind'];
export type EnvironmentContinuity = {
    readonly kind: 'not_guaranteed';
} | {
    readonly kind: 'continuous';
    readonly data: string;
    readonly revision: string;
} | {
    readonly kind: 'lost';
    readonly previous: string;
};
export declare const bindingKinds: readonly BindingKind[];
export declare function bindingScope(binding: EnvironmentBinding): ScopeRef | undefined;
```

## 声明文件 `blocks.d.ts`

```ts
import type { SuppliedBlockDescriptor } from '@omne-harness/runtime-context-contract';
import type { EnvironmentBinding, EnvironmentContinuity } from './binding.ts';
import { type Decoder } from './decode.ts';
import type { ProviderFacts } from './environment.ts';
import type { FacilityKey } from './facility.ts';
import type { OriginRef } from './identity.ts';
import type { InstanceIdentity } from './lease.ts';
export type ExecutionPlacementEntry = Readonly<{
    origin: OriginRef;
    binding: EnvironmentBinding;
    instance: InstanceIdentity;
    continuity: EnvironmentContinuity;
    facilities: readonly FacilityKey[];
    observedAt: number;
}>;
export type ExecutionPlacementValue = readonly ExecutionPlacementEntry[];
export type HostDate = string & {
    readonly __hostDate: unique symbol;
};
export type ExecutionHostFactsValue = Readonly<{
    date: HostDate;
    providers: readonly ProviderFacts[];
}>;
declare module '@omne-harness/runtime-context-contract' {
    interface ContextBlocks {
        'execution.placement': ExecutionPlacementValue;
        'execution.host-facts': ExecutionHostFactsValue;
    }
}
export declare const decodeInstance: Decoder<InstanceIdentity>;
export declare const decodeFacts: Decoder<ProviderFacts>;
export declare const executionPlacementBlock: SuppliedBlockDescriptor<'execution.placement', ExecutionPlacementValue>;
export declare const executionHostFactsBlock: SuppliedBlockDescriptor<'execution.host-facts', ExecutionHostFactsValue>;
```

## 声明文件 `decode.d.ts`

```ts
import { type JsonValue } from '@omne-harness/json-text';
import { type TenantId } from '@omne-harness/legal-identity';
import type { ScopeRef } from '@omne-harness/runtime-context-contract';
import type { StandardTyped } from '@omne-harness/schema-provider';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import { type BindingKind, type EnvironmentBinding, type EnvironmentContinuity } from './binding.ts';
import type { FacilityKey } from './facility.ts';
import type { Access, AcquisitionRef, OriginRef } from './identity.ts';
import type { EnvironmentRequirement, IsolationClaim } from './requirement.ts';
export type Path = readonly (string | number)[];
export type Issue = Readonly<{
    message: string;
    path: Path;
}>;
export type Decoded<T> = {
    readonly ok: true;
    readonly value: T;
} | {
    readonly ok: false;
    readonly issues: readonly Issue[];
};
export type Decoder<T> = (value: unknown, path: Path) => Decoded<T>;
export declare function accept<T>(value: T): Decoded<T>;
export declare function refuse(path: Path, message: string): Decoded<never>;
export declare function isRecord(value: unknown): value is Readonly<Record<string, unknown>>;
export declare function exactKeys(record: Readonly<Record<string, unknown>>, path: Path, required: readonly string[], optional?: readonly string[]): Decoded<true>;
export declare function decodeArray<T>(element: Decoder<T>): Decoder<readonly T[]>;
export declare function decodeString(value: unknown, path: Path): Decoded<string>;
export declare function decodeNumber(value: unknown, path: Path): Decoded<number>;
export declare const decodeFacilityKey: Decoder<FacilityKey>;
export declare const decodeIsolationClaim: Decoder<IsolationClaim>;
export declare const decodeBindingKind: Decoder<BindingKind>;
export declare const decodeOrigin: Decoder<OriginRef>;
export declare const decodeAcquisition: Decoder<AcquisitionRef>;
export declare function decodeNonEmpty(value: unknown, path: Path): Decoded<string>;
export declare function decodeLiteral<const L extends string>(literals: readonly L[]): Decoder<L>;
export declare function hasFunctions(record: Readonly<Record<string, unknown>>, path: Path, names: readonly string[]): Decoded<true>;
export declare const decodeJsonValue: Decoder<JsonValue>;
export declare const decodeScope: Decoder<ScopeRef>;
export declare const decodeTenant: Decoder<TenantId>;
export declare const decodeAccess: Decoder<Access<unknown>>;
export declare const decodeBinding: Decoder<EnvironmentBinding>;
export declare const decodeContinuity: Decoder<EnvironmentContinuity>;
export declare const decodeRequirement: Decoder<EnvironmentRequirement>;
export declare function standardSchema<T>(decode: Decoder<T>): StandardSchemaV1<unknown, T> & StandardTyped<T>;
```

## 声明文件 `environment.d.ts`

```ts
import type { JsonValue } from '@omne-harness/json-text';
import type { TenantId } from '@omne-harness/legal-identity';
import type { AuthorityDecision, ScopeRef } from '@omne-harness/runtime-context-contract';
import type { BindingKind, EnvironmentBinding, EnvironmentContinuity } from './binding.ts';
import type { FacilityDescriptor, FacilityKey } from './facility.ts';
import type { Access, AcquisitionRef, OriginRef } from './identity.ts';
import type { AcquisitionInspection, AcquisitionQuery, AcquisitionState, Acquired, AllocationFailed, EnvironmentLease, InstanceIdentity, LookupUnknown, OriginalAcquisition, Pending, Placement, ProviderIdentity, RecoveryInspection, Rejected, UnknownAcquisition } from './lease.ts';
import type { FacilityGuard, ManagedResource, RecoveryAccess, ResourceLedger } from './ports.ts';
import type { EnvironmentRequirement, IsolationClaim } from './requirement.ts';
export type PlatformFacts = Readonly<{
    os: string;
    release: string;
}>;
export type ProviderFacts = Readonly<{
    provider: string;
    generation: string;
    version: string;
    platform: PlatformFacts;
    facilities: readonly FacilityKey[];
    isolation: readonly IsolationClaim[];
    prerequisites: 'satisfied' | 'unsatisfied' | 'unknown';
}>;
export type ProviderAcquireInput = Readonly<{
    acquisition: AcquisitionRef;
    origin: OriginRef;
    scope: ScopeRef;
    placement: Placement;
    tenant: TenantId;
    ledger: ResourceLedger;
}>;
export type ProviderAcquisition = Readonly<{
    kind: 'acquired';
    lease: EnvironmentLease;
    evidence: JsonValue;
}> | Rejected | Readonly<{
    kind: 'unknown';
    acquisition: AcquisitionRef;
}>;
export type RecoveryListing = Readonly<{
    kind: 'listed';
    resources: readonly ManagedResource[];
}> | Readonly<{
    kind: 'unavailable';
}>;
export type ResourceRecovery = Readonly<{
    status: 'confirmedStopped' | 'pending' | 'unsupported';
    evidence: JsonValue | null;
}>;
export type Retirement = Readonly<{
    kind: 'drained';
}> | Readonly<{
    kind: 'pending';
    resources: readonly ManagedResource[];
}>;
export type ProviderQuota = Readonly<{
    unit: 'unsettled-acquisition';
    perTenant: number;
    global: number | null;
}>;
export type QuotaAnswer = Readonly<{
    kind: 'declared';
    quota: ProviderQuota;
}> | Readonly<{
    kind: 'unavailable';
}> | Readonly<{
    kind: 'unknown';
}>;
export type ProviderAcquisitionStatus = Readonly<{
    kind: 'acquired';
    lease: EnvironmentLease;
    evidence: JsonValue;
}> | Readonly<{
    kind: 'pending';
    phase: 'acquiring' | 'provisional' | 'releasing';
    resources: readonly ManagedResource[];
}> | Readonly<{
    kind: 'notAllocated';
}> | Readonly<{
    kind: 'settled';
}> | Readonly<{
    kind: 'conflict';
}> | Readonly<{
    kind: 'unavailable';
}> | Readonly<{
    kind: 'unknown';
}>;
export type AcquisitionListing = Readonly<{
    kind: 'listed';
    acquisitions: readonly OriginalAcquisition[];
}> | Readonly<{
    kind: 'unavailable';
}> | Readonly<{
    kind: 'unknown';
}>;
export type AcquisitionSettlement = Readonly<{
    kind: 'settled';
}> | Readonly<{
    kind: 'notAllocated';
}> | Readonly<{
    kind: 'pending';
    resources: readonly ManagedResource[];
}> | Readonly<{
    kind: 'unsupported';
}> | Readonly<{
    kind: 'conflict';
}> | Readonly<{
    kind: 'unavailable';
}> | Readonly<{
    kind: 'unknown';
}>;
export interface EnvironmentProvider {
    readonly name: string;
    readonly generation: string;
    readonly version: string;
    readonly quotaDomain: string;
    readonly bindingKinds: readonly BindingKind[];
    readonly continuity: EnvironmentContinuity;
    readonly facilities: readonly FacilityKey[];
    readonly isolation: readonly IsolationClaim[];
    describe(): Promise<ProviderFacts>;
    quota(tenant: TenantId): Promise<QuotaAnswer>;
    acquire(input: ProviderAcquireInput): Promise<ProviderAcquisition>;
    inspectAcquisition(original: OriginalAcquisition): Promise<ProviderAcquisitionStatus>;
    listAcquisitions(scope: ScopeRef): Promise<AcquisitionListing>;
    settleAcquisition(original: OriginalAcquisition): Promise<AcquisitionSettlement>;
    listRecoveryResources?(scope: ScopeRef): Promise<RecoveryListing>;
    recover?(resource: ManagedResource): Promise<ResourceRecovery>;
    retire(): Promise<Retirement>;
}
export type EnvironmentDescription = Readonly<{
    acquisition: AcquisitionRef;
    origin: OriginRef;
    binding: EnvironmentBinding;
    provider: ProviderIdentity;
    instance: InstanceIdentity;
    continuity: EnvironmentContinuity;
    facilities: readonly FacilityKey[];
    state: AcquisitionState['kind'];
}>;
export type UnsupportedRecovery = Readonly<{
    kind: 'provider';
    provider: ProviderIdentity;
}> | Readonly<{
    kind: 'resource';
    resource: ManagedResource;
}>;
export type OwnedRecovery = Readonly<{
    kind: 'recovered';
    scope: ScopeRef;
    stopped: readonly ManagedResource[];
    pending: readonly ManagedResource[];
    unsupported: readonly UnsupportedRecovery[];
    unavailable: readonly ProviderIdentity[];
    settledAcquisitions: readonly Readonly<{
        original: OriginalAcquisition;
        outcome: 'settled' | 'notAllocated';
    }>[];
    pendingAcquisitions: readonly Readonly<{
        original: OriginalAcquisition;
        reason: 'pending' | 'unknown';
        resources: readonly ManagedResource[];
    }>[];
    unsupportedAcquisitions: readonly OriginalAcquisition[];
}>;
export type PlacementInput = Readonly<{
    scope: ScopeRef;
    requirement: EnvironmentRequirement;
}>;
export type AcquireInput<P> = Readonly<{
    acquisition: AcquisitionRef;
    origin: OriginRef;
    scope: ScopeRef;
    placement: Placement;
    ledger: ResourceLedger;
    guard: FacilityGuard<P>;
}>;
export type EnvironmentAction = Readonly<{
    kind: 'resolve';
    scope: ScopeRef;
}> | Readonly<{
    kind: 'acquire';
    original: OriginalAcquisition;
}> | Readonly<{
    kind: 'inspect';
    tenant: TenantId;
    acquisition: AcquisitionRef;
}> | Readonly<{
    kind: 'inspect-original';
    original: OriginalAcquisition;
}> | Readonly<{
    kind: 'describe';
    scope: ScopeRef;
}>;
export interface EnvironmentAuthority<P> {
    authorize(access: Access<P>, action: EnvironmentAction): Promise<AuthorityDecision<P>>;
}
export interface ExecutionEnvironment<P> {
    resolvePlacement(access: Access<P>, input: PlacementInput): Promise<Placement | Rejected | LookupUnknown>;
    acquire(access: Access<P>, input: AcquireInput<P>): Promise<Acquired | Pending | Rejected | AllocationFailed | UnknownAcquisition>;
    inspectAcquisition(access: Access<P>, query: AcquisitionQuery): Promise<AcquisitionInspection>;
    inspectRecoveryAcquisition(access: RecoveryAccess, original: OriginalAcquisition): Promise<RecoveryInspection>;
    describe(access: Access<P>, scope: ScopeRef): Promise<readonly EnvironmentDescription[] | Rejected | LookupUnknown>;
    recoverOwned(scope: ScopeRef, access: RecoveryAccess, known?: readonly OriginalAcquisition[]): Promise<OwnedRecovery | Rejected | LookupUnknown>;
    releaseScope(scope: ScopeRef, access: RecoveryAccess, known?: readonly OriginalAcquisition[]): Promise<OwnedRecovery | Rejected | LookupUnknown>;
}
export interface ProviderRegistrations {
    registerFacility<K extends FacilityKey>(descriptor: FacilityDescriptor<K>): () => Promise<void>;
    registerProvider(provider: EnvironmentProvider): () => Promise<void>;
}
```

## 声明文件 `facilities/command.d.ts`

```ts
import { type FacilityDescriptor, type FacilityRequest, type FacilityResult } from '../facility.ts';
export type OutputChunk = {
    readonly stream: 'stdout' | 'stderr' | 'terminal';
    readonly data: Uint8Array;
    readonly observedOffset: number;
};
export type OutputPolicy = {
    readonly maxBufferedBytes: number;
    readonly maxChunkBytes: number;
    readonly overflow: 'discard';
};
export type OutputCount = {
    readonly observedBytes: number;
    readonly discardedBytes: number;
};
export type OutputSummary = {
    readonly mode: 'separate';
    readonly stdout: OutputCount;
    readonly stderr: OutputCount;
} | {
    readonly mode: 'terminal';
    readonly terminal: OutputCount;
};
export type CommandOutcome = {
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
export interface ProcessHandle {
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
export interface CommandFacility<P> {
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
declare module '../facility.ts' {
    interface EnvironmentFacilities {
        command: CommandFacility<unknown>;
    }
}
export declare const commandFacility: FacilityDescriptor<'command'>;
```

## 声明文件 `facilities/files.d.ts`

```ts
import { type FacilityDescriptor, type FacilityRequest, type FacilityResult } from '../facility.ts';
export type ObjectToken = {
    readonly token: string;
};
export type HandleGeneration = {
    readonly object: ObjectToken;
    readonly generation: string;
};
export type FileVersion = string;
export type FileRequest<P> = FacilityRequest<P> & {
    readonly path: string;
    readonly named: ObjectToken | null;
};
export type FileIdentity = {
    readonly object: ObjectToken;
    readonly handle: HandleGeneration;
    readonly version: FileVersion;
};
export type FileInformation = FileIdentity & {
    readonly type: 'file' | 'directory' | 'symlink';
    readonly sizeBytes: number;
    readonly modifiedMs: number;
};
export type FileTarget = {
    readonly path: string;
    readonly named: ObjectToken | null;
};
export type FileBatchRef = {
    readonly id: string;
    readonly generation: string;
};
export type FileBatchOutcome = {
    readonly batch: FileBatchRef;
    readonly published: readonly string[];
} & ({
    readonly kind: 'committed';
} | {
    readonly kind: 'unknown';
    readonly reason: 'effectUnknown' | 'conflict' | 'closed' | 'unavailable';
});
export type FileBatchRecognition = {
    readonly batch: FileBatchRef;
    readonly state: 'complete' | 'partial' | 'interrupted' | 'conflict' | 'pending';
    readonly published: readonly string[];
    readonly matchingPrepared: readonly string[];
    readonly conflicting: readonly string[];
};
export interface FileSystemFacility<P> {
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
declare module '../facility.ts' {
    interface EnvironmentFacilities {
        files: FileSystemFacility<unknown>;
    }
}
export declare const filesFacility: FacilityDescriptor<'files'>;
```

## 声明文件 `facilities/terminal.d.ts`

```ts
import { type FacilityDescriptor, type FacilityRequest, type FacilityResult } from '../facility.ts';
import type { ProcessHandle } from './command.ts';
export type TerminalRef = {
    readonly id: string;
    readonly generation: string;
};
export type TerminalInformation = {
    readonly terminal: TerminalRef;
    readonly state: 'idle' | 'running' | 'invalid' | 'closed';
    readonly observedCwd: string;
};
export interface TerminalFacility<P> {
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
declare module '../facility.ts' {
    interface EnvironmentFacilities {
        terminal: TerminalFacility<unknown>;
    }
}
export declare const terminalFacility: FacilityDescriptor<'terminal'>;
```

## 声明文件 `facility.d.ts`

```ts
import type { EnvironmentBinding } from './binding.ts';
import type { Access, OriginRef } from './identity.ts';
export interface EnvironmentFacilities {
}
export type FacilityKey = keyof EnvironmentFacilities & string;
export type FacilityOperation<K extends FacilityKey> = keyof EnvironmentFacilities[K] & string;
export interface FacilityDescriptor<K extends FacilityKey> {
    readonly key: K;
    readonly operations: readonly FacilityOperation<K>[];
    readonly guarded: readonly FacilityOperation<K>[];
}
export interface FacilityRequest<P> {
    readonly requestId: string;
    readonly access: Access<P>;
    readonly origin: OriginRef;
    readonly binding: EnvironmentBinding;
}
export type FacilityReason = 'invalidInput' | 'notAuthorized' | 'notFound' | 'conflict' | 'busy' | 'capacity' | 'unsupported' | 'closed' | 'unavailable' | 'effectUnknown';
export type FacilityResult<T> = {
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
export declare function describeFacility<K extends FacilityKey>(key: K, operations: {
    readonly [O in FacilityOperation<K>]: 'guarded' | 'open';
}): FacilityDescriptor<K>;
```

## 声明文件 `identity.d.ts`

```ts
export type OriginRef = string & {
    readonly __origin: unique symbol;
};
export type AcquisitionRef = string & {
    readonly __acquisition: unique symbol;
};
export type { Access } from '@omne-harness/legal-identity';
export declare function originRef(text: string): OriginRef;
export declare function acquisitionRef(text: string): AcquisitionRef;
```

## 声明文件 `index.d.ts`

```ts
export { acquisitionRef, originRef } from './identity.ts';
export type { Access, AcquisitionRef, OriginRef } from './identity.ts';
export { bindingKinds, bindingScope } from './binding.ts';
export type { BindingKind, EnvironmentBinding, EnvironmentContinuity } from './binding.ts';
export type { EnvironmentRequirement, IsolationClaim, IsolationClaims } from './requirement.ts';
export { describeFacility } from './facility.ts';
export type { EnvironmentFacilities, FacilityDescriptor, FacilityKey, FacilityOperation, FacilityReason, FacilityRequest, FacilityResult, } from './facility.ts';
export { filesFacility } from './facilities/files.ts';
export type { FileBatchOutcome, FileBatchRecognition, FileBatchRef, FileIdentity, FileInformation, FileRequest, FileSystemFacility, FileTarget, FileVersion, HandleGeneration, ObjectToken, } from './facilities/files.ts';
export { commandFacility } from './facilities/command.ts';
export type { CommandFacility, CommandOutcome, OutputChunk, OutputCount, OutputPolicy, OutputSummary, ProcessHandle, } from './facilities/command.ts';
export { terminalFacility } from './facilities/terminal.ts';
export type { TerminalFacility, TerminalInformation, TerminalRef } from './facilities/terminal.ts';
export { createRecoveryAccess } from './ports.ts';
export type { FacilityGuard, ManagedResource, RecoveryAccess, RecoveryAuthority, ResourceLedger, } from './ports.ts';
export type { AcquisitionInspection, AcquisitionQuery, AcquisitionState, Acquired, AllocationCleanup, AllocationFailed, LookupUnknown, OriginalAcquisition, OriginalInspection, RecoveryInspection, UnknownAcquisition, EnvironmentAdoption, EnvironmentLease, FacilitySet, InstanceIdentity, LeaseInvalidation, LeaseRelease, Pending, Placement, ProviderIdentity, RegistryInvalidationReason, RejectReason, Rejected, } from './lease.ts';
export type { AcquireInput, AcquisitionListing, AcquisitionSettlement, EnvironmentAction, EnvironmentAuthority, EnvironmentDescription, EnvironmentProvider, ProviderAcquisitionStatus, ProviderQuota, QuotaAnswer, ExecutionEnvironment, OwnedRecovery, PlacementInput, PlatformFacts, ProviderAcquireInput, ProviderAcquisition, ProviderFacts, ProviderRegistrations, RecoveryListing, ResourceRecovery, Retirement, UnsupportedRecovery, } from './environment.ts';
export { environmentNeedAdoption, environmentNeedSchema } from './need-declaration.ts';
export type { EnvironmentNeedDeclaration } from './need-declaration.ts';
export { executionHostFactsBlock, executionPlacementBlock } from './blocks.ts';
export type { ExecutionHostFactsValue, ExecutionPlacementEntry, ExecutionPlacementValue, } from './blocks.ts';
export { judgeRequirement, matchProviders } from './judge.ts';
export type { ProviderCapabilities, ProviderMatch, RequirementRefusal } from './judge.ts';
export type { Issue as DecodeIssue } from './decode.ts';
export { resolvePlacementParamsSchema, acquireParamsSchema, inspectAcquisitionParamsSchema, inspectRecoveryAcquisitionParamsSchema, describeParamsSchema, recoverOwnedParamsSchema, releaseScopeParamsSchema, registerFacilityParamsSchema, registerProviderParamsSchema, resolvePlacementResultSchema, acquireResultSchema, inspectAcquisitionResultSchema, inspectRecoveryAcquisitionResultSchema, describeResultSchema, recoverOwnedResultSchema, releaseScopeResultSchema, operationSchemas, providerFactsSchema, managedResourceSchema, originalAcquisitionSchema, } from './operation-schemas.ts';
export type { OperationSchema, OperationName } from './operation-schemas.ts';
export type { HostDate } from './blocks.ts';
```

## 声明文件 `judge.d.ts`

```ts
import { type Outcome } from '@omne-harness/operation-result';
import type { EnvironmentBinding } from './binding.ts';
import { type Issue } from './decode.ts';
import type { EnvironmentProvider } from './environment.ts';
import type { Rejected } from './lease.ts';
import type { EnvironmentRequirement } from './requirement.ts';
export type ProviderCapabilities = Pick<EnvironmentProvider, 'bindingKinds' | 'facilities' | 'isolation'>;
export type ProviderMatch<T extends ProviderCapabilities> = Readonly<{
    kind: 'matched';
    provider: T;
    binding: EnvironmentBinding;
}>;
export declare function matchProviders<T extends ProviderCapabilities>(providers: readonly T[], requirement: EnvironmentRequirement): ProviderMatch<T> | Rejected;
export type RequirementRefusal = Readonly<{
    reason: 'invalidInput';
    issues: readonly Issue[];
}>;
export declare function judgeRequirement(value: unknown): Outcome<EnvironmentRequirement, RequirementRefusal>;
```

## 声明文件 `lease.d.ts`

```ts
import type { JsonValue } from '@omne-harness/json-text';
import type { EnvironmentBinding, EnvironmentContinuity } from './binding.ts';
import type { EnvironmentFacilities, FacilityKey } from './facility.ts';
import type { TenantId } from '@omne-harness/legal-identity';
import type { ScopeRef } from '@omne-harness/runtime-context-contract';
import type { AcquisitionRef, OriginRef } from './identity.ts';
import type { ManagedResource } from './ports.ts';
import type { EnvironmentRequirement } from './requirement.ts';
export type ProviderIdentity = Readonly<{
    name: string;
    generation: string;
    version: string;
}>;
export type InstanceIdentity = Readonly<{
    id: string;
    generation: string;
}>;
export type RejectReason = 'notAuthorized' | 'noMatchingEnvironment' | 'missingFacility' | 'unsupportedFacility' | 'isolationUnconfirmed' | 'referenceExpired' | 'providerUnavailable' | 'ownerStopped' | 'invalidInput' | 'unavailable' | 'ambiguousEnvironment' | 'callerMismatch' | 'quotaExceeded' | 'globalCapacityExceeded' | 'recoveryUnready' | 'acquisitionConflict' | 'allocationNotPerformed';
export type Rejected = Readonly<{
    kind: 'rejected';
    reason: RejectReason;
}>;
export type Placement = Readonly<{
    kind: 'placement';
    requirement: EnvironmentRequirement;
    binding: EnvironmentBinding;
    provider: ProviderIdentity;
    continuity: EnvironmentContinuity;
    quotaDomain: string;
}>;
export type RegistryInvalidationReason = 'providerRetired' | 'scopeReleased' | 'registryClosed' | 'released' | 'providerInvalidated';
export type LeaseInvalidation = {
    readonly source: 'registry';
    readonly reason: RegistryInvalidationReason;
} | {
    readonly source: 'provider';
    readonly reason: string;
};
export type LeaseRelease = {
    readonly kind: 'released';
} | {
    readonly kind: 'pending';
    readonly resources: readonly ManagedResource[];
};
export interface EnvironmentLease<K extends FacilityKey = FacilityKey> {
    readonly placement: Placement;
    readonly instance: InstanceIdentity;
    readonly continuity: EnvironmentContinuity;
    facility<F extends K>(key: F): EnvironmentFacilities[F] | undefined;
    readonly invalidated: Promise<LeaseInvalidation>;
    release(): Promise<LeaseRelease>;
}
export type FacilitySet<K extends FacilityKey> = Pick<EnvironmentFacilities, K>;
export type EnvironmentAdoption = Readonly<{
    acquisition: AcquisitionRef;
    origin: OriginRef;
    placement: Placement;
    provider: ProviderIdentity;
    instance: InstanceIdentity;
    continuity: EnvironmentContinuity;
    evidence: JsonValue;
}>;
export type AllocationCleanup = Readonly<{
    kind: 'settled';
}> | Readonly<{
    kind: 'pending';
}> | Readonly<{
    kind: 'unknown';
}>;
export type AcquisitionState = {
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
    readonly kind: 'allocationFailed';
    readonly reason: RejectReason;
    readonly cleanup: AllocationCleanup;
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
} | {
    readonly kind: 'allocationUnknown';
    readonly acquisition: AcquisitionRef;
} | {
    readonly kind: 'settled';
};
export type Acquired = Readonly<{
    kind: 'acquired';
    lease: EnvironmentLease;
    adoption: EnvironmentAdoption;
}>;
export type Pending = Readonly<{
    kind: 'pending';
    state: Extract<AcquisitionState, {
        readonly kind: 'acquiring' | 'provisional' | 'invalidated' | 'releasing' | 'pendingRelease' | 'released' | 'settled';
    }>;
}>;
export type AllocationFailed = Readonly<{
    kind: 'allocationFailed';
    acquisition: AcquisitionRef;
    reason: RejectReason;
    cleanup: AllocationCleanup;
}>;
export type UnknownAcquisition = Readonly<{
    kind: 'unknown';
    acquisition: AcquisitionRef;
    phase: 'preflight' | 'allocation';
}>;
export type LookupUnknown = Readonly<{
    kind: 'unknown';
    cause: 'authority' | 'scope-binding' | 'provider' | 'quota';
}>;
export type OriginalAcquisition = Readonly<{
    tenant: TenantId;
    acquisition: AcquisitionRef;
    origin: OriginRef;
    scope: ScopeRef;
    placement: Placement;
}>;
export type AcquisitionQuery = Readonly<{
    kind: 'local';
    acquisition: AcquisitionRef;
}> | Readonly<{
    kind: 'original';
    original: OriginalAcquisition;
}>;
type QueryCause = 'authority' | 'scope-binding' | 'provider';
export type OriginalInspection = Readonly<{
    kind: 'original';
    status: 'allocated';
    original: OriginalAcquisition;
    adoption: EnvironmentAdoption | null;
}> | Readonly<{
    kind: 'original';
    status: 'pending';
    original: OriginalAcquisition;
    adoption: EnvironmentAdoption | null;
    phase: 'acquiring' | 'provisional' | 'releasing';
    resources: readonly ManagedResource[];
}> | Readonly<{
    kind: 'original';
    status: 'notAllocated' | 'settled' | 'conflict';
    original: OriginalAcquisition;
}> | Readonly<{
    kind: 'original';
    status: 'allocationFailed';
    original: OriginalAcquisition;
    reason: RejectReason;
    cleanup: AllocationCleanup;
}>;
export type AcquisitionInspection = Readonly<{
    kind: 'known';
    state: AcquisitionState;
}> | Readonly<{
    kind: 'unrecorded';
}> | Readonly<{
    kind: 'invalidInput';
}> | Readonly<{
    kind: 'refused';
    reason: 'notAuthorized' | 'callerMismatch';
}> | Readonly<{
    kind: 'queryUnavailable';
    cause: QueryCause;
}> | Readonly<{
    kind: 'queryUnknown';
    cause: QueryCause;
}> | OriginalInspection;
export type RecoveryInspection = Exclude<AcquisitionInspection, Readonly<{
    kind: 'known' | 'unrecorded';
}>>;
export {};
```

## 声明文件 `need-declaration.d.ts`

```ts
import type { StandardTyped } from '@omne-harness/schema-provider';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { BindingKind } from './binding.ts';
import type { FacilityKey } from './facility.ts';
import type { IsolationClaim } from './requirement.ts';
export type EnvironmentNeedDeclaration = Readonly<{
    facilities: readonly FacilityKey[];
    isolation: readonly IsolationClaim[];
    layers: readonly BindingKind[];
}>;
export declare const environmentNeedSchema: StandardSchemaV1<unknown, EnvironmentNeedDeclaration> & StandardTyped<EnvironmentNeedDeclaration>;
export declare const environmentNeedAdoption: Readonly<{
    owner: 'execution-environment';
    name: 'environment-need';
    revision: '1';
    digest: `sha256:${string}`;
}>;
```

## 声明文件 `operation-schemas.d.ts`

```ts
import type { StandardTyped } from '@omne-harness/schema-provider';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { ExecutionEnvironment, EnvironmentProvider } from './environment.ts';
import type { OriginalAcquisition } from './lease.ts';
export type OperationSchema<T> = StandardSchemaV1<unknown, T> & StandardTyped<T>;
export type OperationName = keyof ExecutionEnvironment<unknown> | 'registerFacility' | 'registerProvider';
export declare const resolvePlacementParamsSchema: OperationSchema<Parameters<ExecutionEnvironment<unknown>['resolvePlacement']>>;
export declare const acquireParamsSchema: OperationSchema<Parameters<ExecutionEnvironment<unknown>['acquire']>>;
export declare const inspectAcquisitionParamsSchema: OperationSchema<Parameters<ExecutionEnvironment<unknown>['inspectAcquisition']>>;
export declare const inspectRecoveryAcquisitionParamsSchema: OperationSchema<Parameters<ExecutionEnvironment<unknown>['inspectRecoveryAcquisition']>>;
export declare const describeParamsSchema: OperationSchema<Parameters<ExecutionEnvironment<unknown>['describe']>>;
export declare const recoverOwnedParamsSchema: OperationSchema<Parameters<ExecutionEnvironment<unknown>['recoverOwned']>>;
export declare const releaseScopeParamsSchema: OperationSchema<Parameters<ExecutionEnvironment<unknown>['releaseScope']>>;
export declare const registerFacilityParamsSchema: OperationSchema<[
    Readonly<{
        key: import('./facility.ts').FacilityKey;
        operations: readonly string[];
        guarded: readonly string[];
    }>
]>;
export declare const registerProviderParamsSchema: OperationSchema<[
    EnvironmentProvider
]>;
export declare const resolvePlacementResultSchema: OperationSchema<Awaited<ReturnType<ExecutionEnvironment<unknown>['resolvePlacement']>>>;
export declare const acquireResultSchema: OperationSchema<Awaited<ReturnType<ExecutionEnvironment<unknown>['acquire']>>>;
export declare const inspectAcquisitionResultSchema: OperationSchema<Awaited<ReturnType<ExecutionEnvironment<unknown>['inspectAcquisition']>>>;
export declare const inspectRecoveryAcquisitionResultSchema: OperationSchema<Awaited<ReturnType<ExecutionEnvironment<unknown>['inspectRecoveryAcquisition']>>>;
export declare const describeResultSchema: OperationSchema<Awaited<ReturnType<ExecutionEnvironment<unknown>['describe']>>>;
export declare const recoverOwnedResultSchema: OperationSchema<Awaited<ReturnType<ExecutionEnvironment<unknown>['recoverOwned']>>>;
export declare const releaseScopeResultSchema: OperationSchema<Awaited<ReturnType<ExecutionEnvironment<unknown>['releaseScope']>>>;
export declare const providerFactsSchema: StandardSchemaV1<unknown, Readonly<{
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
export declare const managedResourceSchema: StandardSchemaV1<unknown, {
    readonly key: string;
    readonly provider: string;
    readonly reference: import("@omne-harness/json-text").JsonValue;
}> & StandardTyped<{
    readonly key: string;
    readonly provider: string;
    readonly reference: import("@omne-harness/json-text").JsonValue;
}>;
export declare const originalAcquisitionSchema: OperationSchema<OriginalAcquisition>;
type EnvironmentSchemas = {
    readonly [K in keyof ExecutionEnvironment<unknown>]: Readonly<{
        params: OperationSchema<Parameters<ExecutionEnvironment<unknown>[K]>>;
        result: OperationSchema<Awaited<ReturnType<ExecutionEnvironment<unknown>[K]>>>;
    }>;
};
export declare const operationSchemas: EnvironmentSchemas & Readonly<{
    registerFacility: Readonly<{
        params: typeof registerFacilityParamsSchema;
    }>;
    registerProvider: Readonly<{
        params: typeof registerProviderParamsSchema;
    }>;
}>;
export {};
```

## 声明文件 `ports.d.ts`

```ts
import type { JsonValue } from '@omne-harness/json-text';
import type { ScopeRef } from '@omne-harness/runtime-context-contract';
import type { FacilityKey, FacilityRequest } from './facility.ts';
export interface ManagedResource {
    readonly key: string;
    readonly provider: string;
    readonly reference: JsonValue;
}
export interface FacilityGuard<P> {
    authorize(facility: FacilityKey, operation: string, request: FacilityRequest<P>): Promise<'authorized' | 'notAuthorized' | 'unavailable'>;
}
export interface ResourceLedger {
    readonly closed: AbortSignal;
    plan(resource: ManagedResource): Promise<'recorded' | 'conflict' | 'closed' | 'unavailable'>;
    permit(key: string): Promise<'confirmed' | 'closed' | 'unavailable'>;
    adopt(key: string): Promise<'confirmed' | 'closed' | 'unavailable'>;
    stopped(key: string, status: 'confirmed' | 'unconfirmed'): Promise<'recorded' | 'unavailable'>;
}
declare const recoveryAccessMark: unique symbol;
export interface RecoveryAccess {
    readonly [recoveryAccessMark]: true;
}
export declare function createRecoveryAccess(): RecoveryAccess;
export declare function isRecoveryAccess(value: unknown): value is RecoveryAccess;
export interface RecoveryAuthority {
    authorizeRecovery(access: RecoveryAccess, scope: ScopeRef, resources: readonly ManagedResource[]): Promise<'authorized' | 'notAuthorized' | 'unavailable'>;
}
export {};
```

## 声明文件 `requirement.d.ts`

```ts
import type { EnvironmentBinding } from './binding.ts';
import type { FacilityKey } from './facility.ts';
export interface IsolationClaims {
    readonly process: true;
    readonly 'filesystem-root': true;
    readonly 'network-none': true;
    readonly 'restricted-js': true;
}
export type IsolationClaim = keyof IsolationClaims & string;
export interface EnvironmentRequirement {
    readonly allowedBindings: readonly EnvironmentBinding[];
    readonly facilities: readonly FacilityKey[];
    readonly isolation: readonly IsolationClaim[];
}
```

## 声明文件 `testing/case.d.ts`

```ts
export type ConformanceCase = Readonly<{
    name: string;
    run(): Promise<void>;
}>;
export declare class NotApplicable extends Error {
}
export type CaseVerdict = Readonly<{
    name: string;
    status: 'pass' | 'not-applicable';
    reason?: string;
}>;
export declare function runConformanceCase(test: ConformanceCase): Promise<CaseVerdict>;
export declare function bounded<T>(promise: Promise<T>, ms: number): Promise<T>;
```

## 声明文件 `testing/doubles.d.ts`

```ts
import { type TenantId } from '@omne-harness/legal-identity';
import type { AuthorityDecision, ScopeBinding, ScopeBindingSource, ScopeRef } from '@omne-harness/runtime-context-contract';
import type { Access, AcquisitionListing, AcquisitionSettlement, EnvironmentAction, EnvironmentAuthority, OriginalAcquisition, ProviderAcquisitionStatus, QuotaAnswer, EnvironmentProvider, EnvironmentFacilities, EnvironmentBinding, EnvironmentContinuity, FacilityGuard, FacilityKey, LeaseInvalidation, LeaseRelease, ManagedResource, ProviderAcquireInput, ProviderAcquisition, RecoveryAuthority, RecoveryListing, ResourceLedger, ResourceRecovery, Retirement } from '../index.ts';
export type ProviderScript = Readonly<{
    name?: string;
    generation?: string;
    version?: string;
    quotaDomain?: string;
    quota?: (tenant: TenantId) => Promise<QuotaAnswer>;
    inspect?: (original: OriginalAcquisition) => Promise<ProviderAcquisitionStatus>;
    list?: (scope: ScopeRef) => Promise<AcquisitionListing>;
    settle?: (original: OriginalAcquisition) => Promise<AcquisitionSettlement>;
    bindingKinds?: EnvironmentProvider['bindingKinds'];
    continuity?: EnvironmentContinuity;
    facilities?: readonly FacilityKey[];
    isolation?: EnvironmentProvider['isolation'];
    lease?: Partial<EnvironmentFacilities>;
    acquire?: (input: ProviderAcquireInput) => Promise<ProviderAcquisition>;
    beforeAcquire?: (input: ProviderAcquireInput) => void | Promise<void>;
    afterAcquire?: (input: ProviderAcquireInput, receipt: ProviderAcquisition) => Promise<ProviderAcquisition>;
    receiptBinding?: EnvironmentBinding;
    extraReceiptFields?: Readonly<Record<string, unknown>>;
    release?: () => Promise<LeaseRelease>;
    retire?: () => Promise<Retirement>;
    recoverable?: {
        list(scope: ProviderAcquireInput['scope']): Promise<RecoveryListing>;
        recover(resource: ManagedResource): Promise<ResourceRecovery>;
    };
}>;
export declare function createScriptedEnvironmentProvider(script?: ProviderScript): EnvironmentProvider & {
    durability: 'none';
    calls: {
        acquire: number;
        release: number;
        retire: number;
        start: number;
        list: number;
        recover: number;
        quota: number;
        inspect: number;
        listAcquisitions: number;
        settle: number;
    };
    invalidateLeases(value: LeaseInvalidation): void;
};
export type ScriptedEnvironmentProvider = ReturnType<typeof createScriptedEnvironmentProvider>;
export declare function createMemoryResourceLedger(answers?: Partial<{
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
export type MemoryResourceLedger = ReturnType<typeof createMemoryResourceLedger>;
export declare function createScriptedFacilityGuard<P>(answer?: 'authorized' | 'notAuthorized' | 'unavailable'): FacilityGuard<P> & {
    durability: 'none';
    calls: {
        facility: FacilityKey;
        operation: string;
    }[];
};
export declare function createScriptedRecoveryAuthority(answer?: 'authorized' | 'notAuthorized' | 'unavailable'): RecoveryAuthority & {
    readonly durability: 'none';
};
export type EnvironmentAuthorityScript<P> = (access: Access<P>, action: EnvironmentAction) => AuthorityDecision<P> | undefined;
export declare function createScriptedEnvironmentAuthority<P>(): EnvironmentAuthority<P> & {
    durability: 'none';
    calls: {
        access: Access<P>;
        action: EnvironmentAction;
    }[];
    script(next: EnvironmentAuthorityScript<P> | undefined): void;
    revokeAll(): void;
};
export type ScriptedScopeBindings = ScopeBindingSource & Readonly<{
    durability: 'none';
    calls: readonly ScopeRef[];
    bind(scope: ScopeRef, tenant: TenantId): void;
    answer(scope: ScopeRef, binding: ScopeBinding): void;
}>;
export declare function createScriptedScopeBindings(): ScriptedScopeBindings;
export type ScriptedFacilityGuard<P> = ReturnType<typeof createScriptedFacilityGuard<P>>;
export type ScriptedEnvironmentAuthority<P> = ReturnType<typeof createScriptedEnvironmentAuthority<P>>;
export type ScriptedRecoveryAuthority = ReturnType<typeof createScriptedRecoveryAuthority>;
```

## 声明文件 `testing/environment-conformance.d.ts`

```ts
import type { ScopeBindingSource } from '@omne-harness/runtime-context-contract';
import { type Access, type EnvironmentAuthority, type ExecutionEnvironment, type ProviderRegistrations, type ProviderAcquireInput, type RecoveryAccess } from '../index.ts';
import { type ConformanceCase } from './case.ts';
export type EnvironmentConformancePorts<P> = Readonly<{
    authority: EnvironmentAuthority<P>;
    bindings: ScopeBindingSource;
}>;
export type EnvironmentConformanceSubject<P> = Readonly<{
    environment: ExecutionEnvironment<P> & ProviderRegistrations;
    access: Access<P>;
    otherAccess?: Access<P>;
    scope: ProviderAcquireInput['scope'];
    recoveryAccess?: RecoveryAccess;
    hooks?: {
        close?(): Promise<void>;
    };
    dispose?(): Promise<void>;
}>;
export type EnvironmentConformanceOptions<P> = Readonly<{
    subject(ports: EnvironmentConformancePorts<P>): EnvironmentConformanceSubject<P> | Promise<EnvironmentConformanceSubject<P>>;
    waitMs?: number;
}>;
export declare function executionEnvironmentConformance<P>(options: EnvironmentConformanceOptions<P>): readonly ConformanceCase[];
```

## 声明文件 `testing/index.d.ts`

```ts
export { NotApplicable, runConformanceCase, type ConformanceCase, type CaseVerdict, } from './case.ts';
export { environmentProviderConformance, type ProviderConformanceOptions, type ProviderConformanceSubject, } from './provider-conformance.ts';
export { executionEnvironmentConformance, type EnvironmentConformanceOptions, type EnvironmentConformanceSubject, type EnvironmentConformancePorts, } from './environment-conformance.ts';
export { createScriptedEnvironmentProvider, createMemoryResourceLedger, createScriptedFacilityGuard, createScriptedRecoveryAuthority, createScriptedEnvironmentAuthority, createScriptedScopeBindings, type EnvironmentAuthorityScript, type ScriptedEnvironmentAuthority, type ScriptedScopeBindings, type ProviderScript, type ScriptedEnvironmentProvider, type MemoryResourceLedger, type ScriptedFacilityGuard, type ScriptedRecoveryAuthority, } from './doubles.ts';
export { createMemoryFileSystem, type MemoryFileSystem, type MemoryFileSystemOptions, } from './memory-files.ts';
export { createScriptedCommandFacility, type CommandScript, type ScriptedCommandAnswer, type ScriptedCommandFacility, } from './scripted-command.ts';
```

## 声明文件 `testing/memory-files.d.ts`

```ts
import type { FacilityOperation, FileSystemFacility, ObjectToken } from '../index.ts';
export type MemoryFileSystemOptions = Readonly<{
    files?: Readonly<Record<string, string | Uint8Array>>;
    directories?: readonly string[];
}>;
export type MemoryFileSystem<P = unknown> = Readonly<{
    durability: 'none';
    facility: FileSystemFacility<P>;
    objectToken(path: string): ObjectToken | undefined;
    peek(path: string): Uint8Array | undefined;
    calls: readonly Readonly<{
        operation: FacilityOperation<'files'>;
        path: string;
    }>[];
    close(): void;
}>;
export declare function createMemoryFileSystem<P = unknown>(options?: MemoryFileSystemOptions): MemoryFileSystem<P>;
```

## 声明文件 `testing/provider-conformance.d.ts`

```ts
import { type EnvironmentProvider, type EnvironmentLease, type FacilityResult, type EnvironmentBinding, type ProviderAcquireInput, type FacilityKey } from '../index.ts';
import { type ConformanceCase } from './case.ts';
export type ProviderConformanceSubject = Readonly<{
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
export type ProviderConformanceOptions = Readonly<{
    subject(): ProviderConformanceSubject | Promise<ProviderConformanceSubject>;
    waitMs?: number;
}>;
export declare function environmentProviderConformance(options: ProviderConformanceOptions): readonly ConformanceCase[];
```

## 声明文件 `testing/scripted-command.d.ts`

```ts
import type { CommandFacility, CommandOutcome, FacilityReason, OutputChunk, ProcessHandle } from '../index.ts';
export type ScriptedCommandAnswer = Readonly<{
    kind: 'started';
    output?: readonly Readonly<{
        stream: OutputChunk['stream'];
        data: string | Uint8Array;
    }>[];
    outcome?: CommandOutcome;
    runs?: 'exit' | 'untilStop';
    stop?: 'confirmed' | 'unconfirmed';
}> | Readonly<{
    kind: 'rejected';
    reason: FacilityReason;
}> | Readonly<{
    kind: 'unknown';
}>;
type StartRequest<P> = Parameters<CommandFacility<P>['start']>[0];
export type CommandScript<P = unknown> = (request: StartRequest<P>) => ScriptedCommandAnswer | Promise<ScriptedCommandAnswer>;
export type ScriptedCommandFacility<P = unknown> = Readonly<{
    durability: 'none';
    facility: CommandFacility<P>;
    calls: readonly StartRequest<P>[];
    stops: readonly Readonly<{
        process: ProcessHandle['process'];
        mode: 'graceful' | 'forced';
        answer: 'confirmed' | 'unconfirmed';
    }>[];
    close(): void;
}>;
export declare function createScriptedCommandFacility<P = unknown>(script: CommandScript<P>): ScriptedCommandFacility<P>;
export {};
```
