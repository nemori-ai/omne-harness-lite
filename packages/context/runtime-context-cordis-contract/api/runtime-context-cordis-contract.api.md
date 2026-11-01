# @omne-harness/runtime-context-cordis-contract 的 API 快照

<!-- omne-contract-api 快照格式 1 -->

> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。

## 入口 `.` · `index.d.ts`

- `ApplyCommitResult` · 包 `@omne-harness/runtime-context-contract`
- `BindResult` · 包 `@omne-harness/runtime-context-contract`
- `CommitInput` · 包 `@omne-harness/runtime-context-contract`
- `ConsumerClass` · 包 `@omne-harness/runtime-context-contract`
- `ContextBlockDescriptor` · 包 `@omne-harness/runtime-context-contract`
- `ContextBlockKey` · 包 `@omne-harness/runtime-context-contract`
- `ContextBlocks` · 包 `@omne-harness/runtime-context-contract`
- `ContextReader` · 包 `@omne-harness/runtime-context-contract`
- `Eligibility` · 包 `@omne-harness/runtime-context-contract`
- `EligibilityId` · 包 `@omne-harness/runtime-context-contract`
- `EligibilityMaterial` · 包 `@omne-harness/runtime-context-contract`
- `IssueEligibilityResult` · 包 `@omne-harness/runtime-context-contract`
- `PrepareRegistrationResult` · 包 `@omne-harness/runtime-context-contract`
- `ProducerHandle` · 包 `@omne-harness/runtime-context-contract`
- `ProducerRegistration` · 包 `@omne-harness/runtime-context-contract`
- `RegisterProducerResult` · 包 `@omne-harness/runtime-context-contract`
- `RegistrationChange` · 包 `@omne-harness/runtime-context-contract`
- `RegistrationRevision` · 包 `@omne-harness/runtime-context-contract`
- `RevokeEligibilityResult` · 包 `@omne-harness/runtime-context-contract`
- `RuntimeContextOperations` · 包 `@omne-harness/runtime-context-contract`
- `ScopeRef` · 包 `@omne-harness/runtime-context-contract`
- `ScopeText` · 包 `@omne-harness/runtime-context-contract`
- `StatefulBlockDescriptor` · 包 `@omne-harness/runtime-context-contract`
- `SuppliedBlockDescriptor` · 包 `@omne-harness/runtime-context-contract`
- `ViewRevision` · 包 `@omne-harness/runtime-context-contract`

## 入口 `./cordis` · `cordis.d.ts`

- `RuntimeContextChangedPayload` · `cordis.d.ts`
- `RuntimeContextIntercept` · `cordis.d.ts`
- `RuntimeContextService` · `cordis.d.ts`
- `RuntimeContextTrustService` · `cordis.d.ts`
- `runtimeContextKey` · `cordis.d.ts`
- `runtimeContextScopeKey` · `cordis.d.ts`
- `runtimeContextTrustKey` · `cordis.d.ts`

## 声明文件 `cordis.d.ts`

```ts
import { type Context, Service } from '@deepseek-ai/cordis';
import type { ConsumerClass, ContextBlockKey, RuntimeContextOperations, RuntimeContextTrust, ScopeRef, ViewRevision } from '@omne-harness/runtime-context-contract';
type Operation<P, O extends keyof RuntimeContextOperations<P>> = {
    args: Parameters<RuntimeContextOperations<P>[O]>;
    result: ReturnType<RuntimeContextOperations<P>[O]>;
};
declare const operations: RuntimeContextOperations;
type ProducerOperation<K extends ContextBlockKey> = {
    args: Parameters<typeof operations.registerProducer<K>>;
    result: ReturnType<typeof operations.registerProducer<K>>;
};
export type RuntimeContextIntercept = Readonly<{
    consumer: ConsumerClass;
}>;
export declare abstract class RuntimeContextTrustService<P = unknown> extends Service implements RuntimeContextTrust<P> {
    static readonly provide = "runtimeContextTrust";
    constructor(ctx: Context);
    abstract readonly authority: RuntimeContextTrust<P>['authority'];
    abstract readonly bindings: RuntimeContextTrust<P>['bindings'];
}
export declare const runtimeContextTrustKey = "runtimeContextTrust";
export declare abstract class RuntimeContextService<P = unknown> extends Service<RuntimeContextIntercept> implements RuntimeContextOperations<P> {
    static readonly provide = "runtimeContext";
    constructor(ctx: Context);
    abstract registerProducer<K extends ContextBlockKey>(...args: ProducerOperation<K>['args']): ProducerOperation<K>['result'];
    abstract prepareRegistration(...args: Operation<P, 'prepareRegistration'>['args']): Operation<P, 'prepareRegistration'>['result'];
    abstract issueEligibility(...args: Operation<P, 'issueEligibility'>['args']): Operation<P, 'issueEligibility'>['result'];
    abstract revokeEligibility(...args: Operation<P, 'revokeEligibility'>['args']): Operation<P, 'revokeEligibility'>['result'];
    abstract applyCommit(...args: Operation<P, 'applyCommit'>['args']): Operation<P, 'applyCommit'>['result'];
    abstract beginReplay(...args: Operation<P, 'beginReplay'>['args']): Operation<P, 'beginReplay'>['result'];
    abstract finishReplay(...args: Operation<P, 'finishReplay'>['args']): Operation<P, 'finishReplay'>['result'];
    abstract bind(...args: Operation<P, 'bind'>['args']): Operation<P, 'bind'>['result'];
}
export declare const runtimeContextKey = "runtimeContext";
export declare const runtimeContextScopeKey: 'scope';
export type RuntimeContextChangedPayload = Readonly<{
    scope: ScopeRef;
    revision: ViewRevision;
}>;
declare module '@deepseek-ai/cordis' {
    interface Context {
        runtimeContext: RuntimeContextService<unknown>;
        runtimeContextTrust: RuntimeContextTrustService<unknown>;
        [runtimeContextScopeKey]?: ScopeRef;
    }
    interface Events {
        'runtime-context-cordis-contract/changed'(scope: ScopeRef, revision: ViewRevision): void;
    }
}
export {};
```

## 声明文件 `index.d.ts`

```ts
export type { ScopeRef, ScopeText, ContextBlockKey, ConsumerClass, ContextBlocks, ContextBlockDescriptor, SuppliedBlockDescriptor, StatefulBlockDescriptor, ViewRevision, RegistrationRevision, EligibilityId, ProducerRegistration, RegisterProducerResult, ProducerHandle, RegistrationChange, PrepareRegistrationResult, EligibilityMaterial, Eligibility, IssueEligibilityResult, RevokeEligibilityResult, CommitInput, ApplyCommitResult, BindResult, ContextReader, RuntimeContextOperations, } from '@omne-harness/runtime-context-contract';
```
