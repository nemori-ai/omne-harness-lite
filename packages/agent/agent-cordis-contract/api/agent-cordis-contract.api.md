# @omne-harness/agent-cordis-contract 的 API 快照

> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。

## 入口 `.`

### `AgentLocalRoute`

```ts
type AgentLocalRoute<P> = Readonly<{
    runtime: AgentRuntime<P>;
    observation: AgentHandle<P>;
}>;
```

### `AgentRegistrationInput`

```ts
type AgentRegistrationInput<P> = Parameters<AgentInstanceHost<P>['publish']>[0];
```

### `AgentWithdrawalInput`

```ts
type AgentWithdrawalInput<P> = Parameters<AgentInstanceHost<P>['withdraw']>[0];
```

## 入口 `./cordis`

### `ActionAdmissionService`

```ts
abstract class ActionAdmissionService<P> extends Service implements ActionAdmission<P> {
    static readonly provide = "agentActionAdmission";
    constructor(ctx: Context);
    abstract readonly admit: ActionAdmission<P>['admit'];
}
```

### `AgentAccessCheckService`

```ts
abstract class AgentAccessCheckService<P> extends Service implements AgentAccessCheck<P> {
    static readonly provide = "agentAccessCheck";
    constructor(ctx: Context);
    abstract readonly check: AgentAccessCheck<P>['check'];
}
```

### `AgentAdoptionsService`

```ts
abstract class AgentAdoptionsService<P> extends Service implements AgentAdoptions<P> {
    static readonly provide = "agentAdoptions";
    constructor(ctx: Context);
    abstract readonly resolve: AgentAdoptions<P>['resolve'];
    abstract readonly handover: AgentAdoptions<P>['handover'];
}
```

### `AgentClockService`

```ts
abstract class AgentClockService extends Service implements AgentClock {
    static readonly provide = "agentClock";
    constructor(ctx: Context);
    abstract readonly now: AgentClock['now'];
    abstract readonly waitUntil: AgentClock['waitUntil'];
}
```

### `AgentExecutionRecoveryService`

```ts
abstract class AgentExecutionRecoveryService<P> extends Service implements AgentExecutionRecovery<P> {
    static readonly provide = "agentExecutionRecovery";
    constructor(ctx: Context);
    abstract readonly query: AgentExecutionRecovery<P>['query'];
    abstract readonly load: AgentExecutionRecovery<P>['load'];
    abstract readonly reconcile: AgentExecutionRecovery<P>['reconcile'];
    abstract readonly detach: AgentExecutionRecovery<P>['detach'];
}
```

### `AgentInstanceHostService`

```ts
abstract class AgentInstanceHostService<P> extends Service implements AgentInstanceHost<P> {
    static readonly provide = "agentInstanceHost";
    constructor(ctx: Context);
    abstract readonly reserve: AgentInstanceHost<P>['reserve'];
    abstract readonly publish: AgentInstanceHost<P>['publish'];
    abstract readonly withdraw: AgentInstanceHost<P>['withdraw'];
    abstract readonly directory: AgentInstanceHost<P>['directory'];
    abstract route(tenant: TenantId, instance: AgentInstanceId): AgentLocalRoute<P> | null;
}
```

### `AgentInstancesService`

```ts
class AgentInstancesService<P> extends Service implements AgentDirectory<P> {
    static readonly provide = "agentInstances";
    readonly resolve: AgentDirectory<P>['resolve'];
    readonly connect: AgentDirectory<P>['connect'];
    readonly register: (input: AgentRegistrationInput<P>) => Reply<Registration>;
    readonly withdraw: (input: AgentWithdrawalInput<P>) => Reply<Registration>;
    constructor(ctx: Context, authority: AgentPublicationAuthority<P>);
}
```

### `AgentJournalService`

