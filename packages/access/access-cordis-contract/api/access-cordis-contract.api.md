# @omne-harness/access-cordis-contract 的 API 快照

<!-- omne-contract-api 快照格式 1 -->

> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。

## 入口 `.` · `index.d.ts`

- `AccessAssemblyError` · `contribution.d.ts`
- `AccessContribution` · `contribution.d.ts`
- `AccessIdentity` · `identity.d.ts`
- `ActForResult` · `identity.d.ts`
- `AnswerOf` · `contribution.d.ts`
- `BodyOf` · `contribution.d.ts`
- `CallContext` · `contribution.d.ts`
- `EndOf` · `contribution.d.ts`
- `FrameOf` · `contribution.d.ts`
- `FrameSource` · `contribution.d.ts`
- `IdentityFailure` · `identity.d.ts`
- `LoginIdentity` · `contribution.d.ts`
- `LoginResult` · `identity.d.ts`
- `ObservationContext` · `contribution.d.ts`
- `OpenOf` · `contribution.d.ts`
- `OperationHandler` · `contribution.d.ts`
- `Principal` · `contribution.d.ts`
- `PrincipalFor` · `contribution.d.ts`
- `ProtocolKey` · `contribution.d.ts`

## 入口 `./cordis` · `cordis.d.ts`

- `AccessRegistryService` · `cordis.d.ts`
- `accessRegistryKey` · `cordis.d.ts`

## 声明文件 `contribution.d.ts`

```ts
import type { Codec, ObservationContract, OperationContract, ProtocolContract } from '@omne-harness/public-contract';
export type ProtocolKey = {
    readonly name: string;
    readonly major: number;
};
declare const loginIdentityBrand: unique symbol;
declare const principalBrand: unique symbol;
export type LoginIdentity = {
    readonly [loginIdentityBrand]: 'LoginIdentity';
};
export type Principal = {
    readonly [principalBrand]: 'Principal';
};
export type PrincipalFor<I extends OperationContract['identity']> = I extends 'none' ? undefined : I extends 'login' ? LoginIdentity : Principal;
type ValueOf<C> = C extends Codec<infer T> ? T : never;
export type BodyOf<O extends OperationContract> = ValueOf<O['body']>;
export type AnswerOf<O extends OperationContract> = {
    [K in keyof O['outcomes'] & string]: O['outcomes'][K] extends Codec<infer T> ? {
        readonly outcome: K;
        readonly body: T;
    } : {
        readonly outcome: K;
    };
}[keyof O['outcomes'] & string];
export type CallContext<O extends OperationContract> = {
    readonly principal: PrincipalFor<O['identity']>;
    readonly messageId: string;
    readonly signal: AbortSignal;
};
export type OperationHandler<O extends OperationContract> = (call: CallContext<O>, body: BodyOf<O>) => Promise<AnswerOf<O>>;
export type ObservationContext<O extends ObservationContract> = {
    readonly principal: PrincipalFor<O['identity']>;
    readonly messageId: string;
    readonly signal: AbortSignal;
};
export type OpenOf<O extends ObservationContract> = ValueOf<O['open']>;
export type FrameOf<O extends ObservationContract> = ValueOf<O['frame']>;
export type EndOf<O extends ObservationContract> = O['ends'][number] | 'denied' | 'unavailable';
export type FrameSource<O extends ObservationContract> = (context: ObservationContext<O>, open: OpenOf<O>) => Promise<{
    readonly outcome: 'succeeded';
    readonly frames: AsyncGenerator<FrameOf<O>, EndOf<O>>;
} | {
    readonly outcome: 'denied' | 'invalid' | 'basis-unavailable';
}>;
export type AccessContribution<P extends ProtocolContract> = {
    readonly protocol: P;
    readonly operations: {
        readonly [K in keyof P['operations']]: OperationHandler<P['operations'][K]>;
    };
    readonly observations: {
        readonly [K in keyof P['observations']]: FrameSource<P['observations'][K]>;
    };
};
export declare class AccessAssemblyError extends Error {
    readonly protocol: ProtocolKey;
    constructor(protocol: ProtocolKey);
}
export {};
```

## 声明文件 `cordis.d.ts`

```ts
import { Service, type Context } from '@deepseek-ai/cordis';
import type { ProtocolContract } from '@omne-harness/public-contract';
import type { AccessContribution } from './contribution.ts';
export declare abstract class AccessRegistryService extends Service {
    static readonly provide = "accessRegistry";
    constructor(ctx: Context);
    mount<P extends ProtocolContract>(contribution: AccessContribution<P>): void;
    protected abstract attach(contribution: AccessContribution<ProtocolContract>): () => Promise<void>;
}
export declare const accessRegistryKey = "accessRegistry";
declare module '@deepseek-ai/cordis' {
    interface Context {
        accessRegistry: AccessRegistryService;
    }
}
```

## 声明文件 `identity.d.ts`

```ts
import type { LoginIdentity, Principal } from './contribution.ts';
export type IdentityFailure = {
    readonly outcome: 'denied' | 'basis-unavailable';
};
export type LoginResult = {
    readonly outcome: 'identified';
    readonly login: LoginIdentity;
} | IdentityFailure;
export type ActForResult = {
    readonly outcome: 'issued';
    readonly principal: Principal;
} | IdentityFailure;
export type AccessIdentity = {
    readonly identifyLogin: (proof: string) => Promise<LoginResult>;
    readonly actFor: (login: LoginIdentity, tenant: string) => Promise<ActForResult>;
    readonly reportAccess: (login: LoginIdentity) => Promise<void>;
};
```

## 声明文件 `index.d.ts`

```ts
export { AccessAssemblyError } from './contribution.ts';
export type { AccessContribution, AnswerOf, BodyOf, CallContext, EndOf, FrameOf, FrameSource, LoginIdentity, ObservationContext, OpenOf, OperationHandler, Principal, PrincipalFor, ProtocolKey, } from './contribution.ts';
export type { AccessIdentity, ActForResult, IdentityFailure, LoginResult } from './identity.ts';
```
