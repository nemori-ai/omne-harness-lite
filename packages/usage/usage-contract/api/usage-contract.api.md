# @omne-harness/usage-contract 的 API 快照

<!-- omne-contract-api 快照格式 1 -->

> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。

## 入口 `.` · `index.d.ts`

- `CheckedUsageQuery` · `check.d.ts`
- `ContextOccupancy` · `values.d.ts`
- `TOKEN_KINDS` · `values.d.ts`
- `TokenKind` · `values.d.ts`
- `USAGE_BUCKETS` · `values.d.ts`
- `USAGE_DIMENSIONS` · `values.d.ts`
- `Usage` · `ports.d.ts`
- `UsageBucket` · `values.d.ts`
- `UsageBucketResult` · `values.d.ts`
- `UsageCell` · `values.d.ts`
- `UsageConsumer` · `values.d.ts`
- `UsageCost` · `values.d.ts`
- `UsageCoverage` · `values.d.ts`
- `UsageDependency` · `ports.d.ts`
- `UsageDimension` · `values.d.ts`
- `UsageDistribution` · `values.d.ts`
- `UsageEdge` · `check.d.ts`
- `UsageFact` · `values.d.ts`
- `UsageFailure` · `ports.d.ts`
- `UsageInstant` · `values.d.ts`
- `UsageMeasures` · `values.d.ts`
- `UsagePortFailure` · `ports.d.ts`
- `UsageQuery` · `values.d.ts`
- `UsageRatio` · `values.d.ts`
- `UsageRecordPage` · `values.d.ts`
- `UsageRecordsQuery` · `values.d.ts`
- `UsageReply` · `ports.d.ts`
- `UsageResult` · `values.d.ts`
- `UsageScope` · `values.d.ts`
- `UsageSessionScope` · `ports.d.ts`
- `UsageSource` · `ports.d.ts`
- `UsageSourcePage` · `ports.d.ts`
- `UsageSum` · `values.d.ts`
- `addLexemes` · `decimal.d.ts`
- `checkUsageQuery` · `check.d.ts`
- `edgesOf` · `check.d.ts`
- `fold` · `fold.d.ts`
- `occupancyOf` · `occupancy.d.ts`

## 声明文件 `check.d.ts`

```ts
import { type Outcome } from '@omne-harness/operation-result';
import type { UsageFailure } from './ports.ts';
import { type UsageBucket, type UsageInstant, type UsageQuery } from './values.ts';
export type UsageEdge = Readonly<{
    start: number;
    end: number;
}>;
export type CheckedUsageQuery = UsageQuery & Readonly<{
    edges: readonly UsageEdge[];
}>;
export declare function edgesOf(from: number, to: number, zone: string, bucket: UsageBucket, limit: number): readonly UsageEdge[] | null;
export declare function checkUsageQuery(query: UsageQuery, limits: Readonly<{
    buckets: number;
}>): Outcome<CheckedUsageQuery, UsageFailure>;
export declare const instantText: (at: number) => UsageInstant;
```

## 声明文件 `decimal.d.ts`

```ts
export type Decimal = Readonly<{
    digits: bigint;
    places: number;
}>;
export declare const ZERO: Decimal;
export declare function decimalOf(lexeme: string): Decimal;
export declare function plus(a: Decimal, b: Decimal): Decimal;
export declare function lexemeOf(value: Decimal): string;
export declare const addLexemes: (left: string, right: string) => string;
export declare const numberOf: (value: Decimal) => number;
```

## 声明文件 `fold.d.ts`

```ts
import { type CheckedUsageQuery } from './check.ts';
import { type UsageFact, type UsageResult } from './values.ts';
export declare function fold(facts: readonly UsageFact[], query: CheckedUsageQuery, read: Readonly<{
    sources: readonly string[];
    undated: number;
}>): UsageResult;
```

## 声明文件 `index.d.ts`

