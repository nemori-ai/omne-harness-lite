# @omne-harness/content-block 的 API 快照

> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。

## 入口 `.`

### `BlockId`

```ts
type BlockId = string & {
    readonly [blockIdBrand]: true;
};
```

### `BlockIdentityJudgment`

```ts
type BlockIdentityJudgment = {
    readonly ok: {
        readonly id: BlockId;
        readonly visibility: Visibility;
    };
} | {
    readonly rejected: BlockIdentityRejection;
};
```

### `BlockIdentityRejection`

```ts
type BlockIdentityRejection = 'extra' | 'id' | 'visibility';
```

### `CONTENT_BLOCK_HEAD_KEYS`

```ts
const CONTENT_BLOCK_HEAD_KEYS: Readonly<Record<ContentBlockKind, readonly string[]>>;
```

### `CONTENT_BLOCK_KINDS`

```ts
const CONTENT_BLOCK_KINDS: readonly [
    'text',
    'thinking',
    'voice',
    'image',
    'file'
];
```

### `ContentBlock`

```ts
type ContentBlock = TextContentBlock | ThinkingContentBlock | MediaContentBlock | FileContentBlock | ReferenceContentBlock;
```

### `ContentBlockJudgment`

```ts
type ContentBlockJudgment = {
    readonly ok: ContentBlock;
} | {
    readonly rejected: ContentBlockRejection;
};
```

### `ContentBlockKind`

```ts
type ContentBlockKind = (typeof CONTENT_BLOCK_KINDS)[number];
```

### `ContentBlockRejection`

```ts
type ContentBlockRejection = 'kind' | 'extra' | 'id' | 'visibility' | 'text' | 'media' | 'file' | 'ref' | 'storage' | 'key' | 'mediaType' | 'bytes' | 'digest' | 'transcript';
```

### `ContentReference`

```ts
type ContentReference = Readonly<{
    storage: string;
    key: string;
    mediaType: string;
    bytes: string;
    digest: string;
}>;
```

### `FileContentBlock`

```ts
interface FileContentBlock {
    readonly kind: 'file';
    readonly id: BlockId;
    readonly visibility: Visibility;
    readonly storage: string;
    readonly key: string;
    readonly mediaType: string;
}
```

### `MediaContentBlock`

```ts
interface MediaContentBlock {
    readonly kind: 'voice' | 'image';
    readonly id: BlockId;
    readonly visibility: Visibility;
    readonly mediaType: string;
    readonly inline: string;
}
```

### `ReferenceContentBlock`

```ts
type ReferenceContentBlock = Readonly<{
    kind: 'voice' | 'image' | 'file';
    id: BlockId;
    visibility: Visibility;
    ref: ContentReference;
    transcript: string | null;
}>;
```

### `TextContentBlock`

```ts
interface TextContentBlock {
    readonly kind: 'text';
    readonly id: BlockId;
    readonly visibility: Visibility;
    readonly text: string;
}
```

### `ThinkingContentBlock`

```ts
interface ThinkingContentBlock {
    readonly kind: 'thinking';
    readonly id: BlockId;
    readonly visibility: Visibility;
    readonly text: string;
}
```

### `Visibility`

```ts
interface Visibility {
    readonly toHuman: boolean;
    readonly toModel: boolean;
}
```

### `judgeBlockIdentity`

```ts
function judgeBlockIdentity(value: unknown): BlockIdentityJudgment;
```

### `judgeContentBlock`

```ts
function judgeContentBlock(value: unknown): ContentBlockJudgment;
```

## 内部引用

（无）
