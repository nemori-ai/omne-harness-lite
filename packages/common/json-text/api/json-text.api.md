# @omne-harness/json-text 的 API 快照

<!-- omne-contract-api 快照格式 1 -->

> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。

## 入口 `.` · `index.d.ts`

- `JsonBudgetName` · `types.d.ts`
- `JsonEntry` · `types.d.ts`
- `JsonFailure` · `types.d.ts`
- `JsonLimits` · `types.d.ts`
- `JsonPathSegment` · `types.d.ts`
- `JsonRead` · `types.d.ts`
- `JsonSyntaxReason` · `types.d.ts`
- `JsonTreePath` · `types.d.ts`
- `JsonValue` · `types.d.ts`
- `JsonValueJudgment` · `types.d.ts`
- `judgeJsonValue` · `judge.d.ts`
- `readJsonBytes` · `read.d.ts`
- `readJsonText` · `read.d.ts`
- `writeJsonText` · `write.d.ts`

## 声明文件 `index.d.ts`

```ts
export { judgeJsonValue } from './judge.ts';
export { readJsonBytes, readJsonText } from './read.ts';
export { writeJsonText } from './write.ts';
export type { JsonBudgetName, JsonEntry, JsonFailure, JsonLimits, JsonPathSegment, JsonRead, JsonSyntaxReason, JsonTreePath, JsonValue, JsonValueJudgment, } from './types.ts';
```

## 声明文件 `judge.d.ts`

```ts
import type { JsonValueJudgment } from './types.ts';
export declare function judgeJsonValue(value: unknown, limits?: Readonly<{
    maxVisits: number;
}>): JsonValueJudgment;
```

## 声明文件 `key-set.d.ts`

```ts
export declare class KeySet {
    private readonly short;
    private readonly long;
    size: number;
    private readonly digestOf;
    constructor(digestOf?: (key: string) => string);
    add(key: string): boolean;
}
```

## 声明文件 `read.d.ts`

```ts
import type { JsonLimits, JsonRead } from './types.ts';
export declare function readJsonBytes(bytes: Uint8Array, limits: JsonLimits): JsonRead;
export declare function readJsonText(text: string, limits: JsonLimits): JsonRead;
export declare const RFC_8259_NUMBER: RegExp;
```

## 声明文件 `types.d.ts`

```ts
export type JsonLimits = {
    readonly maxBytes: number;
    readonly maxDepth: number;
    readonly maxItems: number;
    readonly maxMembers: number;
    readonly maxStringLength: number;
    readonly maxNumberLength: number;
};
export type JsonValue = {
    readonly kind: 'null';
} | {
    readonly kind: 'boolean';
    readonly value: boolean;
} | {
    readonly kind: 'string';
    readonly value: string;
} | {
    readonly kind: 'number';
    readonly lexeme: string;
} | {
    readonly kind: 'array';
    readonly items: readonly JsonValue[];
} | {
    readonly kind: 'object';
    readonly entries: readonly JsonEntry[];
};
export type JsonEntry = {
    readonly key: string;
    readonly value: JsonValue;
};
export type JsonRead = {
    readonly kind: 'ok';
    readonly value: JsonValue;
} | JsonFailure;
export type JsonFailure = {
    readonly kind: 'utf8';
} | {
    readonly kind: 'bom';
} | {
    readonly kind: 'empty';
} | {
    readonly kind: 'syntax';
    readonly reason: JsonSyntaxReason;
} | {
    readonly kind: 'duplicate-key';
    readonly path: readonly JsonPathSegment[];
    readonly key: string;
} | {
    readonly kind: 'budget';
    readonly name: JsonBudgetName;
};
export type JsonSyntaxReason = 'comment' | 'trailing-comma' | 'token' | 'truncated' | 'trailing-content';
export type JsonBudgetName = 'bytes' | 'depth' | 'items' | 'members' | 'string' | 'number';
export type JsonPathSegment = string | number;
export type JsonTreePath = readonly (string | number)[];
export type JsonValueJudgment = {
    readonly ok: JsonValue;
} | {
    readonly rejected: 'missing' | 'type' | 'value' | 'unknown-field' | 'duplicate' | 'cycle' | 'budget' | 'accessor' | 'unreadable';
    readonly path: JsonTreePath;
};
```

## 声明文件 `write.d.ts`

```ts
import type { JsonValue } from './types.ts';
export declare function writeJsonText(value: JsonValue): string;
```
