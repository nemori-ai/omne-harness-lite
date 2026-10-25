# @omne-harness/call-account 的 API 快照

<!-- omne-contract-api 快照格式 1 -->

> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。

## 入口 `.` · `index.d.ts`

- `AccountRejection` · `index.d.ts`
- `AccountResult` · `index.d.ts`
- `Amount` · `index.d.ts`
- `COST_SOURCES` · `index.d.ts`
- `CallAccount` · `index.d.ts`
- `CostItem` · `index.d.ts`
- `CostSource` · `index.d.ts`
- `PayableResult` · `index.d.ts`
- `SUBJECT_KINDS` · `index.d.ts`
- `SubjectKind` · `index.d.ts`
- `SubtotalResult` · `index.d.ts`
- `UsageItem` · `index.d.ts`
- `admitRevision` · `index.d.ts`
- `canonicalAccount` · `index.d.ts`
- `judgeCallAccount` · `index.d.ts`
- `payableAmount` · `index.d.ts`
- `sourceSubtotal` · `index.d.ts`

## 声明文件 `decimal.d.ts`

```ts
export type Decimal = {
    readonly coefficient: bigint;
    readonly exponent: bigint;
};
export type LexemeFailure = 'lexeme' | 'precision';
export declare function parseLexeme(lexeme: string, unit: string): Decimal | LexemeFailure;
export declare function addDecimals(left: Decimal, right: Decimal): Decimal;
export declare function formatDecimal(value: Decimal): string;
```

## 声明文件 `index.d.ts`

```ts
export declare const COST_SOURCES: readonly [
    'supplier',
    'observation',
    'billable',
    'ledger'
];
export type CostSource = (typeof COST_SOURCES)[number];
export declare const SUBJECT_KINDS: readonly [
    'model_call',
    'tool_execution'
];
export type SubjectKind = (typeof SUBJECT_KINDS)[number];
export type Amount = {
    readonly state: 'unknown';
    readonly unit: string;
} | {
    readonly state: 'known' | 'provisional';
    readonly lexeme: string;
    readonly unit: string;
};
export type UsageItem = Amount & {
    readonly name: string;
};
export type CostItem = Amount & {
    readonly source: CostSource;
};
export type CallAccount = {
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
export type AccountRejection = 'extra' | 'subject' | 'usage' | 'cost' | 'trimmed' | 'place' | 'duration' | 'receipt' | 'revision' | 'lexeme' | 'precision' | 'unit' | 'source';
export type AccountResult = {
    readonly ok: CallAccount;
} | {
    readonly rejected: AccountRejection;
};
export type SubtotalResult = {
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
export type PayableResult = {
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
export declare function judgeCallAccount(value: unknown): AccountResult;
export declare function admitRevision(previous: unknown, next: unknown): AccountResult;
export declare function sourceSubtotal(account: unknown, source: unknown): SubtotalResult;
export declare function payableAmount(account: unknown): PayableResult;
export declare function canonicalAccount(account: CallAccount): string;
```
