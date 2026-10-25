# @omne-harness/tool-cordis-contract 的 API 快照

<!-- omne-contract-api 快照格式 1 -->

> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。

## 入口 `.` · `index.d.ts`

（无）

## 入口 `./cordis` · `cordis.d.ts`

- `ResultPolicyService` · `cordis.d.ts`
- `ToolAccountsService` · `cordis.d.ts`
- `ToolAuthorityFailure` · `cordis.d.ts`
- `ToolBindingsService` · `cordis.d.ts`
- `ToolCatalogService` · `cordis.d.ts`
- `ToolChildrenService` · `cordis.d.ts`
- `ToolClockService` · `cordis.d.ts`
- `ToolCommandsService` · `cordis.d.ts`
- `ToolContributionAuthority` · `cordis.d.ts`
- `ToolContributionAuthorityService` · `cordis.d.ts`
- `ToolDecisionBridgeService` · `cordis.d.ts`
- `ToolEnvironmentService` · `cordis.d.ts`
- `ToolGenerations` · `cordis.d.ts`
- `ToolGenerationsFailure` · `cordis.d.ts`
- `ToolGenerationsService` · `cordis.d.ts`
- `ToolInstanceHostService` · `cordis.d.ts`
- `ToolInstancesService` · `cordis.d.ts`
- `ToolLoadFailure` · `cordis.d.ts`
- `ToolLoadState` · `cordis.d.ts`
- `ToolOffloaderService` · `cordis.d.ts`
- `ToolOutputCustodyService` · `cordis.d.ts`
- `ToolPublication` · `cordis.d.ts`
- `ToolPublicationAuthority` · `cordis.d.ts`
- `ToolPublicationAuthorityService` · `cordis.d.ts`
- `ToolReadsService` · `cordis.d.ts`
- `ToolRegistration` · `cordis.d.ts`
- `ToolRegistrationFailure` · `cordis.d.ts`
- `ToolRegistrationInput` · `cordis.d.ts`
- `ToolResourceResponsesService` · `cordis.d.ts`
- `ToolRuntimeService` · `cordis.d.ts`
- `ToolStartAuthorityService` · `cordis.d.ts`
- `ToolSweepReport` · `cordis.d.ts`
- `ToolUnloadState` · `cordis.d.ts`
- `VerifiedAuthority` · `cordis.d.ts`
- `toolAccountsKey` · `cordis.d.ts`
- `toolBindingsKey` · `cordis.d.ts`
- `toolCatalogKey` · `cordis.d.ts`
- `toolChildrenKey` · `cordis.d.ts`
- `toolClockKey` · `cordis.d.ts`
- `toolCommandsKey` · `cordis.d.ts`
- `toolContributionAuthorityKey` · `cordis.d.ts`
- `toolDecisionsKey` · `cordis.d.ts`
- `toolEnvironmentsKey` · `cordis.d.ts`
- `toolGenerationsKey` · `cordis.d.ts`
- `toolInstanceHostKey` · `cordis.d.ts`
- `toolInstancesKey` · `cordis.d.ts`
- `toolOffloaderKey` · `cordis.d.ts`
- `toolOutputCustodyKey` · `cordis.d.ts`
- `toolPublicationAuthorityKey` · `cordis.d.ts`
- `toolReadsKey` · `cordis.d.ts`
- `toolResourceResponsesKey` · `cordis.d.ts`
- `toolResultPolicyKey` · `cordis.d.ts`
- `toolRuntimeKey` · `cordis.d.ts`
- `toolStartAuthorityKey` · `cordis.d.ts`

## 入口 `./testing` · `testing.d.ts`

