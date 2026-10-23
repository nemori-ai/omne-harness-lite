# @omne-harness/message 的 API 快照

> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。

## 入口 `.`

### `AssistantMessage`

```ts
interface AssistantMessage extends MessageBase {
    readonly role: 'assistant';
    readonly blocks: Blocks<ContentBlock | CallPart | ReasoningStatePart>;
    readonly replay?: ReasoningReplay;
}
```

### `CallPart`

```ts
type CallPart = ToolCallPart | IncompleteToolCallPart | UnparsedToolCallPart;
```

### `CompactedRange`

```ts
type CompactedRange = Readonly<{
    from: RecordEntryRef;
    to: RecordEntryRef;
}>;
```

### `CompactionContext`

```ts
type CompactionContext = Readonly<{
    covered: readonly CoveredEntry[];
    after: readonly Message[];
    open: readonly RecordEntryRef[];
}>;
```

### `CompactionDerivation`

```ts
type CompactionDerivation = Readonly<{
    owner: string;
    record: string;
    revision: string;
    digest: string;
}>;
```

### `CompactionJudgment`

```ts
type CompactionJudgment = Readonly<{
    ok: CompactionMessage;
}> | Readonly<{
    rejected: CompactionRejection;
    ref: RecordEntryRef | null;
}>;
```

### `CompactionMessage`

```ts
interface CompactionMessage extends MessageBase {
    readonly role: 'compaction';
    readonly blocks: Blocks<MessageContentBlock>;
    readonly covers: CompactedRange;
    readonly retained: readonly RecordEntryRef[];
    readonly derivation: CompactionDerivation;
}
```

### `CompactionRejection`

```ts
type CompactionRejection = 'message' | 'range' | 'retained-outside' | 'retained-order' | 'retained-not-model' | 'pairing' | 'open-work';
```

### `CoveredEntry`

```ts
type CoveredEntry = Readonly<{
    ref: RecordEntryRef;
    message: Message | null;
}>;
```

### `IncompleteToolCallPart`

```ts
type IncompleteToolCallPart = Readonly<{
    kind: 'tool_call_incomplete';
    id: BlockId;
    visibility: Visibility;
    callId: string;
    name: string;
    partial: string;
}>;
```

### `LOG_MESSAGE_ROLES`

```ts
const LOG_MESSAGE_ROLES: readonly [
    'user',
    'assistant',
    'tool',
    'tool_internal',
    'system_reminder',
    'compaction'
];
```

### `LogMessageRole`

```ts
type LogMessageRole = (typeof LOG_MESSAGE_ROLES)[number];
```

### `Message`

```ts
type Message = ClosedOver<LogMessageRole, MessageRoleMap>[keyof MessageRoleMap];
```

### `MessageContentBlock`

```ts
type MessageContentBlock = Exclude<ContentBlock, ThinkingContentBlock>;
```

### `MessageId`

```ts
type MessageId = string & {
    readonly [messageIdBrand]: true;
};
```

### `MessageIdParse`

```ts
type MessageIdParse = {
    readonly ok: true;
    readonly value: MessageId;
} | {
    readonly ok: false;
    readonly error: MessageIdParseError;
};
```

### `MessageIdParseError`

```ts
type MessageIdParseError = 'empty' | 'prefix' | 'body';
```

### `MessageJudgment`

```ts
type MessageJudgment = {
    readonly ok: Message;
} | {
    readonly rejected: MessageRejection;
    readonly blockIndex?: number;
};
```

### `MessagePart`

```ts
type MessagePart = ContentBlock | ToolPart | ReasoningStatePart;
```

### `MessageRejection`

```ts
type MessageRejection = 'shape' | 'missing' | 'null' | 'empty' | 'unknown' | 'extra' | 'prefix' | 'body' | 'callId' | 'name' | 'arguments' | 'partial' | 'raw' | 'json' | 'misplaced-part' | 'duplicate-id' | 'payload' | 'pairs' | 'replay' | CompactionKeyRejection | ContentBlockRejection;
```

### `MessageRoleMap`

```ts
interface MessageRoleMap {
    user: UserMessage;
    assistant: AssistantMessage;
    tool: ToolMessage;
    tool_internal: ToolInternalMessage;
    system_reminder: SystemReminderMessage;
    compaction: CompactionMessage;
}
```

