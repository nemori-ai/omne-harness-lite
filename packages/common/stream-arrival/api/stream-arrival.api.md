# @omne-harness/stream-arrival 的 API 快照

> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。

## 入口 `.`

### `AssembleInput`

```ts
interface AssembleInput {
    readonly target: AssemblyTarget;
    readonly from?: StreamAssembly;
    readonly steps: readonly unknown[];
    readonly end?: StreamEnd;
}
```

### `AssembleResult`

```ts
type AssembleResult = {
    readonly ok: StreamAssembly;
} | {
    readonly rejected: AssemblyRejection;
    readonly detail?: string;
    readonly at: number;
    readonly assembly: StreamAssembly;
};
```

### `AssemblyRejection`

```ts
type AssemblyRejection = 'step' | 'index' | 'mode' | 'open' | 'unopened' | 'closed' | 'seq' | 'conflict' | 'block' | 'empty' | 'late';
```

### `AssemblyTarget`

```ts
interface AssemblyTarget {
    readonly id: MessageId;
    readonly role: LogMessageRole;
}
```

### `STREAM_ARRIVAL_STEPS`

```ts
const STREAM_ARRIVAL_STEPS: readonly [
    'open',
    'fill',
    'close',
    'trim',
    'finish'
];
```

### `StreamArrival`

```ts
interface StreamArrival {
    readonly step: StreamArrivalStep;
    readonly index: string;
}
```

### `StreamArrivalJudgment`

```ts
type StreamArrivalJudgment = {
    readonly ok: StreamArrival;
} | {
    readonly rejected: 'step' | 'index';
};
```

### `StreamArrivalStep`

```ts
type StreamArrivalStep = (typeof STREAM_ARRIVAL_STEPS)[number];
```

### `StreamAssembly`

```ts
type StreamAssembly = {
    readonly phase: 'live';
} | {
    readonly phase: 'ended';
    readonly terminal: StreamTerminal;
};
```

### `StreamEnd`

```ts
type StreamEnd = {
    readonly kind: 'stopped';
} | {
    readonly kind: 'failed';
    readonly reason: string;
} | {
    readonly kind: 'cancelled';
};
```

### `StreamTerminal`

```ts
type StreamTerminal = {
    readonly kind: 'complete';
    readonly message: Message;
    readonly trims: readonly TrimRecord[];
} | {
    readonly kind: 'truncated';
    readonly blocks: readonly MessagePart[];
    readonly trims: readonly TrimRecord[];
} | {
    readonly kind: 'failed';
    readonly reason: string;
    readonly blocks: readonly MessagePart[];
    readonly trims: readonly TrimRecord[];
} | {
    readonly kind: 'cancelled';
    readonly blocks: readonly MessagePart[];
    readonly trims: readonly TrimRecord[];
};
```

### `TrimRecord`

```ts
interface TrimRecord {
    readonly index: string;
    readonly removed: string;
    readonly reason: string;
}
```

### `assembleStream`

```ts
function assembleStream(input: AssembleInput): AssembleResult;
```

### `judgeStreamArrival`

```ts
function judgeStreamArrival(value: unknown): StreamArrivalJudgment;
```

## 内部引用

（无）
