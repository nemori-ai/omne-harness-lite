# @omne-harness/stream-arrival 的 API 快照

<!-- omne-contract-api 快照格式 1 -->

> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。

## 入口 `.` · `index.d.ts`

- `AssembleInput` · `index.d.ts`
- `AssembleResult` · `index.d.ts`
- `AssemblyRejection` · `index.d.ts`
- `AssemblyTarget` · `index.d.ts`
- `STREAM_ARRIVAL_STEPS` · `index.d.ts`
- `STREAM_CALL_MAX_LENGTH` · `stream-reference.d.ts`
- `STREAM_CURSOR_MAX_LENGTH` · `stream-reference.d.ts`
- `STREAM_ID_MAX_LENGTH` · `stream-reference.d.ts`
- `STREAM_POSITION_MAX_LENGTH` · `stream-reference.d.ts`
- `STREAM_REFERENCE_MAX_LENGTH` · `stream-reference.d.ts`
- `StreamArrival` · `index.d.ts`
- `StreamArrivalJudgment` · `index.d.ts`
- `StreamArrivalStep` · `index.d.ts`
- `StreamAssembly` · `index.d.ts`
- `StreamCallCodec` · `stream-reference.d.ts`
- `StreamCallFailure` · `stream-reference.d.ts`
- `StreamCursor` · `stream-reference.d.ts`
- `StreamCursorFailure` · `stream-reference.d.ts`
- `StreamCursorParts` · `stream-reference.d.ts`
- `StreamEnd` · `index.d.ts`
- `StreamEnvelope` · `stream-reference.d.ts`
- `StreamFrame` · `stream-observation.d.ts`
- `StreamId` · `stream-reference.d.ts`
- `StreamObserver` · `stream-observation.d.ts`
- `StreamPosition` · `stream-reference.d.ts`
- `StreamProducer` · `stream-reference.d.ts`
- `StreamRef` · `stream-reference.d.ts`
- `StreamReferenceFailure` · `stream-reference.d.ts`
- `StreamTerminal` · `index.d.ts`
- `StreamValueRejection` · `stream-reference.d.ts`
- `TrimRecord` · `index.d.ts`
- `assembleStream` · `index.d.ts`
- `compareStreamPositions` · `stream-reference.d.ts`
- `decodeStreamId` · `stream-reference.d.ts`
- `decodeStreamPosition` · `stream-reference.d.ts`
- `encodeStreamCursor` · `stream-reference.d.ts`
- `encodeStreamRef` · `stream-reference.d.ts`
- `judgeStreamArrival` · `index.d.ts`
- `judgeStreamCursor` · `stream-reference.d.ts`
- `judgeStreamRef` · `stream-reference.d.ts`
- `parseStreamEnvelope` · `stream-reference.d.ts`
- `readStreamCursor` · `stream-reference.d.ts`
- `readStreamRef` · `stream-reference.d.ts`

## 声明文件 `index.d.ts`

