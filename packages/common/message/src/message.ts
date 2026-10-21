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
  isRecord,
  isToolPart,
  judgePart,
  type CallPart,
  type MessageContentBlock,
  type MessagePart,
  type ToolResultPart,
} from './parts.ts'

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
/** Branded message identity. This package does not mint ids. */
export type MessageId = string & { readonly [messageIdBrand]: true }

export type MessageIdParseError = 'empty' | 'prefix' | 'body'

export type MessageIdParse =
  | { readonly ok: true; readonly value: MessageId }
  | { readonly ok: false; readonly error: MessageIdParseError }

const BODY = /^[A-Za-z0-9_-]{22,64}$/

function isMessageId(raw: string): raw is MessageId {
  return raw.startsWith('msg_') && BODY.test(raw.slice(4))
}

/** Parse a wire message id. Equality is exact. A missing `msg_` prefix is rejected. */
export function parseMessageId(raw: string): MessageIdParse {
  if (raw.length === 0) return { ok: false, error: 'empty' }
  if (!raw.startsWith('msg_')) return { ok: false, error: 'prefix' }
  if (!BODY.test(raw.slice(4))) return { ok: false, error: 'body' }
  return isMessageId(raw) ? { ok: true, value: raw } : { ok: false, error: 'body' }
}

export function messageIdEquals(left: MessageId, right: MessageId): boolean {
  return left === right
}

/** What every log message has. The role decides the blocks, which are never empty. */
interface MessageBase {
  readonly id: MessageId
}

/** At least one block, all of the one kind of part. */
type Blocks<Part extends MessagePart> = readonly [Part, ...Part[]]

export interface UserMessage extends MessageBase {
  readonly role: 'user'
  readonly blocks: Blocks<MessageContentBlock>
}

/** An assistant message is the only one that has the call parts. */
export interface AssistantMessage extends MessageBase {
  readonly role: 'assistant'
  readonly blocks: Blocks<ContentBlock | CallPart>
}

/** A tool message carries the result of one call: its marker, then the body content blocks. */
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

/** The compaction variant. `blocks` is the summary. */
export interface CompactionMessage extends MessageBase {
  readonly role: 'compaction'
  readonly blocks: Blocks<MessageContentBlock>
  readonly covers: CompactedRange
  readonly retained: readonly RecordEntryRef[]
  readonly derivation: CompactionDerivation
}

/** Each log role with its message type. The keys are exactly `LOG_MESSAGE_ROLES`. */
export interface MessageRoleMap {
  user: UserMessage
  assistant: AssistantMessage
  tool: ToolMessage
  tool_internal: ToolInternalMessage
  system_reminder: SystemReminderMessage
  compaction: CompactionMessage
}

/** Fails to compile when `Map` lacks one of the roles or has a key that is not a role. */
type ClosedOver<
  Roles extends string,
  Map extends Record<Roles, unknown> & { readonly [Extra in Exclude<keyof Map, Roles>]: never },
> = Map

/** The log message field, one type for each role. JSON data only. No tenant, standing, or causality. */
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
  | CompactionKeyRejection
  | ContentBlockRejection

export type MessageJudgment =
  | { readonly ok: Message }
  | { readonly rejected: MessageRejection; readonly blockIndex?: number }

const MESSAGE_KEYS: readonly string[] = ['id', 'role', 'blocks']
const COMPACTION_MESSAGE_KEYS: readonly string[] = [...MESSAGE_KEYS, ...COMPACTION_KEYS]

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
  /** The legal keys with the one value read for each. Nothing later reads the input again. */
  readonly read: Readonly<Record<string, unknown>>
}

/** Only an own `role` that is exactly `compaction` adds the three compaction keys. */
function legalKeys(value: Record<string, unknown>, role: unknown): readonly string[] {
  return Object.hasOwn(value, 'role') && role === 'compaction'
    ? COMPACTION_MESSAGE_KEYS
    : MESSAGE_KEYS
}

/**
 * The legal keys of the message with the one value read for each. An accessor can answer
 * differently each time, so every field is read once, and the key set, the checks and the copy
 * all use that one value.
 */