- `AnswerModel` · 包 `@omne-harness/tool-contract`
- `AnswerRow` · 包 `@omne-harness/tool-contract`
- `CaseVerdict` · 包 `@omne-harness/tool-contract`
- `ConformanceCase` · 包 `@omne-harness/tool-contract`
- `MemoryToolBindingRegistry` · `testing-bindings.d.ts`
- `MemoryToolRegistrations` · `testing.d.ts`
- `NotApplicable` · 包 `@omne-harness/tool-contract`
- `TOOL_DYNAMICS_CRITERIA` · `testing-bindings.d.ts`
- `ToolBindingGrant` · `testing-bindings.d.ts`
- `ToolBindingRegistryFixture` · `testing-bindings.d.ts`
- `ToolBindingRegistryService` · `testing-bindings.d.ts`
- `ToolDynamicsFixture` · `testing-bindings.d.ts`
- `ToolRegistrationFixture` · `testing.d.ts`
- `ToolRegistrationGrant` · `testing.d.ts`
- `ToolRegistrationService` · `testing.d.ts`
- `createMemoryToolBindingRegistry` · `testing-bindings.d.ts`
- `createMemoryToolRegistrations` · `testing.d.ts`
- `isNotApplicable` · 包 `@omne-harness/tool-contract`
- `memoryToolBindingRegistryFixture` · `testing-bindings.d.ts`
- `memoryToolRegistrationFixture` · `testing.d.ts`
- `registrationAnswers` · `testing.d.ts`
- `runConformanceCase` · 包 `@omne-harness/tool-contract`
- `runToolDynamicsSuite` · `testing-bindings.d.ts`
- `toolBindingRegistryConformance` · `testing-bindings.d.ts`
- `toolRegistrationConformance` · `testing.d.ts`

## 声明文件 `cordis.d.ts`

