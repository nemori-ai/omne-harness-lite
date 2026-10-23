# @omne-harness/json-text 的 API 快照

> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。

## 入口 `.`

### `JsonBudgetName`

```ts
type JsonBudgetName = 'bytes' | 'depth' | 'items' | 'members' | 'string' | 'number';
```

### `JsonEntry`

```ts
type JsonEntry = {
    readonly key: string;
    readonly value: JsonValue;
};
```

### `JsonFailure`

```ts
type JsonFailure = {
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
```

### `JsonLimits`

```ts
type JsonLimits = {
    readonly maxBytes: number;
    readonly maxDepth: number;
    readonly maxItems: number;
    readonly maxMembers: number;
    readonly maxStringLength: number;
    readonly maxNumberLength: number;
};
```

### `JsonPathSegment`

```ts
type JsonPathSegment = string | number;
```

### `JsonRead`

```ts
type JsonRead = {
    readonly kind: 'ok';
    readonly value: JsonValue;
} | JsonFailure;
```

### `JsonSyntaxReason`

```ts
type JsonSyntaxReason = 'comment' | 'trailing-comma' | 'token' | 'truncated' | 'trailing-content';
```

### `JsonTreePath`

```ts
type JsonTreePath = readonly (string | number)[];
```

### `JsonValue`

```ts
type JsonValue = {
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
```

### `JsonValueJudgment`

```ts
type JsonValueJudgment = {
    readonly ok: JsonValue;
} | {
    readonly rejected: 'missing' | 'type' | 'value' | 'unknown-field' | 'duplicate' | 'cycle' | 'budget' | 'accessor' | 'unreadable';
    readonly path: JsonTreePath;
};
```

### `judgeJsonValue`

```ts
function judgeJsonValue(value: unknown, limits?: Readonly<{
    maxVisits: number;
}>): JsonValueJudgment;
```

### `readJsonBytes`

```ts
function readJsonBytes(bytes: Uint8Array, limits: JsonLimits): JsonRead;
```

### `readJsonText`

```ts
function readJsonText(text: string, limits: JsonLimits): JsonRead;
```

### `writeJsonText`

```ts
function writeJsonText(value: JsonValue): string;
```

## 内部引用

（无）
