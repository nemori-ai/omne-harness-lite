# @omne-harness/utc-instant 的 API 快照

> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。

## 入口 `.`

### `Duration` 仅类型

```ts
class Duration {
    #private;
    constructor(mint: symbol, text: string);
    toJSON(): never;
    toString(): never;
}
```

### `DurationFailure`

```ts
type DurationFailure = {
    readonly kind: 'syntax' | 'calendar-unit';
};
```

### `DurationParse`

```ts
type DurationParse = {
    readonly ok: true;
    readonly value: Duration;
} | {
    readonly ok: false;
    readonly failure: DurationFailure;
};
```

### `Instant` 仅类型

```ts
class Instant {
    #private;
    constructor(mint: symbol, civil: string, fraction: string);
    toJSON(): never;
    toString(): never;
}
```

### `InstantFailure`

```ts
type InstantFailure = {
    readonly kind: 'syntax' | 'offset' | 'range' | 'leap-data-expired';
} | {
    readonly kind: 'leap-second';
    readonly detail: 'not-inserted' | 'deleted';
};
```

### `InstantParse`

```ts
type InstantParse = {
    readonly ok: true;
    readonly value: Instant;
} | {
    readonly ok: false;
    readonly failure: InstantFailure;
};
```

### `LeapSecondData` 仅类型

```ts
class LeapSecondData {
    #private;
    constructor(mint: symbol, source: string, version: Instant, expires: Instant, insertions: readonly string[], deletions: readonly string[]);
    get source(): string;
    get version(): Instant;
    get expires(): Instant;
    toJSON(): never;
    toString(): never;
}
```

### `LeapSecondDataRead`

```ts
type LeapSecondDataRead = {
    readonly ok: true;
    readonly value: LeapSecondData;
} | {
    readonly ok: false;
    readonly failure: LeapSecondsListFailure;
};
```

### `compareInstants`

```ts
function compareInstants(a: Instant, b: Instant): -1 | 0 | 1;
```

### `encodeDuration`

```ts
function encodeDuration(duration: Duration): string;
```

### `encodeInstant`

```ts
function encodeInstant(instant: Instant): string;
```

### `leapSecondData`

```ts
const leapSecondData: LeapSecondData;
```

### `parseDuration`

```ts
function parseDuration(text: string): DurationParse;
```

### `parseInstant`

```ts
function parseInstant(text: string, table?: LeapSecondData): InstantParse;
```

### `readLeapSecondData`

```ts
function readLeapSecondData(text: string, source: string): LeapSecondDataRead;
```

## 内部引用

### `LeapSecondsListFailure`

```ts
type LeapSecondsListFailure = {
    readonly kind: 'syntax' | 'step';
};
```