```ts
import { type Context, Service } from '@deepseek-ai/cordis';
import type { ContentBlock } from '@omne-harness/content-block';
import { type Outcome } from '@omne-harness/operation-result';
import type { Access, TenantId } from '@omne-harness/legal-identity';
import { type DurableEvidence, type SourceLayer, type ToolCallId, type ToolCatalog, type ToolRevision, type ToolRuntime } from '@omne-harness/tool-contract';
import { type ToolDirectory } from '@omne-harness/tool-contract/provider';
import { type ResultPolicy, type ToolAccounts, type ToolAuthority, type ToolBindingKey, type ToolBindingRegistry, type ToolBindingScope, type ToolBindings, type ToolChildren, type ToolClock, type ToolCommands, type ToolDecisionBridge, type ToolEnvironment, type ToolInstanceHost, type ToolLoader, type ToolOffloader, type ToolOutputCustody, type ToolReads, type ToolResourceResponses, type ToolStartAuthority } from '@omne-harness/tool-contract/provider';
export declare abstract class ToolRuntimeService<P, B extends ContentBlock> extends Service implements ToolRuntime<P, B> {
    static readonly provide = "toolRuntime";
    constructor(ctx: Context);
    abstract readonly invoke: ToolRuntime<P, B>['invoke'];
    abstract readonly inspect: ToolRuntime<P, B>['inspect'];
    abstract readonly queries: ToolRuntime<P, B>['queries'];
    abstract readonly commands: ToolRuntime<P, B>['commands'];
    abstract readonly instances: ToolRuntime<P, B>['instances'];
    abstract readonly observation: ToolRuntime<P, B>['observation'];
    abstract readonly content: ToolRuntime<P, B>['content'];
    abstract readonly catalog: ToolRuntime<P, B>['catalog'];
}
export declare const toolRuntimeKey = "toolRuntime";
export declare abstract class ToolCommandsService<P, B extends ContentBlock> extends Service implements ToolCommands<P, B> {
    static readonly provide = "toolCommands";
    constructor(ctx: Context);
    abstract readonly admit: ToolCommands<P, B>['admit'];
    abstract readonly control: ToolCommands<P, B>['control'];
    abstract readonly acceptDecision: ToolCommands<P, B>['acceptDecision'];
    abstract readonly acceptResource: ToolCommands<P, B>['acceptResource'];
    abstract readonly releaseDelivery: ToolCommands<P, B>['releaseDelivery'];
    abstract readonly scanPending: ToolCommands<P, B>['scanPending'];
    abstract readonly loadRecovery: ToolCommands<P, B>['loadRecovery'];
    abstract readonly claim: ToolCommands<P, B>['claim'];
    abstract readonly planPreparation: ToolCommands<P, B>['planPreparation'];
    abstract readonly prepared: ToolCommands<P, B>['prepared'];
    abstract readonly enqueue: ToolCommands<P, B>['enqueue'];
    abstract readonly prepareStart: ToolCommands<P, B>['prepareStart'];
    abstract readonly prepareResume: ToolCommands<P, B>['prepareResume'];
    abstract readonly rejectPending: ToolCommands<P, B>['rejectPending'];
    abstract readonly recordStart: ToolCommands<P, B>['recordStart'];
    abstract readonly preserveProcess: ToolCommands<P, B>['preserveProcess'];
    abstract readonly openWait: ToolCommands<P, B>['openWait'];
    abstract readonly attachRegistration: ToolCommands<P, B>['attachRegistration'];
    abstract readonly attachResource: ToolCommands<P, B>['attachResource'];
    abstract readonly planSuspension: ToolCommands<P, B>['planSuspension'];
    abstract readonly suspend: ToolCommands<P, B>['suspend'];
    abstract readonly preserveResult: ToolCommands<P, B>['preserveResult'];
    abstract readonly recordResponse: ToolCommands<P, B>['recordResponse'];
    abstract readonly closeWait: ToolCommands<P, B>['closeWait'];
    abstract readonly recordControl: ToolCommands<P, B>['recordControl'];
    abstract readonly receiveFacts: ToolCommands<P, B>['receiveFacts'];
    abstract readonly recordFactAcknowledgement: ToolCommands<P, B>['recordFactAcknowledgement'];
    abstract readonly recordScheduling: ToolCommands<P, B>['recordScheduling'];
    abstract readonly recordAccount: ToolCommands<P, B>['recordAccount'];
    abstract readonly planRelease: ToolCommands<P, B>['planRelease'];
    abstract readonly recordRelease: ToolCommands<P, B>['recordRelease'];
    abstract readonly recordLateFact: ToolCommands<P, B>['recordLateFact'];
    abstract readonly recordLateResult: ToolCommands<P, B>['recordLateResult'];
    abstract readonly settleLost: ToolCommands<P, B>['settleLost'];
    abstract readonly recordTask: ToolCommands<P, B>['recordTask'];
}
export declare const toolCommandsKey = "toolCommands";
export declare abstract class ToolBindingsService<P, B extends ContentBlock, E> extends Service implements ToolBindings<P, B, E>, ToolBindingRegistry<P, E, B> {
    static readonly provide = "toolBindings";
    constructor(ctx: Context);
    abstract readonly inspect: ToolBindings<P, B, E>['inspect'];
    abstract readonly resolve: ToolBindings<P, B, E>['resolve'];
    abstract readonly recover: ToolBindings<P, B, E>['recover'];
    abstract readonly register: ToolBindingRegistry<P, E, B>['register'];
    abstract readonly snapshot: ToolBindingRegistry<P, E, B>['snapshot'];
    abstract readonly pins: ToolBindingRegistry<P, E, B>['pins'];
    abstract readonly close: ToolBindingRegistry<P, E, B>['close'];
    abstract readonly reopen: ToolBindingRegistry<P, E, B>['reopen'];
    abstract readonly drain: ToolBindingRegistry<P, E, B>['drain'];
}
export declare const toolBindingsKey = "toolBindings";
export type VerifiedAuthority = ToolAuthority;
export type ToolAuthorityFailure = Readonly<{
    kind: 'denied';
}> | Readonly<{
    kind: 'invalid';
    reason: string;
}> | Readonly<{
    kind: 'unavailable';
    diagnostic: string;
}>;
export interface ToolContributionAuthority<P> {
    verify(authority: ToolAuthority): Outcome<VerifiedAuthority, ToolAuthorityFailure>;
    admits(access: Access<P>, layer: SourceLayer): Outcome<void, Exclude<ToolAuthorityFailure, {
        kind: 'invalid';
    }>>;
}
export declare abstract class ToolContributionAuthorityService<P> extends Service implements ToolContributionAuthority<P> {
    static readonly provide = "toolContributionAuthority";
    constructor(ctx: Context);
    abstract readonly verify: ToolContributionAuthority<P>['verify'];
    abstract readonly admits: ToolContributionAuthority<P>['admits'];
}
export declare const toolContributionAuthorityKey = "toolContributionAuthority";
export type ToolLoadFailure = Readonly<{
    kind: 'denied';
}> | Readonly<{
    kind: 'invalid';
    reason: string;
}> | Readonly<{
    kind: 'missing';
    evidence: DurableEvidence;
}> | Readonly<{
    kind: 'rejected';
    evidence: DurableEvidence;
}> | Readonly<{
    kind: 'unavailable';
    diagnostic: string;
}> | Readonly<{
    kind: 'conflict';
}> | Readonly<{
    kind: 'draining';
}>;
export type ToolLoadState = Readonly<{
    key: ToolBindingKey;
    state: 'loaded' | 'recognized';
}>;
export type ToolUnloadState = Readonly<{
    state: 'retained' | 'draining' | 'released';
}>;
export type ToolSweepReport = Readonly<{
    reloaded: readonly ToolBindingKey[];
    unloaded: readonly ToolBindingKey[];
}>;
export type ToolGenerationsFailure = Readonly<{
    kind: 'unknown-key';
}> | Readonly<{
    kind: 'unavailable';
    diagnostic: string;
}>;
export interface ToolGenerations<P, E, B extends ContentBlock> {
    ensureLoaded(input: Readonly<{
        authority: ToolAuthority;
        access: ToolBindingScope<P>;
    }>): Promise<Outcome<ToolLoadState, ToolLoadFailure>>;
    unload(input: Readonly<{
        key: ToolBindingKey;
    }>): Promise<Outcome<ToolUnloadState, ToolGenerationsFailure>>;
    sweep(): Promise<Outcome<ToolSweepReport, Extract<ToolGenerationsFailure, {
        kind: 'unavailable';
    }>>>;
    loaderFor(authority: ToolAuthority): ToolLoader<P, E, B>;
}
export declare abstract class ToolGenerationsService<P, E, B extends ContentBlock> extends Service implements ToolGenerations<P, E, B> {
    static readonly provide = "toolGenerations";
    constructor(ctx: Context);
    abstract readonly ensureLoaded: ToolGenerations<P, E, B>['ensureLoaded'];
    abstract readonly unload: ToolGenerations<P, E, B>['unload'];
    abstract readonly sweep: ToolGenerations<P, E, B>['sweep'];
    abstract readonly loaderFor: ToolGenerations<P, E, B>['loaderFor'];
}
export declare const toolGenerationsKey = "toolGenerations";
export declare abstract class ToolEnvironmentService<P, E> extends Service implements ToolEnvironment<P, E> {
    static readonly provide = "toolEnvironments";
    constructor(ctx: Context);
    abstract readonly prepare: ToolEnvironment<P, E>['prepare'];
    abstract readonly inspectPreparation: ToolEnvironment<P, E>['inspectPreparation'];
    abstract readonly release: ToolEnvironment<P, E>['release'];
    abstract readonly inspectRelease: ToolEnvironment<P, E>['inspectRelease'];
}
export declare const toolEnvironmentsKey = "toolEnvironments";
export declare abstract class ToolDecisionBridgeService<P> extends Service implements ToolDecisionBridge<P> {
    static readonly provide = "toolDecisions";
    constructor(ctx: Context);
    abstract readonly inspectOperation: ToolDecisionBridge<P>['inspectOperation'];
    abstract readonly ensure: ToolDecisionBridge<P>['ensure'];
    abstract readonly inspect: ToolDecisionBridge<P>['inspect'];
    abstract readonly invalidate: ToolDecisionBridge<P>['invalidate'];
    abstract readonly resolve: ToolDecisionBridge<P>['resolve'];
}
export declare const toolDecisionsKey = "toolDecisions";
export type ToolPublication = Extract<Awaited<ReturnType<ToolInstanceHost<never>['publish']>>, {
    ok: unknown;
}>['ok'];
export type ToolRegistrationInput<P> = Readonly<{
    publication: Parameters<ToolInstanceHost<P>['publish']>;
    authority: DurableEvidence;
}>;
export type ToolRegistrationFailure = Readonly<{
    kind: 'denied' | 'stale-publication' | 'conflict';
}> | Readonly<{
    kind: 'invalid';
    reason: string;
}> | Readonly<{
    kind: 'unavailable';
    diagnostic: string;
}>;
export type ToolRegistration = Readonly<{
    receipt: ToolPublication;
    release(): Promise<Readonly<{
        removed: boolean;
    }>>;
}>;
export interface ToolPublicationAuthority<P> {
    check(input: ToolRegistrationInput<P>): Outcome<void, ToolRegistrationFailure>;
}
export declare abstract class ToolPublicationAuthorityService<P> extends Service implements ToolPublicationAuthority<P> {
    static readonly provide = "toolPublicationAuthority";
    constructor(ctx: Context);
    abstract readonly check: ToolPublicationAuthority<P>['check'];
}
export declare const toolPublicationAuthorityKey = "toolPublicationAuthority";
export declare class ToolInstancesService<P> extends Service implements ToolDirectory<P> {
    static readonly provide = "toolInstances";
    constructor(ctx: Context, _authority: ToolPublicationAuthority<P>);
    readonly connect: ToolDirectory<P>['connect'];
    register(_input: ToolRegistrationInput<P>): Promise<Outcome<ToolRegistration, ToolRegistrationFailure>>;
}
export declare const toolInstancesKey = "toolInstances";
export declare abstract class ToolInstanceHostService<P> extends Service implements ToolInstanceHost<P> {
    static readonly provide = "toolInstanceHost";
    constructor(ctx: Context);
    abstract readonly install: ToolInstanceHost<P>['install'];
    abstract readonly schedule: ToolInstanceHost<P>['schedule'];
    abstract readonly publish: ToolInstanceHost<P>['publish'];
    abstract readonly withdraw: ToolInstanceHost<P>['withdraw'];
    abstract readonly directory: ToolInstanceHost<P>['directory'];
}
export declare const toolInstanceHostKey = "toolInstanceHost";
export declare abstract class ToolClockService extends Service implements ToolClock {
    static readonly provide = "toolClock";
    constructor(ctx: Context);
    abstract readonly now: ToolClock['now'];
    abstract readonly begin: ToolClock['begin'];
    abstract readonly elapsed: ToolClock['elapsed'];
    abstract readonly waitUntil: ToolClock['waitUntil'];
}
export declare const toolClockKey = "toolClock";
export declare abstract class ResultPolicyService<B extends ContentBlock> extends Service implements ResultPolicy<B> {
    static readonly provide = "toolResultPolicy";
    constructor(ctx: Context);
    abstract readonly adoption: ResultPolicy<B>['adoption'];
    abstract readonly judge: ResultPolicy<B>['judge'];
    abstract readonly judgeResult: ResultPolicy<B>['judgeResult'];
}
export declare const toolResultPolicyKey = "toolResultPolicy";
export declare abstract class ToolReadsService<P, B extends ContentBlock> extends Service implements ToolReads<P, B> {
    static readonly provide = "toolReads";
    constructor(ctx: Context);
    abstract readonly lookup: ToolReads<P, B>['lookup'];
    abstract readonly operation: ToolReads<P, B>['operation'];
    abstract readonly result: ToolReads<P, B>['result'];
    abstract readonly process: ToolReads<P, B>['process'];
    abstract readonly wait: ToolReads<P, B>['wait'];
    abstract readonly diagnostics: ToolReads<P, B>['diagnostics'];
    abstract readonly account: ToolReads<P, B>['account'];
    abstract readonly content: ToolReads<P, B>['content'];
}
export declare const toolReadsKey = "toolReads";
export declare abstract class ToolCatalogService<P> extends Service implements ToolCatalog<P> {
    static readonly provide = "toolCatalog";
    constructor(ctx: Context);
    abstract readonly inspect: ToolCatalog<P>['inspect'];
    abstract readonly usage: ToolCatalog<P>['usage'];
    abstract readonly search: ToolCatalog<P>['search'];
}
export declare const toolCatalogKey = "toolCatalog";
export declare abstract class ToolStartAuthorityService<P> extends Service implements ToolStartAuthority<P> {
    static readonly provide = "toolStartAuthority";
    constructor(ctx: Context);
    abstract readonly exclude: ToolStartAuthority<P>['exclude'];
    abstract readonly prepare: ToolStartAuthority<P>['prepare'];
    abstract readonly consume: ToolStartAuthority<P>['consume'];
    abstract readonly inspect: ToolStartAuthority<P>['inspect'];
    abstract readonly invalidate: ToolStartAuthority<P>['invalidate'];
}
export declare const toolStartAuthorityKey = "toolStartAuthority";
export declare abstract class ToolResourceResponsesService<P> extends Service implements ToolResourceResponses<P> {
    static readonly provide = "toolResourceResponses";
    constructor(ctx: Context);
    abstract readonly inspectOperation: ToolResourceResponses<P>['inspectOperation'];
    abstract readonly ensure: ToolResourceResponses<P>['ensure'];
    abstract readonly inspect: ToolResourceResponses<P>['inspect'];
    abstract readonly expire: ToolResourceResponses<P>['expire'];
    abstract readonly invalidate: ToolResourceResponses<P>['invalidate'];
    abstract readonly resolve: ToolResourceResponses<P>['resolve'];
}
export declare const toolResourceResponsesKey = "toolResourceResponses";
export declare abstract class ToolOutputCustodyService<P> extends Service implements ToolOutputCustody<P> {
    static readonly provide = "toolOutputCustody";
    constructor(ctx: Context);
    abstract readonly preserve: ToolOutputCustody<P>['preserve'];
    abstract readonly inspect: ToolOutputCustody<P>['inspect'];
    abstract readonly retainResult: ToolOutputCustody<P>['retainResult'];
}
export declare const toolOutputCustodyKey = "toolOutputCustody";
export declare abstract class ToolChildrenService<P> extends Service implements ToolChildren<P> {
    static readonly provide = "toolChildren";
    constructor(ctx: Context);
    abstract readonly reserve: ToolChildren<P>['reserve'];
    abstract readonly admitted: ToolChildren<P>['admitted'];
    abstract readonly retain: ToolChildren<P>['retain'];
    abstract readonly list: ToolChildren<P>['list'];
    abstract readonly close: ToolChildren<P>['close'];
    abstract readonly closure: ToolChildren<P>['closure'];
    abstract readonly confirmBarrier: ToolChildren<P>['confirmBarrier'];
    abstract readonly finish: ToolChildren<P>['finish'];
}
export declare const toolChildrenKey = "toolChildren";
export declare abstract class ToolAccountsService<P> extends Service implements ToolAccounts<P> {
    static readonly provide = "toolAccounts";
    constructor(ctx: Context);
    abstract readonly list: ToolAccounts<P>['list'];
}
export declare const toolAccountsKey = "toolAccounts";
export declare abstract class ToolOffloaderService<P, B extends ContentBlock> extends Service implements ToolOffloader<P, B> {
    static readonly provide = "toolOffloader";
    constructor(ctx: Context);
    abstract readonly offload: ToolOffloader<P, B>['offload'];
}
export declare const toolOffloaderKey = "toolOffloader";
declare module '@deepseek-ai/cordis' {
    interface Context {
        toolRuntime: ToolRuntimeService<unknown, ContentBlock>;
        toolCommands: ToolCommandsService<unknown, ContentBlock>;
        toolBindings: ToolBindingsService<unknown, ContentBlock, unknown>;
        toolContributionAuthority: ToolContributionAuthorityService<unknown>;
        toolGenerations: ToolGenerationsService<unknown, unknown, ContentBlock>;
        toolEnvironments: ToolEnvironmentService<unknown, unknown>;
        toolDecisions: ToolDecisionBridgeService<unknown>;
        toolInstances: ToolInstancesService<unknown>;
        toolPublicationAuthority: ToolPublicationAuthorityService<unknown>;
        toolInstanceHost: ToolInstanceHostService<unknown>;
        toolClock: ToolClockService;
        toolResultPolicy: ResultPolicyService<ContentBlock>;
        toolReads: ToolReadsService<unknown, ContentBlock>;
        toolCatalog: ToolCatalogService<unknown>;
        toolStartAuthority: ToolStartAuthorityService<unknown>;
        toolResourceResponses: ToolResourceResponsesService<unknown>;
        toolOutputCustody: ToolOutputCustodyService<unknown>;
        toolChildren: ToolChildrenService<unknown>;
        toolAccounts: ToolAccountsService<unknown>;
        toolOffloader: ToolOffloaderService<unknown, ContentBlock>;
    }
    interface Events {
        'tool-cordis-contract/call-changed'(tenant: TenantId, call: ToolCallId, revision: ToolRevision): void;
        'tool-cordis-contract/binding-changed'(key: ToolBindingKey, change: 'registered' | 'draining' | 'released'): void;
    }
}
```

