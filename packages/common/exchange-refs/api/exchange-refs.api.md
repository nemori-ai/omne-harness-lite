# @omne-harness/exchange-refs 的 API 快照

<!-- omne-contract-api 快照格式 1 -->

> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。

## 入口 `.` · `index.d.ts`

- `Adoption` · `index.d.ts`
- `ConsumerRef` · `index.d.ts`
- `DurableEvidence` · `index.d.ts`

## 声明文件 `index.d.ts`

```ts
export type Adoption = Readonly<{
    owner: string;
    name: string;
    revision: string;
    digest: string;
}>;
export type DurableEvidence = Readonly<{
    owner: string;
    record: string;
    revision: string;
    digest: string;
}>;
export type ConsumerRef = Readonly<{
    owner: string;
    work: string;
    position: string;
    purpose: string;
}>;
```
