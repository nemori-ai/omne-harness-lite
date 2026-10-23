# @omne-harness/modality 的 API 快照

> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。

## 入口 `.`

### `MODALITIES`

```ts
const MODALITIES: readonly Modality[];
```

### `MediaTypeJudgment`

```ts
type MediaTypeJudgment = {
    ok: {
        mediaType: string;
        modality: Modality | null;
    };
} | {
    rejected: 'type' | 'media-type';
};
```

### `ModalitiesJudgment`

```ts
type ModalitiesJudgment = {
    ok: readonly Modality[];
} | {
    rejected: 'type' | 'modality' | 'duplicate';
    index: number | null;
};
```

### `Modality`

```ts
type Modality = 'text' | 'image' | 'voice' | 'video';
```

### `ModalityJudgment`

```ts
type ModalityJudgment = {
    ok: Modality;
} | {
    rejected: 'type' | 'modality';
};
```

### `isCanonicalMediaType`

```ts
function isCanonicalMediaType(value: string): boolean;
```

### `judgeMediaType`

```ts
function judgeMediaType(value: unknown): MediaTypeJudgment;
```

### `judgeModalities`

```ts
function judgeModalities(value: unknown): ModalitiesJudgment;
```

### `judgeModality`

```ts
function judgeModality(value: unknown): ModalityJudgment;
```

### `missingModalities`

```ts
function missingModalities(required: readonly Modality[], available: readonly Modality[]): readonly Modality[];
```

## 内部引用

（无）
