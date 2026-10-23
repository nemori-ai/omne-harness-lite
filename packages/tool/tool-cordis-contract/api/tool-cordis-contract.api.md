# @omne-harness/tool-cordis-contract 的 API 快照

> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。

## 入口 `.`

（无）

## 入口 `./cordis`

### `ResultPolicyService`

```ts
abstract class ResultPolicyService<B extends ContentBlock> extends Service implements ResultPolicy<B> {
    static readonly provide = "toolResultPolicy";
    constructor(ctx: Context);
    abstract readonly adoption: ResultPolicy<B>['adoption'];
    abstract readonly judge: ResultPolicy<B>['judge'];
    abstract readonly judgeResult: ResultPolicy<B>['judgeResult'];
}
```

### `ToolAccountsService`

```ts
abstract class ToolAccountsService<P> extends Service implements ToolAccounts<P> {
    static readonly provide = "toolAccounts";
    constructor(ctx: Context);
    abstract readonly list: ToolAccounts<P>['list'];
}
```

### `ToolBindingsService`

```ts
abstract class ToolBindingsService<P, B extends ContentBlock, E> extends Service implements ToolBindings<P, B, E>, ToolBindingRegistry<P, E, B> {
    static readonly provide = "toolBindings";
    constructor(ctx: Context);
    abstract readonly inspect: ToolBindings<P, B, E>['inspect'];
    abstract readonly resolve: ToolBindings<P, B, E>['resolve'];
    abstract readonly recover: ToolBindings<P, B, E>['recover'];
    abstract readonly register: ToolBindingRegistry<P, E, B>['register'];
}
```

### `ToolCatalogService`

```ts
abstract class ToolCatalogService<P> extends Service implements ToolCatalog<P> {
    static readonly provide = "toolCatalog";
    constructor(ctx: Context);
    abstract readonly inspect: ToolCatalog<P>['inspect'];
    abstract readonly usage: ToolCatalog<P>['usage'];
    abstract readonly search: ToolCatalog<P>['search'];
}
```

### `ToolChildrenService`

```ts
abstract class ToolChildrenService<P> extends Service implements ToolChildren<P> {
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
```

### `ToolClockService`

```ts
abstract class ToolClockService extends Service implements ToolClock {
    static readonly provide = "toolClock";
    constructor(ctx: Context);
    abstract readonly now: ToolClock['now'];
    abstract readonly begin: ToolClock['begin'];
    abstract readonly elapsed: ToolClock['elapsed'];
    abstract readonly waitUntil: ToolClock['waitUntil'];
}
```

### `ToolCommandsService`

```ts
abstract class ToolCommandsService<P, B extends ContentBlock> extends Service implements ToolCommands<P, B> {
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
```

### `ToolDecisionBridgeService`

```ts
abstract class ToolDecisionBridgeService<P> extends Service implements ToolDecisionBridge<P> {
    static readonly provide = "toolDecisions";
    constructor(ctx: Context);
    abstract readonly inspectOperation: ToolDecisionBridge<P>['inspectOperation'];
    abstract readonly ensure: ToolDecisionBridge<P>['ensure'];
    abstract readonly inspect: ToolDecisionBridge<P>['inspect'];
    abstract readonly invalidate: ToolDecisionBridge<P>['invalidate'];
    abstract readonly resolve: ToolDecisionBridge<P>['resolve'];
}
```

### `ToolEnvironmentService`

```ts
abstract class ToolEnvironmentService<P, E> extends Service implements ToolEnvironment<P, E> {
    static readonly provide = "toolEnvironments";
    constructor(ctx: Context);
    abstract readonly prepare: ToolEnvironment<P, E>['prepare'];
    abstract readonly inspectPreparation: ToolEnvironment<P, E>['inspectPreparation'];
    abstract readonly release: ToolEnvironment<P, E>['release'];
    abstract readonly inspectRelease: ToolEnvironment<P, E>['inspectRelease'];
}
```

### `ToolInstanceHostService`

```ts
abstract class ToolInstanceHostService<P> extends Service implements ToolInstanceHost<P> {
    static readonly provide = "toolInstanceHost";
    constructor(ctx: Context);
    abstract readonly install: ToolInstanceHost<P>['install'];
    abstract readonly schedule: ToolInstanceHost<P>['schedule'];
    abstract readonly publish: ToolInstanceHost<P>['publish'];
    abstract readonly withdraw: ToolInstanceHost<P>['withdraw'];
    abstract readonly directory: ToolInstanceHost<P>['directory'];
}
```

### `ToolInstancesService`