```ts
abstract class AgentJournalService<P> extends Service implements AgentJournal<P> {
    static readonly provide = "agentJournal";
    constructor(ctx: Context);
    abstract readonly open: AgentJournal<P>['open'];
    abstract readonly attach: AgentJournal<P>['attach'];
    abstract readonly detach: AgentJournal<P>['detach'];
    abstract readonly commit: AgentJournal<P>['commit'];
    abstract readonly submit: AgentJournal<P>['submit'];
    abstract readonly control: AgentJournal<P>['control'];
    abstract readonly acknowledge: AgentJournal<P>['acknowledge'];
    abstract readonly recordResult: AgentJournal<P>['recordResult'];
    abstract readonly recordControl: AgentJournal<P>['recordControl'];
    abstract readonly tryFinish: AgentJournal<P>['tryFinish'];
    abstract readonly recordTerminalObservation: AgentJournal<P>['recordTerminalObservation'];
    abstract readonly load: AgentJournal<P>['load'];
    abstract readonly inputs: AgentJournal<P>['inputs'];
    abstract readonly readReplyAdmissions: AgentJournal<P>['readReplyAdmissions'];
    abstract readonly query: AgentJournal<P>['query'];
    abstract readonly output: AgentJournal<P>['output'];
    abstract readonly capabilities: AgentJournal<P>['capabilities'];
}
```

### `AgentLocalRoute`

```ts
type AgentLocalRoute<P> = Readonly<{
    runtime: AgentRuntime<P>;
    observation: AgentHandle<P>;
}>;
```

### `AgentMaterialsService`

```ts
abstract class AgentMaterialsService<P, B extends ContentBlock> extends Service implements AgentMaterials<P, B> {
    static readonly provide = "agentMaterials";
    constructor(ctx: Context);
    abstract readonly preserve: AgentMaterials<P, B>['preserve'];
    abstract readonly read: AgentMaterials<P, B>['read'];
}
```

### `AgentPublicationAuthority`

```ts
interface AgentPublicationAuthority<P> {
    check(input: AgentRegistrationInput<P> | AgentWithdrawalInput<P>, caller: Context): Outcome<void, Failure>;
}
```

### `AgentPublicationAuthorityService`

```ts
abstract class AgentPublicationAuthorityService<P> extends Service implements AgentPublicationAuthority<P> {
    static readonly provide = "agentPublicationAuthority";
    constructor(ctx: Context);
    abstract readonly check: AgentPublicationAuthority<P>['check'];
}
```

### `AgentRegistrationInput`

```ts
type AgentRegistrationInput<P> = Parameters<AgentInstanceHost<P>['publish']>[0];
```

### `AgentWithdrawalInput`

```ts
type AgentWithdrawalInput<P> = Parameters<AgentInstanceHost<P>['withdraw']>[0];
```

### `CurrentConditionsService`

```ts
abstract class CurrentConditionsService<P> extends Service implements CurrentConditions<P> {
    static readonly provide = "agentConditions";
    constructor(ctx: Context);
    abstract readonly read: CurrentConditions<P>['read'];
}
```

### `DecisionCardsService`

```ts
abstract class DecisionCardsService<P> extends Service implements DecisionCards<P> {
    static readonly provide = "agentDecisionCards";
    constructor(ctx: Context);
    abstract readonly present: DecisionCards<P>['present'];
    abstract readonly lookup: DecisionCards<P>['lookup'];
    abstract readonly read: DecisionCards<P>['read'];
    abstract readonly invalidate: DecisionCards<P>['invalidate'];
}
```

### `ExtensionImplementationsService`

```ts
abstract class ExtensionImplementationsService<P> extends Service implements ExtensionImplementations<P> {
    static readonly provide = "agentExtensions";
    constructor(ctx: Context);
    abstract readonly resolve: ExtensionImplementations<P>['resolve'];
}
```

### `MessageHandoffService`

```ts
abstract class MessageHandoffService<P> extends Service implements MessageHandoff<P> {
    static readonly provide = "agentMessageHandoff";
    constructor(ctx: Context);
    abstract readonly accept: MessageHandoff<P>['accept'];
}
```

### `ModelContextReaderService`

```ts
abstract class ModelContextReaderService<P> extends Service implements ModelContextReader<P> {
    static readonly provide = "agentModelContext";
    constructor(ctx: Context);
    abstract readonly read: ModelContextReader<P>['read'];
}
```

### `ModelSelectionService`

```ts
abstract class ModelSelectionService<P> extends Service implements ModelSelection<P> {
    static readonly provide = "agentModelSelection";
    constructor(ctx: Context);
    abstract readonly select: ModelSelection<P>['select'];
}
```

### `RegisteredReadsService`