## 声明文件 `index.d.ts`

```ts
export {};
```

## 声明文件 `testing-bindings.d.ts`

```ts
import type { ContentBlock } from '@omne-harness/content-block';
import { type Outcome } from '@omne-harness/operation-result';
import { type Access } from '@omne-harness/tool-contract';
import { type ToolAuthority, type ToolBindingRegistry, type ToolLoadedRegistration } from '@omne-harness/tool-contract/provider';
import { type ConformanceCase } from '@omne-harness/tool-contract/testing';
import type { ToolAuthorityFailure } from './cordis.ts';
export type ToolBindingRegistryService<P> = ToolBindingRegistry<P, unknown, ContentBlock>;
export interface ToolBindingRegistryFixture<P> {
    readonly registry: ToolBindingRegistryService<P>;
    readonly access: Access<P>;
    readonly authority: ToolAuthority;
    readonly otherAuthority?: ToolAuthority;
    readonly foreignAuthority?: ToolAuthority;
    loaded(authority: ToolAuthority, digest: string): ToolLoadedRegistration<unknown, ContentBlock>;
    asFiber?<T>(fiber: string, work: () => T): T;
    endFiber?(fiber: string): Promise<void>;
}
export declare function toolBindingRegistryConformance<P>(): readonly ConformanceCase<ToolBindingRegistryFixture<P>>[];
export interface MemoryToolBindingRegistry<P> extends ToolBindingRegistryService<P> {
    readonly durability: 'none';
    readonly controls: Readonly<{
        asFiber<T>(fiber: string, work: () => T): T;
        endFiber(fiber: string): Promise<void>;
        verify(authority: ToolAuthority): Outcome<ToolAuthority, ToolAuthorityFailure>;
    }>;
}
export type ToolBindingGrant = Readonly<{
    authority: ToolAuthority;
    registrants: readonly Access<unknown>['tenant'][] | null;
}>;
export declare function createMemoryToolBindingRegistry<P>(grants: readonly ToolBindingGrant[]): MemoryToolBindingRegistry<P>;
export declare function memoryToolBindingRegistryFixture(): ToolBindingRegistryFixture<string>;
export interface ToolDynamicsFixture {
    readonly context?: unknown;
    readonly generations?: unknown;
    readonly residency?: unknown;
}
export declare const TOOL_DYNAMICS_CRITERIA: readonly [
    'the fiber uid of toolRuntime, toolCommands, toolReads and toolInstances is unchanged across a load',
    'same-key recognition and conflict; release withdraws only its own token; a late release leaves the successor',
    'unload with a referencing session and no same-shape substitute returns retained and the contribution stays live',
    'unload without references or in-flight calls goes draining to released; resolve then answers unavailable; the fiber is DISPOSED',
    'old and new versions coexist; a different-shape new version serves new sessions only',
    'a refresh during a Run routes later calls to a same-shape new implementation; the recorded basis is unchanged',
    'a different-shape new version keeps the old one; the session stays usable',
    'a sudden fiber removal gives known-unavailable; in-flight calls recover as unknown; a reload continues at the next adoption point',
    'no same-shape contribution, missing package and a different-shape winner: the next adoption point freezes once; repeats are no-ops',
    'unrelated capabilities see zero failures throughout; P16 directory and Catalog absence semantics are unchanged'
];
export declare function runToolDynamicsSuite(): readonly ConformanceCase<ToolDynamicsFixture>[];
```

