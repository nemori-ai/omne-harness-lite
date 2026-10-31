# @omne-harness/agent-cordis-contract 的 API 快照

<!-- omne-contract-api 快照格式 1 -->

> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。

## 入口 `.` · `index.d.ts`

- `AgentLocalRoute` · `index.d.ts`
- `AgentRegistrationInput` · `index.d.ts`
- `AgentWithdrawalInput` · `index.d.ts`

## 入口 `./cordis` · `cordis.d.ts`

- `ActionAdmissionService` · `cordis.d.ts`
- `AgentAccessCheckService` · `cordis.d.ts`
- `AgentAccountOutletService` · `cordis.d.ts`
- `AgentAdoptionsService` · `cordis.d.ts`
- `AgentClockService` · `cordis.d.ts`
- `AgentExecutionControlService` · `cordis.d.ts`
- `AgentExecutionRecoveryService` · `cordis.d.ts`
- `AgentInstanceHostService` · `cordis.d.ts`
- `AgentInstancesService` · `cordis.d.ts`
- `AgentJournalEntriesService` · `cordis.d.ts`
- `AgentJournalService` · `cordis.d.ts`
- `AgentLocalRoute` · `index.d.ts`
- `AgentMaterialsService` · `cordis.d.ts`
- `AgentPublicationAuthority` · `cordis.d.ts`
- `AgentPublicationAuthorityService` · `cordis.d.ts`
- `AgentRegistrationInput` · `index.d.ts`
- `AgentWithdrawalInput` · `index.d.ts`
- `CurrentConditionsService` · `cordis.d.ts`
- `DecisionCardsService` · `cordis.d.ts`
- `ExtensionImplementationsService` · `cordis.d.ts`
- `MessageHandoffService` · `cordis.d.ts`
- `ModelContextReaderService` · `cordis.d.ts`
- `ModelSelectionService` · `cordis.d.ts`
- `RegisteredReadsService` · `cordis.d.ts`
- `RequestPreparationService` · `cordis.d.ts`
- `agentAccessCheckKey` · `cordis.d.ts`
- `agentAccountOutletKey` · `cordis.d.ts`
- `agentActionAdmissionKey` · `cordis.d.ts`
- `agentAdoptionsKey` · `cordis.d.ts`
- `agentClockKey` · `cordis.d.ts`
- `agentConditionsKey` · `cordis.d.ts`
- `agentDecisionCardsKey` · `cordis.d.ts`
- `agentExecutionControlKey` · `cordis.d.ts`
- `agentExecutionRecoveryKey` · `cordis.d.ts`
- `agentExtensionsKey` · `cordis.d.ts`
- `agentInstanceHostKey` · `cordis.d.ts`
- `agentInstancesKey` · `cordis.d.ts`
- `agentInstancesPlugin` · `cordis.d.ts`
- `agentJournalEntriesKey` · `cordis.d.ts`
- `agentJournalKey` · `cordis.d.ts`
- `agentMaterialsKey` · `cordis.d.ts`
- `agentMessageHandoffKey` · `cordis.d.ts`
- `agentModelContextKey` · `cordis.d.ts`
- `agentModelSelectionKey` · `cordis.d.ts`
- `agentPublicationAuthorityKey` · `cordis.d.ts`
- `agentReadsKey` · `cordis.d.ts`
- `agentRequestsKey` · `cordis.d.ts`

## 声明文件 `cordis.d.ts`