```ts
abstract class RegisteredReadsService<P> extends Service implements RegisteredReads<P> {
    static readonly provide = "agentReads";
    constructor(ctx: Context);
    abstract readonly read: RegisteredReads<P>['read'];
    abstract readonly lookup: RegisteredReads<P>['lookup'];
}
```

### `RequestPreparationService`

```ts
abstract class RequestPreparationService<P> extends Service implements RequestPreparation<P> {
    static readonly provide = "agentRequests";
    constructor(ctx: Context);
    abstract readonly prepare: RequestPreparation<P>['prepare'];
    abstract readonly derive: RequestPreparation<P>['derive'];
    abstract readonly resume: RequestPreparation<P>['resume'];
}
```

### `agentAccessCheckKey`

```ts
const agentAccessCheckKey = "agentAccessCheck";
```

### `agentActionAdmissionKey`

```ts
const agentActionAdmissionKey = "agentActionAdmission";
```

### `agentAdoptionsKey`

```ts
const agentAdoptionsKey = "agentAdoptions";
```

### `agentClockKey`

```ts
const agentClockKey = "agentClock";
```

### `agentConditionsKey`

```ts
const agentConditionsKey = "agentConditions";
```

### `agentDecisionCardsKey`

```ts
const agentDecisionCardsKey = "agentDecisionCards";
```

### `agentExecutionRecoveryKey`

```ts
const agentExecutionRecoveryKey = "agentExecutionRecovery";
```

### `agentExtensionsKey`

```ts
const agentExtensionsKey = "agentExtensions";
```

### `agentInstanceHostKey`

```ts
const agentInstanceHostKey = "agentInstanceHost";
```

### `agentInstancesKey`

```ts
const agentInstancesKey = "agentInstances";
```

### `agentInstancesPlugin`

```ts
const agentInstancesPlugin: {
    name: string;
    Config: {
        '~standard': {
            version: 1;
            vendor: string;
            validate(value: unknown): {
                value: {};
                issues?: never;
            } | {
                value?: {};
                issues: {
                    message: string;
                }[];
            };
        };
    };
    inject: string[];
    apply(ctx: Context): void;
};
```

### `agentJournalKey`

```ts
const agentJournalKey = "agentJournal";
```

### `agentMaterialsKey`

```ts
const agentMaterialsKey = "agentMaterials";
```

### `agentMessageHandoffKey`

```ts
const agentMessageHandoffKey = "agentMessageHandoff";
```

### `agentModelContextKey`

```ts
const agentModelContextKey = "agentModelContext";
```

### `agentModelSelectionKey`

```ts
const agentModelSelectionKey = "agentModelSelection";
```

### `agentPublicationAuthorityKey`

```ts
const agentPublicationAuthorityKey = "agentPublicationAuthority";
```

### `agentReadsKey`

```ts
const agentReadsKey = "agentReads";
```

### `agentRequestsKey`

```ts
const agentRequestsKey = "agentRequests";
```

## 内部引用

（无）

## 模块扩充 `@deepseek-ai/cordis`

### `Context`

```ts
interface Context {
    agentJournal: AgentJournalService<unknown>;
    agentAccessCheck: AgentAccessCheckService<unknown>;
    agentModelSelection: ModelSelectionService<unknown>;
    agentModelContext: ModelContextReaderService<unknown>;
    agentActionAdmission: ActionAdmissionService<unknown>;
    agentDecisionCards: DecisionCardsService<unknown>;
    agentMessageHandoff: MessageHandoffService<unknown>;
    agentExtensions: ExtensionImplementationsService<unknown>;
    agentAdoptions: AgentAdoptionsService<unknown>;
    agentConditions: CurrentConditionsService<unknown>;
    agentRequests: RequestPreparationService<unknown>;
    agentMaterials: AgentMaterialsService<unknown, ContentBlock>;
    agentReads: RegisteredReadsService<unknown>;
    agentClock: AgentClockService;
    agentInstanceHost: AgentInstanceHostService<unknown>;
    agentPublicationAuthority: AgentPublicationAuthorityService<unknown>;
    agentExecutionRecovery: AgentExecutionRecoveryService<unknown>;
    agentInstances: AgentInstancesService<unknown>;
}
```

### `Events`

```ts
interface Events {
    'agent-cordis-contract/instance-retired'(tenant: TenantId, instance: AgentInstanceId, generation: number, reason: 'withdrawn' | 'contributor-removed' | 'superseded'): void;
}
```
