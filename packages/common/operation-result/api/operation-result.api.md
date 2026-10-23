# @omne-harness/operation-result 的 API 快照

> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。

## 入口 `.`

### `Ack`

```ts
type Ack<F> = {
    ok: true;
} | {
    failure: F;
};
```

### `Outcome`

```ts
type Outcome<T, F> = {
    ok: T;
} | {
    failure: F;
};
```

### `ack`

```ts
function ack<F = never>(): Ack<F>;
```

### `fail`

```ts
function fail<F>(failure: F): Outcome<never, F>;
```

### `isSuccess`

```ts
function isSuccess<T, F>(result: Outcome<T, F> | Ack<F>): result is {
    ok: T;
} | {
    ok: true;
};
```

### `succeed`

```ts
function succeed<T>(value: T): Outcome<T, never>;
```

## 内部引用

（无）
