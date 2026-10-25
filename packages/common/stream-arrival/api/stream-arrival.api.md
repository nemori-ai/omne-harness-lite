# @omne-harness/stream-arrival 的 API 快照

<!-- omne-contract-api 快照格式 1 -->

> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。

## 入口 `.` · `index.d.ts`

- `AssembleInput` · `index.d.ts`
- `AssembleResult` · `index.d.ts`
- `AssemblyRejection` · `index.d.ts`
- `AssemblyTarget` · `index.d.ts`
- `STREAM_ARRIVAL_STEPS` · `index.d.ts`
- `StreamArrival` · `index.d.ts`
- `StreamArrivalJudgment` · `index.d.ts`
- `StreamArrivalStep` · `index.d.ts`
- `StreamAssembly` · `index.d.ts`
- `StreamEnd` · `index.d.ts`
- `StreamTerminal` · `index.d.ts`
- `TrimRecord` · `index.d.ts`
- `assembleStream` · `index.d.ts`
- `judgeStreamArrival` · `index.d.ts`

## 声明文件 `index.d.ts`

```ts
import { type LogMessageRole, type Message, type MessageId, type MessagePart } from '@omne-harness/message';
export declare const STREAM_ARRIVAL_STEPS: readonly [
    'open',
    'fill',
    'close',
    'trim',
    'finish'
];
export type StreamArrivalStep = (typeof STREAM_ARRIVAL_STEPS)[number];
export interface StreamArrival {
    readonly step: StreamArrivalStep;
    readonly index: string;
}
export type StreamArrivalJudgment = {
    readonly ok: StreamArrival;
} | {
    readonly rejected: 'step' | 'index';
};
export declare function judgeStreamArrival(value: unknown): StreamArrivalJudgment;
export interface AssemblyTarget {
    readonly id: MessageId;
    readonly role: LogMessageRole;
}
export type StreamEnd = {
    readonly kind: 'stopped';
} | {
    readonly kind: 'failed';
    readonly reason: string;
} | {
    readonly kind: 'cancelled';
};
export interface TrimRecord {
    readonly index: string;
    readonly removed: string;
    readonly reason: string;
}
export type StreamTerminal = {
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
export type StreamAssembly = {
    readonly phase: 'live';
} | {
    readonly phase: 'ended';
    readonly terminal: StreamTerminal;
};
export interface AssembleInput {
    readonly target: AssemblyTarget;
    readonly from?: StreamAssembly;
    readonly steps: readonly unknown[];
    readonly end?: StreamEnd;
}
export type AssemblyRejection = 'step' | 'index' | 'mode' | 'open' | 'unopened' | 'closed' | 'seq' | 'conflict' | 'block' | 'empty' | 'late';
export type AssembleResult = {
    readonly ok: StreamAssembly;
} | {
    readonly rejected: AssemblyRejection;
    readonly detail?: string;
    readonly at: number;
    readonly assembly: StreamAssembly;
};
export declare function assembleStream(input: AssembleInput): AssembleResult;
```
