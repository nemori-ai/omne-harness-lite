# @omne-harness/message 的 API 快照

<!-- omne-contract-api 快照格式 1 -->

> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。

## 入口 `.` · `index.d.ts`

- `AssistantMessage` · `message.d.ts`
- `CallPart` · `parts.d.ts`
- `CompactedRange` · `compaction-shape.d.ts`
- `CompactionContext` · `compaction.d.ts`
- `CompactionDerivation` · `compaction-shape.d.ts`
- `CompactionJudgment` · `compaction.d.ts`
- `CompactionMessage` · `message.d.ts`
- `CompactionRejection` · `compaction.d.ts`
- `CoveredEntry` · `compaction.d.ts`
- `IncompleteToolCallPart` · `parts.d.ts`
- `LOG_MESSAGE_ROLES` · `message.d.ts`
- `LogMessageRole` · `message.d.ts`
- `Message` · `message.d.ts`
- `MessageContentBlock` · `parts.d.ts`
- `MessageId` · `message.d.ts`
- `MessageIdParse` · `message.d.ts`
- `MessageIdParseError` · `message.d.ts`
- `MessageJudgment` · `message.d.ts`
- `MessagePart` · `parts.d.ts`
- `MessageRejection` · `message.d.ts`
- `MessageRoleMap` · `message.d.ts`
- `REASONING_STATE_PAYLOAD_MAX_LENGTH` · `reasoning.d.ts`
- `REPLAY_TAG_MAX_LENGTH` · `reasoning.d.ts`
- `ReasoningReplay` · `reasoning.d.ts`
- `ReasoningStatePart` · `reasoning.d.ts`
- `RecordEntryRef` · `compaction-shape.d.ts`
- `SystemReminderMessage` · `message.d.ts`
- `ToolCallPart` · `parts.d.ts`
- `ToolInternalMessage` · `message.d.ts`
- `ToolMessage` · `message.d.ts`
- `ToolPart` · `parts.d.ts`
- `ToolResultPart` · `parts.d.ts`
- `UnparsedToolCallPart` · `parts.d.ts`
- `UserMessage` · `message.d.ts`
- `isReplayTag` · `reasoning.d.ts`
- `judgeCompaction` · `compaction.d.ts`
- `judgeMessage` · `message.d.ts`
- `judgePart` · `parts.d.ts`
- `messageIdEquals` · `message.d.ts`
- `parseMessageId` · `message.d.ts`
- `parseRecordEntryRef` · `compaction-shape.d.ts`

## 声明文件 `compaction-shape.d.ts`

```ts
declare const recordEntryRefBrand: unique symbol;
export type RecordEntryRef = string & {
    readonly [recordEntryRefBrand]: true;
};
export type CompactionDerivation = Readonly<{
    owner: string;
    record: string;
    revision: string;
    digest: string;
}>;
export type CompactedRange = Readonly<{
    from: RecordEntryRef;
    to: RecordEntryRef;
}>;
export interface CompactionKeys {
    readonly covers: CompactedRange;
    readonly retained: readonly RecordEntryRef[];
    readonly derivation: CompactionDerivation;
}
export declare const COMPACTION_KEYS: readonly [
    "covers",
    "retained",
    "derivation"
];
export type CompactionKeyRejection = (typeof COMPACTION_KEYS)[number];
export type CompactionKeysJudgment = {
    readonly ok: CompactionKeys;
} | {
    readonly rejected: CompactionKeyRejection;
};
export declare function parseRecordEntryRef(raw: string): RecordEntryRef | null;
export declare function judgeCompactionKeys(fields: Readonly<Record<string, unknown>>): CompactionKeysJudgment;
export {};
```

## 声明文件 `compaction.d.ts`

```ts
import type { RecordEntryRef } from './compaction-shape.ts';
import { type CompactionMessage, type Message } from './message.ts';
export type CoveredEntry = Readonly<{
    ref: RecordEntryRef;
    message: Message | null;
}>;
export type CompactionContext = Readonly<{
    covered: readonly CoveredEntry[];
    after: readonly Message[];
    open: readonly RecordEntryRef[];
}>;
export type CompactionRejection = 'message' | 'range' | 'retained-outside' | 'retained-order' | 'retained-not-model' | 'pairing' | 'open-work';
export type CompactionJudgment = Readonly<{
    ok: CompactionMessage;
}> | Readonly<{
    rejected: CompactionRejection;
    ref: RecordEntryRef | null;
}>;
export declare function judgeCompaction(message: unknown, context: CompactionContext): CompactionJudgment;
```

