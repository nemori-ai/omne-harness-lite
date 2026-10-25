# @omne-harness/kernel-basis 的 API 快照

<!-- omne-contract-api 快照格式 1 -->

> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。

## 入口 `.` · `index.d.ts`

（无）

## 入口 `./cordis` · `cordis.d.ts`

- `DefinedPlugin` · `cordis.d.ts`
- `SchemaFailure` · `cordis.d.ts`
- `SchemaSuccess` · `cordis.d.ts`
- `StandardSchema` · `cordis.d.ts`
- `definePlugin` · `cordis.d.ts`
- `resolveOptional` · `cordis.d.ts`

## 入口 `./testing` · `testing.d.ts`

- `TestAssembly` · `testing.d.ts`
- `TestAssemblyDisposeFailed` · `testing.d.ts`
- `TestAssemblyStartFailed` · `testing.d.ts`
- `TestPlugin` · `testing.d.ts`
- `startTestAssembly` · `testing.d.ts`

## 声明文件 `cordis.d.ts`

```ts
import type { Context } from '@deepseek-ai/cordis';
export type SchemaSuccess<Output> = {
    readonly value: Output;
};
export type SchemaFailure = {
    readonly issues: readonly {
        readonly message: string;
    }[];
};
export type StandardSchema<Output> = {
    readonly '~standard': {
        readonly version: 1;
        readonly vendor: string;
        readonly validate: (value: unknown) => SchemaSuccess<Output> | SchemaFailure | Promise<SchemaSuccess<Output> | SchemaFailure>;
    };
};
export type DefinedPlugin<Output> = {
    name: string;
    Config: StandardSchema<Output>;
    inject?: readonly string[];
    apply: (ctx: Context, config: Output) => void | Promise<void>;
};
export declare function definePlugin<Output>(input: DefinedPlugin<Output>): DefinedPlugin<Output>;
export declare function resolveOptional<T>(ctx: Context, name: string): T | undefined;
```

## 声明文件 `index.d.ts`

```ts
export {};
```

## 声明文件 `testing.d.ts`

```ts
import { Context } from '@deepseek-ai/cordis';
export type TestPlugin = {
    name: string;
    inject?: readonly string[];
    apply: (ctx: Context) => void | Promise<void>;
};
export type TestAssembly = {
    context: Context;
    dispose: () => Promise<void>;
};
export declare class TestAssemblyStartFailed extends Error {
    readonly startError: unknown;
    readonly disposeErrors: readonly unknown[];
    constructor(startError: unknown, disposeErrors: readonly unknown[]);
}
export declare class TestAssemblyDisposeFailed extends Error {
    readonly disposeErrors: readonly unknown[];
    constructor(disposeErrors: readonly unknown[]);
}
export declare function startTestAssembly(plugins: readonly TestPlugin[]): Promise<TestAssembly>;
```
