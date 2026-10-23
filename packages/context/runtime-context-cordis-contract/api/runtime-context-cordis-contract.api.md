# @omne-harness/runtime-context-cordis-contract 的 API 快照

> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。

## 入口 `.`

### `ApplyCommitResult`

```ts
export { ApplyCommitResult } from '@omne-harness/runtime-context-contract';
```

### `BindResult`

```ts
export { BindResult } from '@omne-harness/runtime-context-contract';
```

### `CommitInput`

```ts
export { CommitInput } from '@omne-harness/runtime-context-contract';
```

### `ConsumerClass`

```ts
export { ConsumerClass } from '@omne-harness/runtime-context-contract';
```

### `ContextBlockDescriptor`

```ts
export { ContextBlockDescriptor } from '@omne-harness/runtime-context-contract';
```

### `ContextBlockKey`

```ts
export { ContextBlockKey } from '@omne-harness/runtime-context-contract';
```

### `ContextBlocks`

```ts
export { ContextBlocks } from '@omne-harness/runtime-context-contract';
```

### `ContextReader`

```ts
export { ContextReader } from '@omne-harness/runtime-context-contract';
```

### `Eligibility`

```ts
export { Eligibility } from '@omne-harness/runtime-context-contract';
```

### `EligibilityId`

```ts
export { EligibilityId } from '@omne-harness/runtime-context-contract';
```

### `EligibilityMaterial`

```ts
export { EligibilityMaterial } from '@omne-harness/runtime-context-contract';
```

### `IssueEligibilityResult`

```ts
export { IssueEligibilityResult } from '@omne-harness/runtime-context-contract';
```

### `PrepareRegistrationResult`

```ts
export { PrepareRegistrationResult } from '@omne-harness/runtime-context-contract';
```

### `ProducerHandle`

```ts
export { ProducerHandle } from '@omne-harness/runtime-context-contract';
```

### `ProducerRegistration`

```ts
export { ProducerRegistration } from '@omne-harness/runtime-context-contract';
```

### `RegisterProducerResult`

```ts
export { RegisterProducerResult } from '@omne-harness/runtime-context-contract';
```

### `RegistrationChange`

```ts
export { RegistrationChange } from '@omne-harness/runtime-context-contract';
```

### `RegistrationRevision`

```ts
export { RegistrationRevision } from '@omne-harness/runtime-context-contract';
```

### `RevokeEligibilityResult`

```ts
export { RevokeEligibilityResult } from '@omne-harness/runtime-context-contract';
```

### `RuntimeContextOperations`

```ts
export { RuntimeContextOperations } from '@omne-harness/runtime-context-contract';
```

### `ScopeRef`

```ts
export { ScopeRef } from '@omne-harness/runtime-context-contract';
```

### `ScopeText`

```ts
export { ScopeText } from '@omne-harness/runtime-context-contract';
```

### `StatefulBlockDescriptor`

```ts
export { StatefulBlockDescriptor } from '@omne-harness/runtime-context-contract';
```

### `SuppliedBlockDescriptor`

```ts
export { SuppliedBlockDescriptor } from '@omne-harness/runtime-context-contract';
```

### `ViewRevision`

```ts
export { ViewRevision } from '@omne-harness/runtime-context-contract';
```

## 入口 `./cordis`

### `RuntimeContextChangedPayload`

```ts
type RuntimeContextChangedPayload = Readonly<{
    scope: ScopeRef;
    revision: ViewRevision;
}>;
```

### `RuntimeContextIntercept`

```ts
type RuntimeContextIntercept = Readonly<{
    consumer: ConsumerClass;
}>;
```

### `RuntimeContextService`

```ts
abstract class RuntimeContextService<P = unknown> extends Service<RuntimeContextIntercept> implements RuntimeContextOperations<P> {
    static readonly provide = "runtimeContext";
    constructor(ctx: Context);
    abstract registerProducer<K extends ContextBlockKey>(...args: ProducerOperation<K>['args']): ProducerOperation<K>['result'];
    abstract prepareRegistration(...args: Operation<P, 'prepareRegistration'>['args']): Operation<P, 'prepareRegistration'>['result'];
    abstract issueEligibility(...args: Operation<P, 'issueEligibility'>['args']): Operation<P, 'issueEligibility'>['result'];
    abstract revokeEligibility(...args: Operation<P, 'revokeEligibility'>['args']): Operation<P, 'revokeEligibility'>['result'];
    abstract applyCommit(...args: Operation<P, 'applyCommit'>['args']): Operation<P, 'applyCommit'>['result'];
    abstract bind(...args: Operation<P, 'bind'>['args']): Operation<P, 'bind'>['result'];
}
```

### `runtimeContextKey`

```ts
const runtimeContextKey = "runtimeContext";
```

### `runtimeContextScopeKey`

```ts
const runtimeContextScopeKey: 'scope';
```

## 内部引用

### `Operation`

```ts
type Operation<P, O extends keyof RuntimeContextOperations<P>> = {
    args: Parameters<RuntimeContextOperations<P>[O]>;
    result: ReturnType<RuntimeContextOperations<P>[O]>;
};
```

### `ProducerOperation`

```ts
type ProducerOperation<K extends ContextBlockKey> = {
    args: Parameters<typeof operations.registerProducer<K>>;
    result: ReturnType<typeof operations.registerProducer<K>>;
};
```

## 模块扩充 `@deepseek-ai/cordis`

### `Context`

```ts
interface Context {
    runtimeContext: RuntimeContextService<unknown>;
    [runtimeContextScopeKey]?: ScopeRef;
}
```

### `Events`

```ts
interface Events {
    'runtime-context-cordis-contract/changed'(scope: ScopeRef, revision: ViewRevision): void;
}
```
