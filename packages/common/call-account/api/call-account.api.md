# @omne-harness/call-account 的 API 快照

> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。

## 入口 `.`

### `AccountRejection`

```ts
type AccountRejection = 'extra' | 'subject' | 'usage' | 'cost' | 'trimmed' | 'place' | 'duration' | 'receipt' | 'revision' | 'lexeme' | 'precision' | 'unit' | 'source';
```

### `AccountResult`

```ts
type AccountResult = {
    readonly ok: CallAccount;
} | {
    readonly rejected: AccountRejection;
};
```

### `Amount`

```ts
type Amount = {
    readonly state: 'unknown';
    readonly unit: string;
} | {
    readonly state: 'known' | 'provisional';
    readonly lexeme: string;
    readonly unit: string;
};
```

### `COST_SOURCES`

```ts
const COST_SOURCES: readonly [
    'supplier',
    'observation',
    'billable',
    'ledger'
];
```

### `CallAccount`

```ts
type CallAccount = {
    readonly subject: {
        readonly kind: SubjectKind;
        readonly id: string;
    };
    readonly usage: readonly UsageItem[];
    readonly cost: readonly CostItem[];
    readonly trimmed: Amount;
    readonly place: string;
    readonly duration: string | {
        readonly state: 'unknown';
    };
    readonly receipt: 'received' | 'late';
    readonly revision: string;
};
```

### `CostItem`

```ts
type CostItem = Amount & {
    readonly source: CostSource;
};
```

### `CostSource`

```ts
type CostSource = (typeof COST_SOURCES)[number];
```

### `PayableResult`

```ts
type PayableResult = {
    readonly ok: {
        readonly state: 'known';
        readonly lexeme: string;
        readonly unit: string;
    };
} | {
    readonly ok: {
        readonly state: 'unknown';
    };
} | {
    readonly rejected: AccountRejection;
};
```

### `SUBJECT_KINDS`

```ts
const SUBJECT_KINDS: readonly [
    'model_call',
    'tool_execution'
];
```

### `SubjectKind`

```ts
type SubjectKind = (typeof SUBJECT_KINDS)[number];
```

### `SubtotalResult`

```ts
type SubtotalResult = {
    readonly ok: {
        readonly state: 'known';
        readonly lexeme: string;
        readonly unit: string;
    };
} | {
    readonly ok: {
        readonly state: 'unknown';
    };
} | {
    readonly rejected: AccountRejection;
};
```

### `UsageItem`

```ts
type UsageItem = Amount & {
    readonly name: string;
};
```

### `admitRevision`

```ts
function admitRevision(previous: unknown, next: unknown): AccountResult;
```

### `canonicalAccount`

```ts
function canonicalAccount(account: CallAccount): string;
```

### `judgeCallAccount`

```ts
function judgeCallAccount(value: unknown): AccountResult;
```

### `payableAmount`

```ts
function payableAmount(account: unknown): PayableResult;
```

### `sourceSubtotal`

```ts
function sourceSubtotal(account: unknown, source: unknown): SubtotalResult;
```

## 内部引用

（无）
