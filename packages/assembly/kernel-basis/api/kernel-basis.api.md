# @omne-harness/kernel-basis 的 API 快照

> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。

## 入口 `.`

（无）

## 入口 `./cordis`

### `DefinedPlugin`

```ts
type DefinedPlugin<Output> = {
    name: string;
    Config: StandardSchema<Output>;
    inject?: readonly string[];
    apply: (ctx: Context, config: Output) => void | Promise<void>;
};
```

### `SchemaFailure`

```ts
type SchemaFailure = {
    readonly issues: readonly {
        readonly message: string;
    }[];
};
```

### `SchemaSuccess`

```ts
type SchemaSuccess<Output> = {
    readonly value: Output;
};
```

### `StandardSchema`

```ts
type StandardSchema<Output> = {
    readonly '~standard': {
        readonly version: 1;
        readonly vendor: string;
        readonly validate: (value: unknown) => SchemaSuccess<Output> | SchemaFailure | Promise<SchemaSuccess<Output> | SchemaFailure>;
    };
};
```

### `definePlugin`

```ts
function definePlugin<Output>(input: DefinedPlugin<Output>): DefinedPlugin<Output>;
```

### `resolveOptional`

```ts
function resolveOptional<T>(ctx: Context, name: string): T | undefined;
```

## 入口 `./testing`

### `TestAssembly`

```ts
type TestAssembly = {
    context: Context;
    dispose: () => Promise<void>;
};
```

### `TestAssemblyDisposeFailed`

```ts
class TestAssemblyDisposeFailed extends Error {
    readonly disposeErrors: readonly unknown[];
    constructor(disposeErrors: readonly unknown[]);
}
```

### `TestAssemblyStartFailed`

```ts
class TestAssemblyStartFailed extends Error {
    readonly startError: unknown;
    readonly disposeErrors: readonly unknown[];
    constructor(startError: unknown, disposeErrors: readonly unknown[]);
}
```

### `TestPlugin`

```ts
type TestPlugin = {
    name: string;
    inject?: readonly string[];
    apply: (ctx: Context) => void | Promise<void>;
};
```

### `startTestAssembly`

```ts
function startTestAssembly(plugins: readonly TestPlugin[]): Promise<TestAssembly>;
```

## 内部引用

（无）