## 声明文件 `testing.d.ts`

```ts
import { type Outcome } from '@omne-harness/operation-result';
import type { TenantId } from '@omne-harness/legal-identity';
import { type DurableEvidence } from '@omne-harness/tool-contract';
import { type ConformanceCase } from '@omne-harness/tool-contract/testing';
import type { ToolRegistration, ToolRegistrationFailure, ToolRegistrationInput } from './cordis.ts';
export type { AnswerModel, AnswerRow, ConformanceCase } from '@omne-harness/tool-contract/testing';
export { NotApplicable, isNotApplicable, runConformanceCase, type CaseVerdict, } from '@omne-harness/tool-contract/testing';
export { TOOL_DYNAMICS_CRITERIA, createMemoryToolBindingRegistry, memoryToolBindingRegistryFixture, runToolDynamicsSuite, toolBindingRegistryConformance, type MemoryToolBindingRegistry, type ToolBindingGrant, type ToolBindingRegistryFixture, type ToolBindingRegistryService, type ToolDynamicsFixture, } from './testing-bindings.ts';
export interface ToolRegistrationService<P> {
    register(input: ToolRegistrationInput<P>): Promise<Outcome<ToolRegistration, ToolRegistrationFailure>>;
}
export interface ToolRegistrationFixture<P> {
    readonly service: ToolRegistrationService<P>;
    readonly tenant: TenantId;
    readonly authority: DurableEvidence;
    readonly renewedAuthority?: DurableEvidence;
    readonly otherTenant?: TenantId;
    readonly otherAuthority?: DurableEvidence;
    readonly quietMs?: number;
    asFiber?<T>(fiber: string, work: () => Promise<T>): Promise<T>;
    endFiber?(fiber: string): Promise<void>;
    refuseCheck?(failure: ToolRegistrationFailure | null): void;
    listing?(): readonly string[];
    checkedAgainst?(): readonly (readonly string[])[];
}
export declare const registrationAnswers: {
    readonly register: {
        readonly clause: 'IC-3';
        readonly progress: readonly [
        ];
    };
};
export declare function toolRegistrationConformance<P>(): readonly ConformanceCase<ToolRegistrationFixture<P>>[];
export interface MemoryToolRegistrations<P> extends ToolRegistrationService<P> {
    readonly durability: 'none';
    readonly controls: Readonly<{
        asFiber<T>(fiber: string, work: () => Promise<T>): Promise<T>;
        endFiber(fiber: string): Promise<void>;
        refuseCheck(failure: ToolRegistrationFailure | null): void;
        listing(): readonly string[];
        checkedAgainst(): readonly (readonly string[])[];
    }>;
}
export type ToolRegistrationGrant = Readonly<{
    authority: DurableEvidence;
    tenant: TenantId;
}>;
export declare function createMemoryToolRegistrations<P>(grants?: readonly ToolRegistrationGrant[]): MemoryToolRegistrations<P>;
export declare function memoryToolRegistrationFixture(): ToolRegistrationFixture<string>;
```
