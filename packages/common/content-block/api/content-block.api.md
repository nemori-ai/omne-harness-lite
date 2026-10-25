# @omne-harness/content-block 的 API 快照

<!-- omne-contract-api 快照格式 1 -->

> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。

## 入口 `.` · `index.d.ts`

- `BlockId` · `index.d.ts`
- `BlockIdentityJudgment` · `index.d.ts`
- `BlockIdentityRejection` · `index.d.ts`
- `CONTENT_BLOCK_HEAD_KEYS` · `index.d.ts`
- `CONTENT_BLOCK_KINDS` · `index.d.ts`
- `ContentBlock` · `index.d.ts`
- `ContentBlockJudgment` · `index.d.ts`
- `ContentBlockKind` · `index.d.ts`
- `ContentBlockRejection` · `index.d.ts`
- `ContentReference` · `index.d.ts`
- `FileContentBlock` · `index.d.ts`
- `MediaContentBlock` · `index.d.ts`
- `ReferenceContentBlock` · `index.d.ts`
- `TextContentBlock` · `index.d.ts`
- `ThinkingContentBlock` · `index.d.ts`
- `Visibility` · `index.d.ts`
- `judgeBlockIdentity` · `index.d.ts`
- `judgeContentBlock` · `index.d.ts`

## 声明文件 `index.d.ts`

```ts
export declare const CONTENT_BLOCK_KINDS: readonly [
    'text',
    'thinking',
    'voice',
    'image',
    'file'
];
export type ContentBlockKind = (typeof CONTENT_BLOCK_KINDS)[number];
declare const blockIdBrand: unique symbol;
export type BlockId = string & {
    readonly [blockIdBrand]: true;
};
export interface Visibility {
    readonly toHuman: boolean;
    readonly toModel: boolean;
}
export interface TextContentBlock {
    readonly kind: 'text';
    readonly id: BlockId;
    readonly visibility: Visibility;
    readonly text: string;
}
export interface ThinkingContentBlock {
    readonly kind: 'thinking';
    readonly id: BlockId;
    readonly visibility: Visibility;
    readonly text: string;
}
export interface MediaContentBlock {
    readonly kind: 'voice' | 'image';
    readonly id: BlockId;
    readonly visibility: Visibility;
    readonly mediaType: string;
    readonly inline: string;
}
export interface FileContentBlock {
    readonly kind: 'file';
    readonly id: BlockId;
    readonly visibility: Visibility;
    readonly storage: string;
    readonly key: string;
    readonly mediaType: string;
}
export type ContentReference = Readonly<{
    storage: string;
    key: string;
    mediaType: string;
    bytes: string;
    digest: string;
}>;
export type ReferenceContentBlock = Readonly<{
    kind: 'voice' | 'image' | 'file';
    id: BlockId;
    visibility: Visibility;
    ref: ContentReference;
    transcript: string | null;
}>;
export type ContentBlock = TextContentBlock | ThinkingContentBlock | MediaContentBlock | FileContentBlock | ReferenceContentBlock;
export type ContentBlockRejection = 'kind' | 'extra' | 'id' | 'visibility' | 'text' | 'media' | 'file' | 'ref' | 'storage' | 'key' | 'mediaType' | 'bytes' | 'digest' | 'transcript';
export type ContentBlockJudgment = {
    readonly ok: ContentBlock;
} | {
    readonly rejected: ContentBlockRejection;
};
export declare const CONTENT_BLOCK_HEAD_KEYS: Readonly<Record<ContentBlockKind, readonly string[]>>;
export type BlockIdentityRejection = 'extra' | 'id' | 'visibility';
export type BlockIdentityJudgment = {
    readonly ok: {
        readonly id: BlockId;
        readonly visibility: Visibility;
    };
} | {
    readonly rejected: BlockIdentityRejection;
};
export declare function judgeBlockIdentity(value: unknown): BlockIdentityJudgment;
export declare function judgeContentBlock(value: unknown): ContentBlockJudgment;
export {};
```
