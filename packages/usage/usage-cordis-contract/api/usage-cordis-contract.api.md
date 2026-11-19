# @omne-harness/usage-cordis-contract 的 API 快照

<!-- omne-contract-api 快照格式 1 -->

> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。

## 入口 `.` · `index.d.ts`

- `UsageRegistration` · `index.d.ts`
- `UsageSources` · `index.d.ts`

## 入口 `./cordis` · `cordis.d.ts`

- `UsageService` · `cordis.d.ts`
- `UsageSessionScopeService` · `cordis.d.ts`
- `UsageSourcesService` · `cordis.d.ts`
- `usageKey` · `cordis.d.ts`
- `usageSessionScopeKey` · `cordis.d.ts`
- `usageSourcesKey` · `cordis.d.ts`

## 声明文件 `cordis.d.ts`

```ts
import { Service, type Context as CordisContext } from '@deepseek-ai/cordis';
import type { Usage, UsageSessionScope } from '@omne-harness/usage-contract';
import type { UsageSources } from './index.ts';
export declare abstract class UsageService<P> extends Service implements Usage<P> {
    static readonly provide = "usage";
    constructor(ctx: CordisContext);
    abstract readonly query: Usage<P>['query'];
    abstract readonly records: Usage<P>['records'];
    abstract readonly occupancy: Usage<P>['occupancy'];
}
export declare const usageKey = "usage";
export declare abstract class UsageSourcesService<P> extends Service implements UsageSources<P> {
    static readonly provide = "usageSources";
    constructor(ctx: CordisContext);
    abstract readonly register: UsageSources<P>['register'];
    abstract readonly current: UsageSources<P>['current'];
}
export declare const usageSourcesKey = "usageSources";
export declare abstract class UsageSessionScopeService<P> extends Service implements UsageSessionScope<P> {
    static readonly provide = "usageSessionScope";
    constructor(ctx: CordisContext);
    abstract readonly resolve: UsageSessionScope<P>['resolve'];
}
export declare const usageSessionScopeKey = "usageSessionScope";
declare module '@deepseek-ai/cordis' {
    interface Context {
        usage: UsageService<unknown>;
        usageSources: UsageSourcesService<unknown>;
        usageSessionScope: UsageSessionScopeService<unknown>;
    }
}
```

## 声明文件 `index.d.ts`

```ts
import type { UsageSource } from '@omne-harness/usage-contract';
export type UsageRegistration = Readonly<{
    kind: 'registered';
    withdraw(): void;
}> | Readonly<{
    kind: 'conflict';
    name: string;
}>;
export interface UsageSources<P> {
    register(source: UsageSource<P>): UsageRegistration;
    current(): readonly UsageSource<P>[];
}
```
