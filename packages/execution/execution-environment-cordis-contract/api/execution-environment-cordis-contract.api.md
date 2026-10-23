# @omne-harness/execution-environment-cordis-contract 的 API 快照

> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。

## 入口 `.`

（无）

## 入口 `./cordis`

### `CallerClass`

```ts
type CallerClass = ExecutionEnvironmentIntercept['caller'];
```

### `CallerClassMismatch`

```ts
class CallerClassMismatch extends Error {
    readonly operation: ServiceOperation;
    readonly expected: CallerClass;
    readonly declared: unknown;
    constructor(operation: ServiceOperation, expected: CallerClass, declared: unknown);
}
```

### `ExecutionEnvironmentIntercept`

```ts
type ExecutionEnvironmentIntercept = {
    caller: 'integrator' | 'maintainer' | 'provider';
};
```

### `ExecutionEnvironmentService`

```ts
abstract class ExecutionEnvironmentService<P> extends Service<ExecutionEnvironmentIntercept> implements ExecutionEnvironment<P>, ProviderRegistrations {
    static readonly provide = "executionEnvironment";
    constructor(ctx: Context);
    private callerRefusal;
    resolvePlacement(...args: Operation<P, 'resolvePlacement'>['args']): Operation<P, 'resolvePlacement'>['result'];
    protected abstract onResolvePlacement(...args: Operation<P, 'resolvePlacement'>['args']): Operation<P, 'resolvePlacement'>['result'];
    acquire(...args: Operation<P, 'acquire'>['args']): Operation<P, 'acquire'>['result'];
    protected abstract onAcquire(...args: Operation<P, 'acquire'>['args']): Operation<P, 'acquire'>['result'];
    inspectAcquisition(...args: Operation<P, 'inspectAcquisition'>['args']): Operation<P, 'inspectAcquisition'>['result'];
    protected abstract onInspectAcquisition(...args: Operation<P, 'inspectAcquisition'>['args']): Operation<P, 'inspectAcquisition'>['result'];
    describe(...args: Operation<P, 'describe'>['args']): Operation<P, 'describe'>['result'];
    protected abstract onDescribe(...args: Operation<P, 'describe'>['args']): Operation<P, 'describe'>['result'];
    recoverOwned(...args: Operation<P, 'recoverOwned'>['args']): Operation<P, 'recoverOwned'>['result'];
    protected abstract onRecoverOwned(...args: Operation<P, 'recoverOwned'>['args']): Operation<P, 'recoverOwned'>['result'];
    releaseScope(...args: Operation<P, 'releaseScope'>['args']): Operation<P, 'releaseScope'>['result'];
    protected abstract onReleaseScope(...args: Operation<P, 'releaseScope'>['args']): Operation<P, 'releaseScope'>['result'];
    registerFacility<K extends FacilityKey>(descriptor: FacilityDescriptor<K>): ReturnType<ProviderRegistrations['registerFacility']>;
    protected abstract onRegisterFacility<K extends FacilityKey>(descriptor: FacilityDescriptor<K>): ReturnType<ProviderRegistrations['registerFacility']>;
    registerProvider(...args: Parameters<ProviderRegistrations['registerProvider']>): ReturnType<ProviderRegistrations['registerProvider']>;
    protected abstract onRegisterProvider(...args: Parameters<ProviderRegistrations['registerProvider']>): ReturnType<ProviderRegistrations['registerProvider']>;
}
```

### `ExecutionRecoveryAuthorityService`

```ts
abstract class ExecutionRecoveryAuthorityService extends Service implements RecoveryAuthority {
    static readonly provide = "executionRecoveryAuthority";
    constructor(ctx: Context);
    abstract authorizeRecovery(...args: Parameters<RecoveryAuthority['authorizeRecovery']>): ReturnType<RecoveryAuthority['authorizeRecovery']>;
}
```

### `ServiceFace`

```ts
type ServiceFace = 'environment' | 'recovery' | 'registration';
```

### `ServiceOperation`

```ts
type ServiceOperation = keyof ExecutionEnvironment<unknown> | keyof ProviderRegistrations;
```

### `executionEnvironmentKey`

```ts
const executionEnvironmentKey = "executionEnvironment";
```

### `executionRecoveryAuthorityKey`

```ts
const executionRecoveryAuthorityKey = "executionRecoveryAuthority";
```

### `faceCallers`

```ts
const faceCallers: Readonly<Record<ServiceFace, CallerClass>>;
```

### `operationFaces`

```ts
const operationFaces: Readonly<Record<ServiceOperation, ServiceFace>>;
```

## 内部引用

### `Operation`

```ts
type Operation<P, O extends keyof ExecutionEnvironment<P>> = {
    args: Parameters<ExecutionEnvironment<P>[O]>;
    result: ReturnType<ExecutionEnvironment<P>[O]>;
};
```

## 模块扩充 `@deepseek-ai/cordis`

### `Context`

```ts
interface Context {
    executionEnvironment: ExecutionEnvironmentService<unknown>;
    executionRecoveryAuthority: ExecutionRecoveryAuthorityService;
}
```