function readFields(
  value: Record<string, unknown>,
): { readonly ok: Readonly<Record<string, unknown>> } | { readonly rejected: MessageRejection } {
  const role = value.role
  const keys = legalKeys(value, role)
  if (Object.keys(value).some(key => !keys.includes(key))) return { rejected: 'extra' }
  if (keys.some(key => !(key in value))) return { rejected: 'missing' }
  const read = Object.fromEntries(keys.map(key => [key, key === 'role' ? role : value[key]]))
  if (keys.some(key => read[key] === null)) return { rejected: 'null' }
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
  return { ok: { id: id.value, role: read.role, blocks, read } }
}

/** Each block through `judgePart`, in order. The first failure carries the index of its block. */
function judgeBlocks(blocks: NonEmpty<unknown>): { readonly ok: NonEmpty<MessagePart> } | Rejected {
  // By index, not through the input's own iterator: the caller controls that iterator.
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

/** Whether a part may stand at an index of a message. One rule for each kind of message. */
type Stands = (part: MessagePart, index: number) => boolean

/** The roles other than `assistant` have content only: no marker, no call, no thinking block. */
const standsAsContent: Stands = part => !isToolPart(part) && part.kind !== 'thinking'

/** A `tool` message has its marker first, then body content as above. */
const standsInTool: Stands = (part, index) =>
  index === 0 ? part.kind === 'tool_result' : standsAsContent(part, index)

/** An `assistant` message has the three call parts and the thinking block, and no marker. */
const standsInAssistant: Stands = part => part.kind !== 'tool_result'

/** The role check of a `tool` message, and the proof that its blocks are a marker and a body. */
function isToolBlocks(
  parts: NonEmpty<MessagePart>,
): parts is readonly [ToolResultPart, ...MessageContentBlock[]] {
  return parts.every(standsInTool)
}

/** The role check of an `assistant` message, and the proof that it has no marker. */
function isAssistantBlocks(parts: NonEmpty<MessagePart>): parts is Blocks<ContentBlock | CallPart> {
  return parts.every(standsInAssistant)
}

/** The role check of the other roles and of a compaction summary: content, never thinking. */
function isContentBlocks(parts: NonEmpty<MessagePart>): parts is Blocks<MessageContentBlock> {
  return parts.every(standsAsContent)
}

/** The failure of a role check: the first block that may not stand where it is. */
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

/** Block identity is the last check, so a message that gets here has passed the role rules. */
function admitted(message: Message): MessageJudgment {
  return judgeUniqueIds(message.blocks) ?? { ok: message }
}

/**
 * One case for each role and no default: a role added to `LOG_MESSAGE_ROLES` without its own
 * case leaves the end reachable, and the declared return type then fails to compile.
 */
function roleMessage(
  id: MessageId,
  role: Exclude<LogMessageRole, 'compaction'>,
  parts: NonEmpty<MessagePart>,
): MessageJudgment {
  switch (role) {
    case 'tool':
      return isToolBlocks(parts)
        ? admitted({ id, role, blocks: parts })
        : misplaced(standsInTool, parts)
    case 'assistant':
      return isAssistantBlocks(parts)
        ? admitted({ id, role, blocks: parts })
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

/**
 * Admit one log message field. The order of checks is: the fields of the message, the three
 * compaction keys of a `compaction` message, each part, the role rules, then block identity
 * within the message. The first failure is returned. This package does not mint ids.
 */
export function judgeMessage(value: unknown): MessageJudgment {
  if (!isRecord(value)) return { rejected: 'shape' }
  const fields = messageFields(value)
  if ('rejected' in fields) return { rejected: fields.rejected }
  const { id, role, blocks, read } = fields.ok
  if (role === 'compaction') {
    const keys = judgeCompactionKeys(read)
    if ('rejected' in keys) return keys
    return withParts(blocks, parts => compactionMessage(id, parts, keys.ok))
  }
  return withParts(blocks, parts => roleMessage(id, role, parts))
}
