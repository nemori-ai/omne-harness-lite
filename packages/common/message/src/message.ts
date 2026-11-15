import type { ContentBlock, ContentBlockRejection } from '@omne-harness/content-block'
import {
  COMPACTION_KEYS,
  judgeCompactionKeys,
  type CompactionKeys,
  type CompactedRange,
  type CompactionDerivation,
  type CompactionKeyRejection,
  type RecordEntryRef,
} from './compaction-shape.ts'
import {
  isToolPart,
  judgePart,
  type CallPart,
  type MessageContentBlock,
  type MessagePart,
  type ToolResultPart,
} from './parts.ts'
import { judgeReplay, type ReasoningReplay, type ReasoningStatePart } from './reasoning.ts'
import { isRecord } from './values.ts'

export const LOG_MESSAGE_ROLES = [
  'user',
  'assistant',
  'tool',
  'tool_internal',
  'system_reminder',
  'compaction',
] as const

export type LogMessageRole = (typeof LOG_MESSAGE_ROLES)[number]

declare const messageIdBrand: unique symbol
export type MessageId = string & { readonly [messageIdBrand]: true }

export type MessageIdParseError = 'empty' | 'prefix' | 'body'

export type MessageIdParse =
  | { readonly ok: true; readonly value: MessageId }
  | { readonly ok: false; readonly error: MessageIdParseError }

const BODY = /^[A-Za-z0-9_-]{22,64}$/

function isMessageId(raw: string): raw is MessageId {
  return raw.startsWith('msg_') && BODY.test(raw.slice(4))
}

export function parseMessageId(raw: string): MessageIdParse {
  if (raw.length === 0) return { ok: false, error: 'empty' }
  if (!raw.startsWith('msg_')) return { ok: false, error: 'prefix' }
  if (!BODY.test(raw.slice(4))) return { ok: false, error: 'body' }
  return isMessageId(raw) ? { ok: true, value: raw } : { ok: false, error: 'body' }
}

export function messageIdEquals(left: MessageId, right: MessageId): boolean {
  return left === right
}

interface MessageBase {
  readonly id: MessageId
}

type Blocks<Part extends MessagePart> = readonly [Part, ...Part[]]

export interface UserMessage extends MessageBase {
  readonly role: 'user'
  readonly blocks: Blocks<MessageContentBlock>
}

export interface AssistantMessage extends MessageBase {
  readonly role: 'assistant'
  readonly blocks: Blocks<ContentBlock | CallPart | ReasoningStatePart>
  readonly replay?: ReasoningReplay
}

export interface ToolMessage extends MessageBase {
  readonly role: 'tool'
  readonly blocks: readonly [ToolResultPart, ...MessageContentBlock[]]
}

export interface ToolInternalMessage extends MessageBase {
  readonly role: 'tool_internal'
  readonly blocks: Blocks<MessageContentBlock>
}

export interface SystemReminderMessage extends MessageBase {
  readonly role: 'system_reminder'
  readonly blocks: Blocks<MessageContentBlock>
}

export interface CompactionMessage extends MessageBase {
  readonly role: 'compaction'
  readonly blocks: Blocks<MessageContentBlock>
  readonly covers: CompactedRange
  readonly retained: readonly RecordEntryRef[]
  readonly derivation: CompactionDerivation
}

export interface MessageRoleMap {
  user: UserMessage
  assistant: AssistantMessage
  tool: ToolMessage
  tool_internal: ToolInternalMessage
  system_reminder: SystemReminderMessage
  compaction: CompactionMessage
}

type ClosedOver<
  Roles extends string,
  Map extends Record<Roles, unknown> & { readonly [Extra in Exclude<keyof Map, Roles>]: never },
> = Map

export type Message = ClosedOver<LogMessageRole, MessageRoleMap>[keyof MessageRoleMap]

export type MessageRejection =
  | 'shape'
  | 'missing'
  | 'null'
  | 'empty'
  | 'unknown'
  | 'extra'
  | 'prefix'
  | 'body'
  | 'callId'
  | 'name'
  | 'arguments'
  | 'partial'
  | 'raw'
  | 'json'
  | 'misplaced-part'
  | 'duplicate-id'
  | 'payload'
  | 'pairs'
  | 'replay'
  | CompactionKeyRejection
  | ContentBlockRejection

export type MessageJudgment =
  | { readonly ok: Message }
  | { readonly rejected: MessageRejection; readonly blockIndex?: number }