```ts
export { TOKEN_KINDS, USAGE_BUCKETS, USAGE_DIMENSIONS, type ContextOccupancy, type TokenKind, type UsageBucket, type UsageBucketResult, type UsageCell, type UsageConsumer, type UsageCost, type UsageCoverage, type UsageDimension, type UsageDistribution, type UsageFact, type UsageInstant, type UsageMeasures, type UsageQuery, type UsageRatio, type UsageRecordPage, type UsageRecordsQuery, type UsageResult, type UsageScope, type UsageSum, } from './values.ts';
export type { Usage, UsageDependency, UsageFailure, UsagePortFailure, UsageReply, UsageSessionScope, UsageSource, UsageSourcePage, } from './ports.ts';
export { checkUsageQuery, edgesOf, type CheckedUsageQuery, type UsageEdge } from './check.ts';
export { addLexemes } from './decimal.ts';
export { fold } from './fold.ts';
export { occupancyOf } from './occupancy.ts';
```

## 声明文件 `occupancy.d.ts`

```ts
import type { ContextOccupancy, UsageFact } from './values.ts';
export declare function occupancyOf(facts: readonly UsageFact[]): ContextOccupancy;
```

## 声明文件 `ports.d.ts`

```ts
import type { Access } from '@omne-harness/legal-identity';
import type { Outcome } from '@omne-harness/operation-result';
import type { ContextOccupancy, UsageConsumer, UsageFact, UsageInstant, UsageQuery, UsageRecordPage, UsageRecordsQuery, UsageResult } from './values.ts';
export type UsageDependency = Readonly<{
    kind: 'source';
    name: string;
}> | Readonly<{
    kind: 'session-scope';
}>;
export type UsageFailure = Readonly<{
    kind: 'invalid';
    field: 'scope' | 'range' | 'zone' | 'bucket' | 'groupBy' | 'limit' | 'after';
    reason: string;
}> | Readonly<{
    kind: 'unsupported';
    field: 'scope';
}> | Readonly<{
    kind: 'not-found';
    what: 'session';
}> | Readonly<{
    kind: 'denied';
    dependency: UsageDependency;
}> | Readonly<{
    kind: 'unavailable';
    dependency: UsageDependency;
    diagnostic: string;
}> | Readonly<{
    kind: 'too-large';
    limit: 'buckets' | 'pages';
}>;
export type UsageReply<T> = Promise<Outcome<T, UsageFailure>>;
export type UsagePortFailure = Readonly<{
    kind: 'denied';
}> | Readonly<{
    kind: 'unavailable';
    diagnostic: string;
}>;
export type UsageSourcePage = Readonly<{
    entries: readonly UsageFact[];
    undated: number;
    next: string | null;
}>;
export interface UsageSource<P> {
    readonly name: string;
    readonly limits: Readonly<{
        page: number;
        works: number;
    }>;
    list(input: Access<P> & Readonly<{
        range: Readonly<{
            from: UsageInstant;
            to: UsageInstant;
        }> | null;
        consumer: UsageConsumer | null;
        after: string | null;
        limit: number;
    }>): Promise<Outcome<UsageSourcePage, UsagePortFailure>>;
}
export interface UsageSessionScope<P> {
    resolve(input: Access<P> & Readonly<{
        session: string;
    }>): Promise<Outcome<Readonly<{
        kind: 'found';
        consumers: readonly UsageConsumer[];
    }> | Readonly<{
        kind: 'absent';
    }>, UsagePortFailure>>;
}
export interface Usage<P> {
    query(input: Access<P> & UsageQuery): UsageReply<UsageResult>;
    records(input: Access<P> & UsageRecordsQuery): UsageReply<UsageRecordPage>;
    occupancy(input: Access<P> & Readonly<{
        session: string;
    }>): UsageReply<ContextOccupancy>;
}
```

## 声明文件 `values.d.ts`

