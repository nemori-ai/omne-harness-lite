# @omne-harness/operation-result 的 API 快照

<!-- omne-contract-api 快照格式 1 -->

> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。

## 入口 `.` · `index.d.ts`

- `Ack` · `index.d.ts`
- `Outcome` · `index.d.ts`
- `ack` · `index.d.ts`
- `fail` · `index.d.ts`
- `isSuccess` · `index.d.ts`
- `succeed` · `index.d.ts`

## 声明文件 `index.d.ts`

```ts
export type Outcome<T, F> = {
    ok: T;
} | {
    failure: F;
};
export type Ack<F> = {
    ok: true;
} | {
    failure: F;
};
export declare function succeed<T>(value: T): Outcome<T, never>;
export declare function ack<F = never>(): Ack<F>;
export declare function fail<F>(failure: F): Outcome<never, F>;
export declare function isSuccess<T, F>(result: Outcome<T, F> | Ack<F>): result is {
    ok: T;
} | {
    ok: true;
};
```
