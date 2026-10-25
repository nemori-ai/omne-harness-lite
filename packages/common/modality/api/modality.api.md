# @omne-harness/modality 的 API 快照

<!-- omne-contract-api 快照格式 1 -->

> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。

## 入口 `.` · `index.d.ts`

- `MODALITIES` · `index.d.ts`
- `MediaTypeJudgment` · `index.d.ts`
- `ModalitiesJudgment` · `index.d.ts`
- `Modality` · `index.d.ts`
- `ModalityJudgment` · `index.d.ts`
- `isCanonicalMediaType` · `index.d.ts`
- `judgeMediaType` · `index.d.ts`
- `judgeModalities` · `index.d.ts`
- `judgeModality` · `index.d.ts`
- `missingModalities` · `index.d.ts`

## 声明文件 `index.d.ts`

```ts
export type Modality = 'text' | 'image' | 'voice' | 'video';
export declare const MODALITIES: readonly Modality[];
export type ModalityJudgment = {
    ok: Modality;
} | {
    rejected: 'type' | 'modality';
};
export type ModalitiesJudgment = {
    ok: readonly Modality[];
} | {
    rejected: 'type' | 'modality' | 'duplicate';
    index: number | null;
};
export type MediaTypeJudgment = {
    ok: {
        mediaType: string;
        modality: Modality | null;
    };
} | {
    rejected: 'type' | 'media-type';
};
export declare function judgeModality(value: unknown): ModalityJudgment;
export declare function judgeModalities(value: unknown): ModalitiesJudgment;
export declare function judgeMediaType(value: unknown): MediaTypeJudgment;
export declare function isCanonicalMediaType(value: string): boolean;
export declare function missingModalities(required: readonly Modality[], available: readonly Modality[]): readonly Modality[];
```