const MESSAGE_KEYS: readonly string[] = ['id', 'role', 'blocks']
const COMPACTION_MESSAGE_KEYS: readonly string[] = [...MESSAGE_KEYS, ...COMPACTION_KEYS]
const REPLAY_KEY = 'replay'
const ASSISTANT_MESSAGE_KEYS: readonly string[] = [...MESSAGE_KEYS, REPLAY_KEY]

type Rejected = { readonly rejected: MessageRejection; readonly blockIndex: number }

function isLogRole(role: string): role is LogMessageRole {
  return LOG_MESSAGE_ROLES.some(known => known === role)
}

type NonEmpty<T> = readonly [T, ...T[]]

function isNonEmpty<T>(items: readonly T[]): items is NonEmpty<T> {
  return items.length > 0
}

interface MessageFields {
  readonly id: MessageId
  readonly role: LogMessageRole
  readonly blocks: NonEmpty<unknown>
  readonly read: Readonly<Record<string, unknown>>
  readonly replay: ReasoningReplay | undefined
}

function legalKeys(value: Record<string, unknown>, role: unknown): readonly string[] {
  if (!Object.hasOwn(value, 'role')) return MESSAGE_KEYS
  if (role === 'compaction') return COMPACTION_MESSAGE_KEYS
  return role === 'assistant' ? ASSISTANT_MESSAGE_KEYS : MESSAGE_KEYS
}

function readFields(
  value: Record<string, unknown>,
): { readonly ok: Readonly<Record<string, unknown>> } | { readonly rejected: MessageRejection } {
  const role = value.role
  const keys = legalKeys(value, role)
  if (Object.keys(value).some(key => !keys.includes(key))) return { rejected: 'extra' }
  if (keys.some(key => key !== REPLAY_KEY && !(key in value))) return { rejected: 'missing' }
  const entries = keys.map(key => [key, key === 'role' ? role : value[key]] as const)
  const read = Object.fromEntries(
    entries.filter(([key, item]) => key !== REPLAY_KEY || item !== undefined),
  )
  if (Object.values(read).some(item => item === null)) return { rejected: 'null' }
  return { ok: read }
}

function messageFields(
  value: Record<string, unknown>,
): { readonly ok: MessageFields } | { readonly rejected: MessageRejection } {
  const fields = readFields(value)
  if ('rejected' in fields) return fields
  const read = fields.ok
  if (typeof read.id !== 'string' || typeof read.role !== 'string' || !Array.isArray(read.blocks)) {
    return { rejected: 'shape' }
  }
  const id = parseMessageId(read.id)
  if (!id.ok) return { rejected: id.error }
  if (!isLogRole(read.role)) return { rejected: 'unknown' }
  const blocks: readonly unknown[] = read.blocks
  if (!isNonEmpty(blocks)) return { rejected: 'empty' }
  if (!(REPLAY_KEY in read))
    return { ok: { id: id.value, role: read.role, blocks, read, replay: undefined } }
  const replay = judgeReplay(read.replay)
  if (replay === undefined) return { rejected: 'replay' }
  return { ok: { id: id.value, role: read.role, blocks, read, replay } }
}

function judgeBlocks(blocks: NonEmpty<unknown>): { readonly ok: NonEmpty<MessagePart> } | Rejected {
  const first = judgePart(blocks[0])
  if ('rejected' in first) return { rejected: first.rejected, blockIndex: 0 }
  const admitted: MessagePart[] = []
  for (let at = 1; at < blocks.length; at += 1) {
    const part = judgePart(blocks[at])
    if ('rejected' in part) return { rejected: part.rejected, blockIndex: at }
    admitted.push(part.ok)
  }
  return { ok: [first.ok, ...admitted] }
}

type Stands = (part: MessagePart, index: number) => boolean

const standsAsContent: Stands = part =>
  !isToolPart(part) && part.kind !== 'thinking' && part.kind !== 'reasoning_state'

const standsInTool: Stands = (part, index) =>
  index === 0 ? part.kind === 'tool_result' : standsAsContent(part, index)

const standsInAssistant: Stands = part => part.kind !== 'tool_result'

function isToolBlocks(
  parts: NonEmpty<MessagePart>,
): parts is readonly [ToolResultPart, ...MessageContentBlock[]] {
  return parts.every(standsInTool)
}

function isAssistantBlocks(
  parts: NonEmpty<MessagePart>,
): parts is Blocks<ContentBlock | CallPart | ReasoningStatePart> {
  return parts.every(standsInAssistant)
}

function isContentBlocks(parts: NonEmpty<MessagePart>): parts is Blocks<MessageContentBlock> {
  return parts.every(standsAsContent)
}

function misplaced(stands: Stands, parts: NonEmpty<MessagePart>): Rejected {
  return {
    rejected: 'misplaced-part',
    blockIndex: parts.findIndex((part, at) => !stands(part, at)),
  }
}