```ts
class ToolInstancesService<P> extends Service implements ToolDirectory<P> {
    static readonly provide = "toolInstances";
    constructor(ctx: Context, _authority: ToolPublicationAuthority<P>);
    readonly connect: ToolDirectory<P>['connect'];
    register(_input: ToolRegistrationInput<P>): Promise<Outcome<ToolRegistration, ToolRegistrationFailure>>;
}
```

### `ToolOffloaderService`

```ts
abstract class ToolOffloaderService<P, B extends ContentBlock> extends Service implements ToolOffloader<P, B> {
    static readonly provide = "toolOffloader";
    constructor(ctx: Context);
    abstract readonly offload: ToolOffloader<P, B>['offload'];
}
```

### `ToolOutputCustodyService`

```ts
abstract class ToolOutputCustodyService<P> extends Service implements ToolOutputCustody<P> {
    static readonly provide = "toolOutputCustody";
    constructor(ctx: Context);
    abstract readonly preserve: ToolOutputCustody<P>['preserve'];
    abstract readonly inspect: ToolOutputCustody<P>['inspect'];
    abstract readonly retainResult: ToolOutputCustody<P>['retainResult'];
}
```

### `ToolPublication`

```ts
type ToolPublication = Extract<Awaited<ReturnType<ToolInstanceHost<never>['publish']>>, {
    ok: unknown;
}>['ok'];
```

### `ToolPublicationAuthority`

```ts
interface ToolPublicationAuthority<P> {
    check(input: ToolRegistrationInput<P>): Outcome<void, ToolRegistrationFailure>;
}
```

### `ToolPublicationAuthorityService`

```ts
abstract class ToolPublicationAuthorityService<P> extends Service implements ToolPublicationAuthority<P> {
    static readonly provide = "toolPublicationAuthority";
    constructor(ctx: Context);
    abstract readonly check: ToolPublicationAuthority<P>['check'];
}
```

### `ToolReadsService`

```ts
abstract class ToolReadsService<P, B extends ContentBlock> extends Service implements ToolReads<P, B> {
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
```

### `ToolRegistration`

```ts
type ToolRegistration = Readonly<{
    receipt: ToolPublication;
    release(): Promise<Readonly<{
        removed: boolean;
    }>>;
}>;
```

### `ToolRegistrationFailure`

```ts
type ToolRegistrationFailure = Readonly<{
    kind: 'denied' | 'stale-publication' | 'conflict';
}> | Readonly<{
    kind: 'invalid';
    reason: string;
}> | Readonly<{
    kind: 'unavailable';
    diagnostic: string;
}>;
```

### `ToolRegistrationInput`

```ts
type ToolRegistrationInput<P> = Readonly<{
    publication: Parameters<ToolInstanceHost<P>['publish']>;
    authority: DurableEvidence;
}>;
```

### `ToolResourceResponsesService`

```ts
abstract class ToolResourceResponsesService<P> extends Service implements ToolResourceResponses<P> {
    static readonly provide = "toolResourceResponses";
    constructor(ctx: Context);
    abstract readonly inspectOperation: ToolResourceResponses<P>['inspectOperation'];
    abstract readonly ensure: ToolResourceResponses<P>['ensure'];
    abstract readonly inspect: ToolResourceResponses<P>['inspect'];
    abstract readonly expire: ToolResourceResponses<P>['expire'];
    abstract readonly invalidate: ToolResourceResponses<P>['invalidate'];
    abstract readonly resolve: ToolResourceResponses<P>['resolve'];
}
```

### `ToolRuntimeService`

```ts
abstract class ToolRuntimeService<P, B extends ContentBlock> extends Service implements ToolRuntime<P, B> {
    static readonly provide = "toolRuntime";
    constructor(ctx: Context);
    abstract readonly invoke: ToolRuntime<P, B>['invoke'];
    abstract readonly inspect: ToolRuntime<P, B>['inspect'];
    abstract readonly queries: ToolRuntime<P, B>['queries'];
    abstract readonly commands: ToolRuntime<P, B>['commands'];
    abstract readonly instances: ToolRuntime<P, B>['instances'];
    abstract readonly content: ToolRuntime<P, B>['content'];
    abstract readonly catalog: ToolRuntime<P, B>['catalog'];
}
```

### `ToolStartAuthorityService`

```ts
abstract class ToolStartAuthorityService<P> extends Service implements ToolStartAuthority<P> {
    static readonly provide = "toolStartAuthority";
    constructor(ctx: Context);
    abstract readonly exclude: ToolStartAuthority<P>['exclude'];
    abstract readonly prepare: ToolStartAuthority<P>['prepare'];
    abstract readonly consume: ToolStartAuthority<P>['consume'];
    abstract readonly inspect: ToolStartAuthority<P>['inspect'];
    abstract readonly invalidate: ToolStartAuthority<P>['invalidate'];
}
```

### `toolAccountsKey`