## 声明文件 `index.d.ts`

```ts
export { LOG_MESSAGE_ROLES, judgeMessage, messageIdEquals, parseMessageId } from './message.ts';
export type { AssistantMessage, CompactionMessage, LogMessageRole, Message, MessageId, MessageIdParse, MessageIdParseError, MessageJudgment, MessageRejection, MessageRoleMap, SystemReminderMessage, ToolInternalMessage, ToolMessage, UserMessage, } from './message.ts';
export { parseRecordEntryRef } from './compaction-shape.ts';
export type { CompactedRange, CompactionDerivation, RecordEntryRef } from './compaction-shape.ts';
export { judgeCompaction } from './compaction.ts';
export type { CompactionContext, CompactionJudgment, CompactionRejection, CoveredEntry, } from './compaction.ts';
export { judgePart } from './parts.ts';
export { REASONING_STATE_PAYLOAD_MAX_LENGTH, REPLAY_TAG_MAX_LENGTH, isReplayTag, } from './reasoning.ts';
export type { ReasoningReplay, ReasoningStatePart } from './reasoning.ts';
export type { CallPart, IncompleteToolCallPart, MessageContentBlock, MessagePart, ToolCallPart, ToolPart, ToolResultPart, UnparsedToolCallPart, } from './parts.ts';
```

## 声明文件 `message.d.ts`

```ts
import type { ContentBlock, ContentBlockRejection } from '@omne-harness/content-block';
import { type CompactedRange, type CompactionDerivation, type CompactionKeyRejection, type RecordEntryRef } from './compaction-shape.ts';
import { type CallPart, type MessageContentBlock, type MessagePart, type ToolResultPart } from './parts.ts';
import { type ReasoningReplay, type ReasoningStatePart } from './reasoning.ts';
export declare const LOG_MESSAGE_ROLES: readonly [
    'user',
    'assistant',
    'tool',
    'tool_internal',
    'system_reminder',
    'compaction'
];
export type LogMessageRole = (typeof LOG_MESSAGE_ROLES)[number];
declare const messageIdBrand: unique symbol;
export type MessageId = string & {
    readonly [messageIdBrand]: true;
};
export type MessageIdParseError = 'empty' | 'prefix' | 'body';
export type MessageIdParse = {
    readonly ok: true;
    readonly value: MessageId;
} | {
    readonly ok: false;
    readonly error: MessageIdParseError;
};
export declare function parseMessageId(raw: string): MessageIdParse;
export declare function messageIdEquals(left: MessageId, right: MessageId): boolean;
interface MessageBase {
    readonly id: MessageId;
}
type Blocks<Part extends MessagePart> = readonly [
    Part,
    ...Part[]
];
export interface UserMessage extends MessageBase {
    readonly role: 'user';
    readonly blocks: Blocks<MessageContentBlock>;
}
export interface AssistantMessage extends MessageBase {
    readonly role: 'assistant';
    readonly blocks: Blocks<ContentBlock | CallPart | ReasoningStatePart>;
    readonly replay?: ReasoningReplay;
}
export interface ToolMessage extends MessageBase {
    readonly role: 'tool';
    readonly blocks: readonly [
        ToolResultPart,
        ...MessageContentBlock[]
    ];
}
export interface ToolInternalMessage extends MessageBase {
    readonly role: 'tool_internal';
    readonly blocks: Blocks<MessageContentBlock>;
}
export interface SystemReminderMessage extends MessageBase {
    readonly role: 'system_reminder';
    readonly blocks: Blocks<MessageContentBlock>;
}
export interface CompactionMessage extends MessageBase {
    readonly role: 'compaction';
    readonly blocks: Blocks<MessageContentBlock>;
    readonly covers: CompactedRange;
    readonly retained: readonly RecordEntryRef[];
    readonly derivation: CompactionDerivation;
}
export interface MessageRoleMap {
    user: UserMessage;
    assistant: AssistantMessage;
    tool: ToolMessage;
    tool_internal: ToolInternalMessage;
    system_reminder: SystemReminderMessage;
    compaction: CompactionMessage;
}
type ClosedOver<Roles extends string, Map extends Record<Roles, unknown> & {
    readonly [Extra in Exclude<keyof Map, Roles>]: never;
}> = Map;
export type Message = ClosedOver<LogMessageRole, MessageRoleMap>[keyof MessageRoleMap];
export type MessageRejection = 'shape' | 'missing' | 'null' | 'empty' | 'unknown' | 'extra' | 'prefix' | 'body' | 'callId' | 'name' | 'arguments' | 'partial' | 'raw' | 'json' | 'misplaced-part' | 'duplicate-id' | 'payload' | 'pairs' | 'replay' | CompactionKeyRejection | ContentBlockRejection;
export type MessageJudgment = {
    readonly ok: Message;
} | {
    readonly rejected: MessageRejection;
    readonly blockIndex?: number;
};
export declare function judgeMessage(value: unknown): MessageJudgment;
export {};
```

