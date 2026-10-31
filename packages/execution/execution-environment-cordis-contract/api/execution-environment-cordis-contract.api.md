# @omne-harness/execution-environment-cordis-contract 的 API 快照

<!-- omne-contract-api 快照格式 1 -->

> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。

## 入口 `.` · `index.d.ts`

（无）

## 入口 `./cordis` · `cordis.d.ts`

- `CallerClass` · `cordis.d.ts`
- `CallerClassMismatch` · `cordis.d.ts`
- `ExecutionEnvironmentAuthorityService` · `cordis.d.ts`
- `ExecutionEnvironmentIntercept` · `cordis.d.ts`
- `ExecutionEnvironmentService` · `cordis.d.ts`
- `ExecutionRecoveryAuthorityService` · `cordis.d.ts`
- `ExecutionScopeBindingService` · `cordis.d.ts`
- `ServiceFace` · `cordis.d.ts`
- `ServiceOperation` · `cordis.d.ts`
- `executionEnvironmentAuthorityKey` · `cordis.d.ts`
- `executionEnvironmentKey` · `cordis.d.ts`
- `executionRecoveryAuthorityKey` · `cordis.d.ts`
- `executionScopeBindingKey` · `cordis.d.ts`
- `faceCallers` · `cordis.d.ts`
- `operationFaces` · `cordis.d.ts`

## 声明文件 `cordis.d.ts`

```ts
import { type Context, Service } from '@deepseek-ai/cordis';
import type { ScopeBindingSource } from '@omne-harness/runtime-context-contract';
import type { EnvironmentAuthority, ExecutionEnvironment, FacilityDescriptor, FacilityKey, ProviderRegistrations, RecoveryAuthority } from '@omne-harness/execution-environment-contract';
type Operation<P, O extends keyof ExecutionEnvironment<P>> = {
    args: Parameters<ExecutionEnvironment<P>[O]>;
    result: ReturnType<ExecutionEnvironment<P>[O]>;
};
export type ExecutionEnvironmentIntercept = {
    caller: 'integrator' | 'maintainer' | 'provider';
};
export type CallerClass = ExecutionEnvironmentIntercept['caller'];
export type ServiceFace = 'environment' | 'recovery' | 'registration';
export type ServiceOperation = keyof ExecutionEnvironment<unknown> | keyof ProviderRegistrations;
export declare const operationFaces: Readonly<Record<ServiceOperation, ServiceFace>>;
export declare const faceCallers: Readonly<Record<ServiceFace, CallerClass>>;
export declare class CallerClassMismatch extends Error {
    readonly operation: ServiceOperation;
    readonly expected: CallerClass;
    readonly declared: unknown;
    constructor(operation: ServiceOperation, expected: CallerClass, declared: unknown);
}
export declare abstract class ExecutionEnvironmentService<P> extends Service<ExecutionEnvironmentIntercept> implements ExecutionEnvironment<P>, ProviderRegistrations {
    static readonly provide = "executionEnvironment";
    constructor(ctx: Context);
    private callerRefusal;
    resolvePlacement(...args: Operation<P, 'resolvePlacement'>['args']): Operation<P, 'resolvePlacement'>['result'];
    protected abstract onResolvePlacement(...args: Operation<P, 'resolvePlacement'>['args']): Operation<P, 'resolvePlacement'>['result'];
    acquire(...args: Operation<P, 'acquire'>['args']): Operation<P, 'acquire'>['result'];
    protected abstract onAcquire(...args: Operation<P, 'acquire'>['args']): Operation<P, 'acquire'>['result'];
    inspectAcquisition(...args: Operation<P, 'inspectAcquisition'>['args']): Operation<P, 'inspectAcquisition'>['result'];
    protected abstract onInspectAcquisition(...args: Operation<P, 'inspectAcquisition'>['args']): Operation<P, 'inspectAcquisition'>['result'];
    inspectRecoveryAcquisition(...args: Operation<P, 'inspectRecoveryAcquisition'>['args']): Operation<P, 'inspectRecoveryAcquisition'>['result'];
    protected abstract onInspectRecoveryAcquisition(...args: Operation<P, 'inspectRecoveryAcquisition'>['args']): Operation<P, 'inspectRecoveryAcquisition'>['result'];
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
export declare const executionEnvironmentKey = "executionEnvironment";
export declare abstract class ExecutionRecoveryAuthorityService extends Service implements RecoveryAuthority {
    static readonly provide = "executionRecoveryAuthority";
    constructor(ctx: Context);
    abstract authorizeRecovery(...args: Parameters<RecoveryAuthority['authorizeRecovery']>): ReturnType<RecoveryAuthority['authorizeRecovery']>;
}
export declare const executionRecoveryAuthorityKey = "executionRecoveryAuthority";
export declare abstract class ExecutionEnvironmentAuthorityService<P = unknown> extends Service implements EnvironmentAuthority<P> {
    static readonly provide = "executionEnvironmentAuthority";
    constructor(ctx: Context);
    abstract authorize(...args: Parameters<EnvironmentAuthority<P>['authorize']>): ReturnType<EnvironmentAuthority<P>['authorize']>;
}
export declare const executionEnvironmentAuthorityKey = "executionEnvironmentAuthority";
export declare abstract class ExecutionScopeBindingService extends Service implements ScopeBindingSource {
    static readonly provide = "executionScopeBinding";
    constructor(ctx: Context);
    abstract lookup(...args: Parameters<ScopeBindingSource['lookup']>): ReturnType<ScopeBindingSource['lookup']>;
}
export declare const executionScopeBindingKey = "executionScopeBinding";
declare module '@deepseek-ai/cordis' {
    interface Context {
        executionEnvironment: ExecutionEnvironmentService<unknown>;
        executionRecoveryAuthority: ExecutionRecoveryAuthorityService;
        executionEnvironmentAuthority: ExecutionEnvironmentAuthorityService<unknown>;
        executionScopeBinding: ExecutionScopeBindingService;
    }
}
export {};
```

## 声明文件 `index.d.ts`

```ts
export {};
```