```ts
const toolAccountsKey = "toolAccounts";
```

### `toolBindingsKey`

```ts
const toolBindingsKey = "toolBindings";
```

### `toolCatalogKey`

```ts
const toolCatalogKey = "toolCatalog";
```

### `toolChildrenKey`

```ts
const toolChildrenKey = "toolChildren";
```

### `toolClockKey`

```ts
const toolClockKey = "toolClock";
```

### `toolCommandsKey`

```ts
const toolCommandsKey = "toolCommands";
```

### `toolDecisionsKey`

```ts
const toolDecisionsKey = "toolDecisions";
```

### `toolEnvironmentsKey`

```ts
const toolEnvironmentsKey = "toolEnvironments";
```

### `toolInstanceHostKey`

```ts
const toolInstanceHostKey = "toolInstanceHost";
```

### `toolInstancesKey`

```ts
const toolInstancesKey = "toolInstances";
```

### `toolOffloaderKey`

```ts
const toolOffloaderKey = "toolOffloader";
```

### `toolOutputCustodyKey`

```ts
const toolOutputCustodyKey = "toolOutputCustody";
```

### `toolPublicationAuthorityKey`

```ts
const toolPublicationAuthorityKey = "toolPublicationAuthority";
```

### `toolReadsKey`

```ts
const toolReadsKey = "toolReads";
```

### `toolResourceResponsesKey`

```ts
const toolResourceResponsesKey = "toolResourceResponses";
```

### `toolResultPolicyKey`

```ts
const toolResultPolicyKey = "toolResultPolicy";
```

### `toolRuntimeKey`

```ts
const toolRuntimeKey = "toolRuntime";
```

### `toolStartAuthorityKey`

```ts
const toolStartAuthorityKey = "toolStartAuthority";
```

## 入口 `./testing`

### `AnswerModel`

```ts
export { AnswerModel } from '@omne-harness/tool-contract';
```

### `AnswerRow`

```ts
export { AnswerRow } from '@omne-harness/tool-contract';
```

### `CaseVerdict`

```ts
export { CaseVerdict } from '@omne-harness/tool-contract';
```

### `ConformanceCase`

```ts
export { ConformanceCase } from '@omne-harness/tool-contract';
```

### `MemoryToolRegistrations`

```ts
interface MemoryToolRegistrations<P> extends ToolRegistrationService<P> {
    readonly durability: 'none';
    readonly controls: Readonly<{
        asFiber<T>(fiber: string, work: () => Promise<T>): Promise<T>;
        endFiber(fiber: string): Promise<void>;
        refuseCheck(failure: ToolRegistrationFailure | null): void;
        listing(): readonly string[];
        checkedAgainst(): readonly (readonly string[])[];
    }>;
}
```

### `NotApplicable`

```ts
export { NotApplicable } from '@omne-harness/tool-contract';
```

### `ToolRegistrationFixture`

```ts
interface ToolRegistrationFixture<P> {
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
```

### `ToolRegistrationGrant`

```ts
type ToolRegistrationGrant = Readonly<{
    authority: DurableEvidence;
    tenant: TenantId;
}>;
```

### `ToolRegistrationService`

```ts
interface ToolRegistrationService<P> {
    register(input: ToolRegistrationInput<P>): Promise<Outcome<ToolRegistration, ToolRegistrationFailure>>;
}
```

### `createMemoryToolRegistrations`

```ts
function createMemoryToolRegistrations<P>(grants?: readonly ToolRegistrationGrant[]): MemoryToolRegistrations<P>;
```

### `isNotApplicable`

```ts
export { isNotApplicable } from '@omne-harness/tool-contract';
```

### `memoryToolRegistrationFixture`

```ts
function memoryToolRegistrationFixture(): ToolRegistrationFixture<string>;
```

### `registrationAnswers`

```ts
const registrationAnswers: {
    readonly register: {
        readonly clause: 'IC-3';
        readonly progress: readonly [
        ];
    };
};
```

### `runConformanceCase`

```ts
export { runConformanceCase } from '@omne-harness/tool-contract';
```

### `toolRegistrationConformance`

```ts
function toolRegistrationConformance<P>(): readonly ConformanceCase<ToolRegistrationFixture<P>>[];
```

## 内部引用

（无）

## 模块扩充 `@deepseek-ai/cordis`

### `Context`

```ts
interface Context {
    toolRuntime: ToolRuntimeService<unknown, ContentBlock>;
    toolCommands: ToolCommandsService<unknown, ContentBlock>;
    toolBindings: ToolBindingsService<unknown, ContentBlock, unknown>;
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
```

### `Events`

```ts
interface Events {
    'tool-cordis-contract/call-changed'(tenant: TenantId, call: ToolCallId, revision: ToolRevision): void;
}
```