function judgeUniqueIds(parts: readonly MessagePart[]): Rejected | undefined {
  const seen = new Set<string>()
  for (const [index, part] of parts.entries()) {
    if (seen.has(part.id)) return { rejected: 'duplicate-id', blockIndex: index }
    seen.add(part.id)
  }
  return undefined
}

function admitted(message: Message): MessageJudgment {
  return judgeUniqueIds(message.blocks) ?? { ok: message }
}

type Refused = Extract<MessageJudgment, { readonly rejected: MessageRejection }>

function isReasoningState(part: MessagePart): part is ReasoningStatePart {
  return part.kind === 'reasoning_state'
}

function judgePairs(parts: readonly MessagePart[]): Refused | undefined {
  const kinds = new Map(parts.map(part => [part.id, part.kind] as const))
  const index = parts.findIndex(
    part =>
      isReasoningState(part) &&
      part.pairs.some(pair => {
        const kind = kinds.get(pair)
        return kind === undefined || kind === 'reasoning_state'
      }),
  )
  return index < 0 ? undefined : { rejected: 'pairs', blockIndex: index }
}

function judgeAtItems(parts: readonly MessagePart[], at: readonly number[]): Refused | undefined {
  for (const index of at) {
    const part = parts[index]
    if (part === undefined) return { rejected: 'replay' }
    if (!isReasoningState(part)) return { rejected: 'replay', blockIndex: index }
  }
  return undefined
}

function judgeReplayAt(
  parts: readonly MessagePart[],
  replay: ReasoningReplay | undefined,
): Refused | undefined {
  const first = parts.findIndex(isReasoningState)
  if (replay === undefined) {
    return first < 0 ? undefined : { rejected: 'replay', blockIndex: first }
  }
  if (first < 0 && !parts.some(part => part.kind === 'thinking')) return { rejected: 'replay' }
  const unlisted = parts.findIndex((part, at) => isReasoningState(part) && !replay.at.includes(at))
  return (
    judgeAtItems(parts, replay.at) ??
    (unlisted < 0 ? undefined : { rejected: 'replay', blockIndex: unlisted })
  )
}

function admittedAssistant(
  id: MessageId,
  parts: Blocks<ContentBlock | CallPart | ReasoningStatePart>,
  replay: ReasoningReplay | undefined,
): MessageJudgment {
  const message: AssistantMessage =
    replay === undefined
      ? { id, role: 'assistant', blocks: parts }
      : { id, role: 'assistant', blocks: parts, replay }
  return (
    judgeUniqueIds(parts) ?? judgePairs(parts) ?? judgeReplayAt(parts, replay) ?? { ok: message }
  )
}

function roleMessage(
  id: MessageId,
  role: Exclude<LogMessageRole, 'compaction'>,
  parts: NonEmpty<MessagePart>,
  replay: ReasoningReplay | undefined,
): MessageJudgment {
  switch (role) {
    case 'tool':
      return isToolBlocks(parts)
        ? admitted({ id, role, blocks: parts })
        : misplaced(standsInTool, parts)
    case 'assistant':
      return isAssistantBlocks(parts)
        ? admittedAssistant(id, parts, replay)
        : misplaced(standsInAssistant, parts)
    case 'user':
    case 'tool_internal':
    case 'system_reminder':
      return isContentBlocks(parts)
        ? admitted({ id, role, blocks: parts })
        : misplaced(standsAsContent, parts)
  }
}

function compactionMessage(
  id: MessageId,
  parts: NonEmpty<MessagePart>,
  keys: CompactionKeys,
): MessageJudgment {
  return isContentBlocks(parts)
    ? admitted({ id, role: 'compaction', blocks: parts, ...keys })
    : misplaced(standsAsContent, parts)
}

function withParts(
  blocks: NonEmpty<unknown>,
  build: (parts: NonEmpty<MessagePart>) => MessageJudgment,
): MessageJudgment {
  const parts = judgeBlocks(blocks)
  return 'rejected' in parts ? parts : build(parts.ok)
}

export function judgeMessage(value: unknown): MessageJudgment {
  if (!isRecord(value)) return { rejected: 'shape' }
  const fields = messageFields(value)
  if ('rejected' in fields) return { rejected: fields.rejected }
  const { id, role, blocks, read, replay } = fields.ok
  if (role === 'compaction') {
    const keys = judgeCompactionKeys(read)
    if ('rejected' in keys) return keys
    return withParts(blocks, parts => compactionMessage(id, parts, keys.ok))
  }
  return withParts(blocks, parts => roleMessage(id, role, parts, replay))
}