## 声明文件 `parts.d.ts`

```ts
import { type BlockId, type ContentBlock, type ContentBlockRejection, type ThinkingContentBlock, type Visibility } from '@omne-harness/content-block';
import { type JsonValue } from '@omne-harness/json-text';
import { type ReasoningStatePart } from './reasoning.ts';
export type ToolCallPart = Readonly<{
    kind: 'tool_call';
    id: BlockId;
    visibility: Visibility;
    callId: string;
    name: string;
    arguments: JsonValue;
}>;
export type IncompleteToolCallPart = Readonly<{
    kind: 'tool_call_incomplete';
    id: BlockId;
    visibility: Visibility;
    callId: string;
    name: string;
    partial: string;
}>;
export type UnparsedToolCallPart = Readonly<{
    kind: 'tool_call_unparsed';
    id: BlockId;
    visibility: Visibility;
    callId: string;
    name: string;
    raw: string;
}>;
export type ToolResultPart = Readonly<{
    kind: 'tool_result';
    id: BlockId;
    visibility: Visibility;
    callId: string;
}>;
export type MessageContentBlock = Exclude<ContentBlock, ThinkingContentBlock>;
export type CallPart = ToolCallPart | IncompleteToolCallPart | UnparsedToolCallPart;
export type ToolPart = CallPart | ToolResultPart;
export type MessagePart = ContentBlock | ToolPart | ReasoningStatePart;
type ToolField = 'id' | 'visibility' | 'callId' | 'name' | 'arguments' | 'partial' | 'raw';
export type PartRejection = 'extra' | 'unknown' | 'json' | 'payload' | 'pairs' | ToolField | ContentBlockRejection;
export type PartJudgment = {
    readonly ok: MessagePart;
} | {
    readonly rejected: PartRejection;
};
export declare function isToolPart(part: MessagePart): part is ToolPart;
export declare function judgePart(value: unknown): PartJudgment;
export {};
```

## 声明文件 `reasoning.d.ts`

```ts
import { type BlockId, type BlockIdentityRejection, type Visibility } from '@omne-harness/content-block';
export declare const REASONING_STATE_PAYLOAD_MAX_LENGTH = 1048576;
export declare const REPLAY_TAG_MAX_LENGTH = 256;
export type ReasoningStatePart = Readonly<{
    kind: 'reasoning_state';
    id: BlockId;
    visibility: Visibility;
    payload: string;
    pairs: readonly BlockId[];
}>;
export type ReasoningReplay = Readonly<{
    scope: string;
    format: string;
    at: readonly number[];
}>;
export type ReasoningStateField = 'id' | 'visibility' | 'payload' | 'pairs';
export declare const REASONING_STATE_FIELDS: readonly ReasoningStateField[];
export type ReasoningStateRejection = BlockIdentityRejection | 'payload' | 'pairs';
export type ReasoningStateJudgment = {
    readonly ok: ReasoningStatePart;
} | {
    readonly rejected: ReasoningStateRejection;
};
export declare function judgeReasoningState(value: Record<string, unknown>): ReasoningStateJudgment;
export declare function isReplayTag(value: unknown): value is string;
export declare function judgeReplay(raw: unknown): ReasoningReplay | undefined;
```

## 声明文件 `values.d.ts`

```ts
export declare function isRecord(value: unknown): value is Record<string, unknown>;
export declare function isPlainRecord(value: unknown): value is Record<string, unknown>;
export declare function hasUnreadableOwn(value: object): boolean;
export declare function nonEmpty(value: unknown): value is string;
export declare function readDataItems<T>(raw: unknown, item: (value: unknown) => T | undefined): T[] | undefined;
export declare function hasOnlyDataItems(items: readonly unknown[]): boolean;
export declare function hasDuplicates<T>(items: readonly T[]): boolean;
export declare function closedFields(value: unknown, keys: readonly string[]): Readonly<Record<string, unknown>> | undefined;
```