```ts
export type { StreamFrame, StreamObserver } from './stream-observation.ts';
export { STREAM_ID_MAX_LENGTH, STREAM_POSITION_MAX_LENGTH, STREAM_CALL_MAX_LENGTH, STREAM_REFERENCE_MAX_LENGTH, STREAM_CURSOR_MAX_LENGTH, decodeStreamId, decodeStreamPosition, parseStreamEnvelope, encodeStreamRef, judgeStreamRef, readStreamRef, encodeStreamCursor, judgeStreamCursor, readStreamCursor, compareStreamPositions, } from './stream-reference.ts';
export type { StreamProducer, StreamId, StreamPosition, StreamRef, StreamCursor, StreamEnvelope, StreamCursorParts, StreamValueRejection, StreamCallFailure, StreamCallCodec, StreamReferenceFailure, StreamCursorFailure, } from './stream-reference.ts';
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

## 声明文件 `stream-observation.d.ts`

```ts
import type { Access } from '@omne-harness/legal-identity';
import type { StreamCursor, StreamRef } from './stream-reference.ts';
export type StreamFrame<S, D, E = never> = Readonly<{
    kind: 'snapshot';
    cursor: StreamCursor;
    value: S;
}> | Readonly<{
    kind: 'delta';
    from: StreamCursor;
    cursor: StreamCursor;
    value: D;
}> | Readonly<{
    kind: 'gap';
    after: StreamCursor | null;
    reason: 'buffer' | 'source-history';
}> | Readonly<{
    kind: 'ended';
    reason: 'source-closed' | 'observer-closed' | 'stale-stream' | 'denied' | 'unavailable' | 'capacity';
}> | Readonly<{
    kind: 'ended';
    reason: 'producer-ended';
    value: E;
}>;
export interface StreamObserver<P, S, D, E = never> {
    observe(input: Readonly<{
        ref: StreamRef;
        access: Access<P>;
        signal: AbortSignal;
    }>): AsyncIterable<StreamFrame<S, D, E>>;
}
```

## 声明文件 `stream-reference.d.ts`

```ts
import { type TenantId } from '@omne-harness/legal-identity';
import type { Outcome } from '@omne-harness/operation-result';
declare const streamIdBrand: unique symbol;
declare const streamPositionBrand: unique symbol;
declare const streamRefBrand: unique symbol;
declare const streamCursorBrand: unique symbol;
export type StreamProducer = 'model' | 'tool';
export type StreamId = string & {
    readonly [streamIdBrand]: true;
};
export type StreamPosition = string & {
    readonly [streamPositionBrand]: true;
};
export type StreamRef = string & {
    readonly [streamRefBrand]: true;
};
export type StreamCursor = string & {
    readonly [streamCursorBrand]: true;
};
export type StreamEnvelope = Readonly<{
    producer: StreamProducer;
    call: string;
    stream: StreamId;
}>;
export type StreamCursorParts = Readonly<{
    ref: StreamRef;
    position: StreamPosition;
}>;
export type StreamValueRejection = Readonly<{
    field: 'StreamId' | 'StreamPosition' | 'StreamRef' | 'StreamCursor';
    reason: 'type' | 'length' | 'syntax' | 'domain' | 'version' | 'shape' | 'producer' | 'identity' | 'position' | 'unreadable';
}>;
export type StreamCallFailure = Readonly<{
    kind: 'malformed';
}> | Readonly<{
    kind: 'invalid-tenant';
}> | Readonly<{
    kind: 'foreign-tenant';
}>;
export type StreamCallCodec = Readonly<{
    producer: StreamProducer;
    resolve(input: Readonly<{
        text: unknown;
        tenant: TenantId;
    }>): Outcome<string, StreamCallFailure>;
}>;
export type StreamReferenceFailure = Readonly<{
    kind: 'invalid-envelope';
    rejection: StreamValueRejection;
}> | Readonly<{
    kind: 'wrong-producer';
}> | StreamCallFailure;
export type StreamCursorFailure = Readonly<{
    kind: 'invalid';
    rejection: StreamValueRejection;
}> | Readonly<{
    kind: 'foreign-stream';
}>;
export declare const STREAM_ID_MAX_LENGTH = 256;
export declare const STREAM_POSITION_MAX_LENGTH = 256;
export declare const STREAM_CALL_MAX_LENGTH = 1668;
export declare const STREAM_REFERENCE_MAX_LENGTH = 4096;
export declare const STREAM_CURSOR_MAX_LENGTH = 8192;
export declare function decodeStreamId(value: unknown): Outcome<StreamId, StreamValueRejection>;
export declare function decodeStreamPosition(value: unknown): Outcome<StreamPosition, StreamValueRejection>;
export declare function parseStreamEnvelope(value: unknown): Outcome<StreamEnvelope, StreamValueRejection>;
export declare function encodeStreamRef(input: StreamEnvelope & Readonly<{
    tenant: TenantId;
}>, codec: StreamCallCodec): Outcome<StreamRef, StreamReferenceFailure>;
export declare function judgeStreamRef(input: Readonly<{
    value: unknown;
    tenant: TenantId;
}>, codec: StreamCallCodec): Outcome<StreamRef, StreamReferenceFailure>;
export declare function readStreamRef(ref: StreamRef): StreamEnvelope;
export declare function encodeStreamCursor(parts: StreamCursorParts): Outcome<StreamCursor, StreamCursorFailure>;
export declare function judgeStreamCursor(input: Readonly<{
    value: unknown;
    ref: StreamRef;
}>): Outcome<StreamCursor, StreamCursorFailure>;
export declare function readStreamCursor(cursor: StreamCursor): StreamCursorParts;
export declare function compareStreamPositions(left: StreamPosition, right: StreamPosition): -1 | 0 | 1;
export {};
```