```ts
import type { SubjectKind, UsageItem } from '@omne-harness/call-account';
import type { ConsumerRef } from '@omne-harness/exchange-refs';
export type UsageInstant = string;
export type UsageCost = Readonly<{
    state: 'known';
    lexeme: string;
    unit: string;
}> | Readonly<{
    state: 'unknown';
}>;
export type UsageFact = Readonly<{
    source: string;
    subject: Readonly<{
        kind: SubjectKind;
        id: string;
    }>;
    unit: string;
    at: UsageInstant | null;
    consumer: ConsumerRef;
    labels: Readonly<{
        model: string | null;
        provider: string | null;
        profile: string | null;
        tool: string | null;
    }>;
    outcome: 'pending' | 'completed' | 'interrupted' | 'failed';
    cause: string | null;
    usage: readonly UsageItem[];
    cost: UsageCost | null;
    durations: Readonly<{
        toResponse: number | null;
        toFirstContent: number | null;
        total: number | null;
        generation: number | null;
    }>;
    connectRetries: number;
    window: Readonly<{
        tokens: string;
        compactAtPercent: string | null;
    }> | null;
    accounted: boolean;
}>;
export type UsageConsumer = Readonly<{
    owner: string;
    works: readonly string[];
}>;
export type UsageScope = Readonly<{
    kind: 'tenant';
}> | Readonly<{
    kind: 'session';
    session: string;
}> | Readonly<{
    kind: 'organization';
}>;
export declare const USAGE_BUCKETS: readonly [
    'none',
    'hour',
    'day',
    'week',
    'month'
];
export type UsageBucket = (typeof USAGE_BUCKETS)[number];
export declare const USAGE_DIMENSIONS: readonly [
    'source',
    'model',
    'provider',
    'purpose',
    'tool'
];
export type UsageDimension = (typeof USAGE_DIMENSIONS)[number];
export type UsageQuery = Readonly<{
    scope: UsageScope;
    range: Readonly<{
        from: UsageInstant;
        to: UsageInstant;
    }>;
    zone: string;
    bucket: UsageBucket;
    groupBy: readonly UsageDimension[];
}>;
export declare const TOKEN_KINDS: readonly [
    'input',
    'output',
    'cache-read',
    'cache-write',
    'reasoning'
];
export type TokenKind = (typeof TOKEN_KINDS)[number];
export type UsageSum = Readonly<{
    known: string;
    unknown: number;
    provisional: number;
}>;
export type UsageRatio = Readonly<{
    kind: 'known';
    value: number;
}> | Readonly<{
    kind: 'unknown';
}>;
export type UsageDistribution = Readonly<{
    count: number;
    p50: number | null;
    p90: number | null;
}>;
export type UsageMeasures = Readonly<{
    calls: number;
    units: number;
    retried: number;
    interrupted: number;
    failed: readonly Readonly<{
        cause: string | null;
        count: number;
    }>[];
    tokens: Readonly<Record<TokenKind, UsageSum>>;
    cost: Readonly<{
        sums: readonly Readonly<{
            unit: string;
            known: string;
        }>[];
        unknown: number;
    }>;
    duration: Readonly<{
        total: UsageSum;
        toFirstContent: UsageDistribution;
        whole: UsageDistribution;
    }>;
    rates: Readonly<{
        cacheHit: UsageRatio;
        reasoningShare: UsageRatio;
        retry: UsageRatio;
        failure: UsageRatio;
        outputPerSecond: UsageRatio;
    }>;
}>;
export type UsageCell = Readonly<{
    key: readonly (string | null)[];
    measures: UsageMeasures;
}>;
export type UsageBucketResult = Readonly<{
    start: UsageInstant;
    end: UsageInstant;
    total: UsageMeasures;
    groups: readonly UsageCell[];
}>;
export type UsageCoverage = Readonly<{
    sources: readonly string[];
    undated: number;
    costUnknown: number;
    excluded: Readonly<{
        cacheHit: number;
        reasoningShare: number;
        outputPerSecond: number;
    }>;
    earliest: UsageInstant | null;
}>;
export type UsageResult = Readonly<{
    total: UsageMeasures;
    groups: readonly UsageCell[];
    buckets: readonly UsageBucketResult[];
    coverage: UsageCoverage;
}>;
export type UsageRecordsQuery = Readonly<{
    scope: UsageScope;
    range: Readonly<{
        from: UsageInstant;
        to: UsageInstant;
    }>;
    after: string | null;
    limit: number;
}>;
export type UsageRecordPage = Readonly<{
    entries: readonly UsageFact[];
    next: string | null;
}>;
export type ContextOccupancy = Readonly<{
    kind: 'known';
    used: string;
    window: string;
    percent: string;
    compactAtPercent: string | null;
    asOf: Readonly<{
        at: UsageInstant;
        model: string | null;
    }>;
}> | Readonly<{
    kind: 'none-yet';
}> | Readonly<{
    kind: 'unknown';
    reason: 'usage-unknown' | 'window-unknown';
}>;
```