```ts
import { type Context, Service } from '@deepseek-ai/cordis';
import { type ActionAdmission, type AgentAccessCheck, type AgentAccountOutlet, type AgentAdoptions, type AgentClock, type AgentDirectory, type AgentExecutionControl, type AgentExecutionRecovery, type AgentInstanceHost, type AgentInstanceId, type AgentJournal, type AgentJournalEntries, type AgentMaterials, type CurrentConditions, type DecisionCards, type ExtensionImplementations, type Failure, type MessageHandoff, type ModelContextReader, type ModelSelection, type RegisteredReads, type Registration, type RequestPreparation, type Reply } from '@omne-harness/agent-contract';
import type { ContentBlock } from '@omne-harness/content-block';
import { type TenantId } from '@omne-harness/legal-identity';
import { type Outcome } from '@omne-harness/operation-result';
import type { AgentLocalRoute, AgentRegistrationInput, AgentWithdrawalInput } from './index.ts';
export type { AgentLocalRoute, AgentRegistrationInput, AgentWithdrawalInput } from './index.ts';
export interface AgentPublicationAuthority<P> {
    check(input: AgentRegistrationInput<P> | AgentWithdrawalInput<P>, caller: Context): Outcome<void, Failure>;
}
export declare abstract class AgentJournalService<P> extends Service implements AgentJournal<P> {
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
    abstract readonly recordHandoff: AgentJournal<P>['recordHandoff'];
    abstract readonly prepareFinish: AgentJournal<P>['prepareFinish'];
    abstract readonly tryFinish: AgentJournal<P>['tryFinish'];
    abstract readonly commitSettlement: AgentJournal<P>['commitSettlement'];
    abstract readonly recordTerminalObservation: AgentJournal<P>['recordTerminalObservation'];
    abstract readonly load: AgentJournal<P>['load'];
    abstract readonly inputs: AgentJournal<P>['inputs'];
    abstract readonly readReplyAdmissions: AgentJournal<P>['readReplyAdmissions'];
    abstract readonly query: AgentJournal<P>['query'];
    abstract readonly output: AgentJournal<P>['output'];
    abstract readonly capabilities: AgentJournal<P>['capabilities'];
}
export declare const agentJournalKey = "agentJournal";
export declare abstract class AgentAccessCheckService<P> extends Service implements AgentAccessCheck<P> {
    static readonly provide = "agentAccessCheck";
    constructor(ctx: Context);
    abstract readonly check: AgentAccessCheck<P>['check'];
}
export declare const agentAccessCheckKey = "agentAccessCheck";
export declare abstract class ModelSelectionService<P> extends Service implements ModelSelection<P> {
    static readonly provide = "agentModelSelection";
    constructor(ctx: Context);
    abstract readonly select: ModelSelection<P>['select'];
}
export declare const agentModelSelectionKey = "agentModelSelection";
export declare abstract class ModelContextReaderService<P> extends Service implements ModelContextReader<P> {
    static readonly provide = "agentModelContext";
    constructor(ctx: Context);
    abstract readonly read: ModelContextReader<P>['read'];
}
export declare const agentModelContextKey = "agentModelContext";
export declare abstract class ActionAdmissionService<P> extends Service implements ActionAdmission<P> {
    static readonly provide = "agentActionAdmission";
    constructor(ctx: Context);
    abstract readonly admit: ActionAdmission<P>['admit'];
}
export declare const agentActionAdmissionKey = "agentActionAdmission";
export declare abstract class DecisionCardsService<P> extends Service implements DecisionCards<P> {
    static readonly provide = "agentDecisionCards";
    constructor(ctx: Context);
    abstract readonly present: DecisionCards<P>['present'];
    abstract readonly lookup: DecisionCards<P>['lookup'];
    abstract readonly read: DecisionCards<P>['read'];
    abstract readonly invalidate: DecisionCards<P>['invalidate'];
}
export declare const agentDecisionCardsKey = "agentDecisionCards";
export declare abstract class MessageHandoffService<P> extends Service implements MessageHandoff<P> {
    static readonly provide = "agentMessageHandoff";
    constructor(ctx: Context);
    abstract readonly prepare: MessageHandoff<P>['prepare'];
    abstract readonly lookup: MessageHandoff<P>['lookup'];
    abstract readonly exclude: MessageHandoff<P>['exclude'];
}
export declare const agentMessageHandoffKey = "agentMessageHandoff";
export declare abstract class ExtensionImplementationsService<P> extends Service implements ExtensionImplementations<P> {
    static readonly provide = "agentExtensions";
    constructor(ctx: Context);
    abstract readonly resolve: ExtensionImplementations<P>['resolve'];
}
export declare const agentExtensionsKey = "agentExtensions";
export declare abstract class AgentAdoptionsService<P> extends Service implements AgentAdoptions<P> {
    static readonly provide = "agentAdoptions";
    constructor(ctx: Context);
    abstract readonly resolve: AgentAdoptions<P>['resolve'];
    abstract readonly handover: AgentAdoptions<P>['handover'];
}
export declare const agentAdoptionsKey = "agentAdoptions";
export declare abstract class CurrentConditionsService<P> extends Service implements CurrentConditions<P> {
    static readonly provide = "agentConditions";
    constructor(ctx: Context);
    abstract readonly read: CurrentConditions<P>['read'];
}
export declare const agentConditionsKey = "agentConditions";
export declare abstract class RequestPreparationService<P> extends Service implements RequestPreparation<P> {
    static readonly provide = "agentRequests";
    constructor(ctx: Context);
    abstract readonly prepare: RequestPreparation<P>['prepare'];
    abstract readonly derive: RequestPreparation<P>['derive'];
    abstract readonly resume: RequestPreparation<P>['resume'];
}
export declare const agentRequestsKey = "agentRequests";
export declare abstract class AgentMaterialsService<P, B extends ContentBlock> extends Service implements AgentMaterials<P, B> {
    static readonly provide = "agentMaterials";
    constructor(ctx: Context);
    abstract readonly preserve: AgentMaterials<P, B>['preserve'];
    abstract readonly read: AgentMaterials<P, B>['read'];
}
export declare const agentMaterialsKey = "agentMaterials";
export declare abstract class RegisteredReadsService<P> extends Service implements RegisteredReads<P> {
    static readonly provide = "agentReads";
    constructor(ctx: Context);
    abstract readonly read: RegisteredReads<P>['read'];
    abstract readonly lookup: RegisteredReads<P>['lookup'];
}
export declare const agentReadsKey = "agentReads";
export declare abstract class AgentClockService extends Service implements AgentClock {
    static readonly provide = "agentClock";
    constructor(ctx: Context);
    abstract readonly now: AgentClock['now'];
    abstract readonly waitUntil: AgentClock['waitUntil'];
}
export declare const agentClockKey = "agentClock";
export declare abstract class AgentInstanceHostService<P> extends Service implements AgentInstanceHost<P> {
    static readonly provide = "agentInstanceHost";
    constructor(ctx: Context);
    abstract readonly reserve: AgentInstanceHost<P>['reserve'];
    abstract readonly publish: AgentInstanceHost<P>['publish'];
    abstract readonly withdraw: AgentInstanceHost<P>['withdraw'];
    abstract readonly directory: AgentInstanceHost<P>['directory'];
    abstract route(tenant: TenantId, instance: AgentInstanceId): AgentLocalRoute<P> | null;
}
export declare const agentInstanceHostKey = "agentInstanceHost";
export declare abstract class AgentPublicationAuthorityService<P> extends Service implements AgentPublicationAuthority<P> {
    static readonly provide = "agentPublicationAuthority";
    constructor(ctx: Context);
    abstract readonly check: AgentPublicationAuthority<P>['check'];
}
export declare const agentPublicationAuthorityKey = "agentPublicationAuthority";
export declare abstract class AgentExecutionRecoveryService<P> extends Service implements AgentExecutionRecovery<P> {
    static readonly provide = "agentExecutionRecovery";
    constructor(ctx: Context);
    abstract readonly query: AgentExecutionRecovery<P>['query'];
    abstract readonly load: AgentExecutionRecovery<P>['load'];
    abstract readonly reconcile: AgentExecutionRecovery<P>['reconcile'];
    abstract readonly detach: AgentExecutionRecovery<P>['detach'];
}
export declare const agentExecutionRecoveryKey = "agentExecutionRecovery";
export declare abstract class AgentJournalEntriesService<P> extends Service implements AgentJournalEntries<P> {
    static readonly provide = "agentJournalEntries";
    constructor(ctx: Context);
    abstract readonly record: AgentJournalEntries<P>['record'];
}
export declare const agentJournalEntriesKey = "agentJournalEntries";
export declare abstract class AgentAccountOutletService<P> extends Service implements AgentAccountOutlet<P> {
    static readonly provide = "agentAccountOutlet";
    constructor(ctx: Context);
    abstract readonly deliver: AgentAccountOutlet<P>['deliver'];
}
export declare const agentAccountOutletKey = "agentAccountOutlet";
export declare abstract class AgentExecutionControlService<P> extends Service implements AgentExecutionControl<P> {
    static readonly provide = "agentExecutionControl";
    constructor(ctx: Context);
    abstract readonly control: AgentExecutionControl<P>['control'];
}
export declare const agentExecutionControlKey = "agentExecutionControl";
export declare class AgentInstancesService<P> extends Service implements AgentDirectory<P> {
    static readonly provide = "agentInstances";
    readonly resolve: AgentDirectory<P>['resolve'];
    readonly connect: AgentDirectory<P>['connect'];
    readonly register: (input: AgentRegistrationInput<P>) => Reply<Registration>;
    readonly withdraw: (input: AgentWithdrawalInput<P>) => Reply<Registration>;
    constructor(ctx: Context, authority: AgentPublicationAuthority<P>);
}
export declare const agentInstancesKey = "agentInstances";
export declare const agentInstancesPlugin: {
    name: string;
    Config: {
        '~standard': {
            version: 1;
            vendor: string;
            validate(value: unknown): {
                issues?: never;
                value: {};
            } | {
                value?: never;
                issues: {
                    message: string;
                }[];
            };
        };
    };
    inject: string[];
    apply(ctx: Context): void;
};
declare module '@deepseek-ai/cordis' {
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
        agentJournalEntries: AgentJournalEntriesService<unknown>;
        agentAccountOutlet: AgentAccountOutletService<unknown>;
        agentExecutionControl: AgentExecutionControlService<unknown>;
        agentInstances: AgentInstancesService<unknown>;
    }
    interface Events {
        'agent-cordis-contract/instance-retired'(tenant: TenantId, instance: AgentInstanceId, generation: number, reason: 'withdrawn' | 'contributor-removed' | 'superseded'): void;
    }
}
```

## 声明文件 `index.d.ts`

```ts
import type { AgentHandle, AgentInstanceHost, AgentRuntime } from '@omne-harness/agent-contract';
export type AgentLocalRoute<P> = Readonly<{
    runtime: AgentRuntime<P>;
    observation: AgentHandle<P>;
}>;
export type AgentRegistrationInput<P> = Parameters<AgentInstanceHost<P>['publish']>[0];
export type AgentWithdrawalInput<P> = Parameters<AgentInstanceHost<P>['withdraw']>[0];
```