### `REASONING_STATE_PAYLOAD_MAX_LENGTH`

```ts
const REASONING_STATE_PAYLOAD_MAX_LENGTH = 1048576;
```

### `REPLAY_TAG_MAX_LENGTH`

```ts
const REPLAY_TAG_MAX_LENGTH = 256;
```

### `ReasoningReplay`

```ts
type ReasoningReplay = Readonly<{
    scope: string;
    format: string;
    at: readonly number[];
}>;
```

### `ReasoningStatePart`

```ts
type ReasoningStatePart = Readonly<{
    kind: 'reasoning_state';
    id: BlockId;
    visibility: Visibility;
    payload: string;
    pairs: readonly BlockId[];
}>;
```

### `RecordEntryRef`

```ts
type RecordEntryRef = string & {
    readonly [recordEntryRefBrand]: true;
};
```

### `SystemReminderMessage`

```ts
interface SystemReminderMessage extends MessageBase {
    readonly role: 'system_reminder';
    readonly blocks: Blocks<MessageContentBlock>;
}
```

### `ToolCallPart`

```ts
type ToolCallPart = Readonly<{
    kind: 'tool_call';
    id: BlockId;
    visibility: Visibility;
    callId: string;
    name: string;
    arguments: JsonValue;
}>;
```

### `ToolInternalMessage`

```ts
interface ToolInternalMessage extends MessageBase {
    readonly role: 'tool_internal';
    readonly blocks: Blocks<MessageContentBlock>;
}
```

### `ToolMessage`

```ts
interface ToolMessage extends MessageBase {
    readonly role: 'tool';
    readonly blocks: readonly [
        ToolResultPart,
        ...MessageContentBlock[]
    ];
}
```

### `ToolPart`

```ts
type ToolPart = CallPart | ToolResultPart;
```

### `ToolResultPart`

```ts
type ToolResultPart = Readonly<{
    kind: 'tool_result';
    id: BlockId;
    visibility: Visibility;
    callId: string;
}>;
```

### `UnparsedToolCallPart`

```ts
type UnparsedToolCallPart = Readonly<{
    kind: 'tool_call_unparsed';
    id: BlockId;
    visibility: Visibility;
    callId: string;
    name: string;
    raw: string;
}>;
```

### `UserMessage`

```ts
interface UserMessage extends MessageBase {
    readonly role: 'user';
    readonly blocks: Blocks<MessageContentBlock>;
}
```

### `isReplayTag`

```ts
function isReplayTag(value: unknown): value is string;
```

### `judgeCompaction`

```ts
function judgeCompaction(message: unknown, context: CompactionContext): CompactionJudgment;
```

### `judgeMessage`

```ts
function judgeMessage(value: unknown): MessageJudgment;
```

### `judgePart`

```ts
function judgePart(value: unknown): PartJudgment;
```

### `messageIdEquals`

```ts
function messageIdEquals(left: MessageId, right: MessageId): boolean;
```

### `parseMessageId`

```ts
function parseMessageId(raw: string): MessageIdParse;
```

### `parseRecordEntryRef`

```ts
function parseRecordEntryRef(raw: string): RecordEntryRef | null;
```

## 内部引用

### `Blocks`

```ts
type Blocks<Part extends MessagePart> = readonly [
    Part,
    ...Part[]
];
```

### `COMPACTION_KEYS`

```ts
const COMPACTION_KEYS: readonly [
    "covers",
    "retained",
    "derivation"
];
```

### `ClosedOver`

```ts
type ClosedOver<Roles extends string, Map extends Record<Roles, unknown> & {
    readonly [Extra in Exclude<keyof Map, Roles>]: never;
}> = Map;
```

### `CompactionKeyRejection`

```ts
type CompactionKeyRejection = (typeof COMPACTION_KEYS)[number];
```

### `MessageBase`

```ts
interface MessageBase {
    readonly id: MessageId;
}
```

### `PartJudgment`

```ts
type PartJudgment = {
    readonly ok: MessagePart;
} | {
    readonly rejected: PartRejection;
};
```

### `PartRejection`

```ts
type PartRejection = 'extra' | 'unknown' | 'json' | 'payload' | 'pairs' | ToolField | ContentBlockRejection;
```

### `ToolField`

```ts
type ToolField = 'id' | 'visibility' | 'callId' | 'name' | 'arguments' | 'partial' | 'raw';
```
