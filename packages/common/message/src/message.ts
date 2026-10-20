import type { ContentBlock, ContentBlockRejection } from '@omne-harness/content-block'
import {
  COMPACTION_KEYS,
  judgeCompactionKeys,
  type CompactedRange,
  type CompactionDerivation,
  type CompactionKeyRejection,
  type RecordEntryRef,
} from './compaction-shape.ts'
import {
  isCallPart,
  isRecord,
  isToolPart,
  judgePart,
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

/** The log message field. JSON data only. No tenant, standing, or causality. */
export interface Message {
  readonly id: MessageId
  readonly role: LogMessageRole
  readonly blocks: readonly MessagePart[]
}

/** A tool message carries the result of one call: its marker, then the body content blocks. */
export type ToolMessage = Message &
  Readonly<{
    role: 'tool'
    blocks: readonly [ToolResultPart, ...ContentBlock[]]
  }>

/** The compaction variant. `blocks` is the summary. */
export type CompactionMessage = Message &
  Readonly<{
    role: 'compaction'
    blocks: readonly [ContentBlock, ...ContentBlock[]]
    covers: CompactedRange
    retained: readonly RecordEntryRef[]
    derivation: CompactionDerivation
  }>

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
  | 'tool-blocks'
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

interface MessageFields {
  readonly id: MessageId
  readonly role: LogMessageRole
  readonly blocks: readonly unknown[]
}

/** Only an own `role` that is exactly `compaction` adds the three compaction keys. */
function legalKeys(value: Record<string, unknown>): readonly string[] {
  return Object.hasOwn(value, 'role') && value.role === 'compaction'
    ? COMPACTION_MESSAGE_KEYS
    : MESSAGE_KEYS
}

function messageFields(
  value: Record<string, unknown>,
): { readonly ok: MessageFields } | { readonly rejected: MessageRejection } {
  const keys = legalKeys(value)
  if (Object.keys(value).some(key => !keys.includes(key))) return { rejected: 'extra' }
  if (keys.some(key => !(key in value))) return { rejected: 'missing' }
  if (keys.some(key => value[key] === null)) return { rejected: 'null' }
  if (
    typeof value.id !== 'string' ||
    typeof value.role !== 'string' ||
    !Array.isArray(value.blocks)
  ) {
    return { rejected: 'shape' }
  }
  const id = parseMessageId(value.id)
  if (!id.ok) return { rejected: id.error }
  if (!isLogRole(value.role)) return { rejected: 'unknown' }
  if (value.blocks.length === 0) return { rejected: 'empty' }
  return { ok: { id: id.value, role: value.role, blocks: value.blocks } }
}

function judgeBlocks(
  blocks: readonly unknown[],
): { readonly ok: readonly MessagePart[] } | Rejected {
  const admitted: MessagePart[] = []
  for (let index = 0; index < blocks.length; index += 1) {
    const part = judgePart(blocks[index])
    if ('rejected' in part) return { rejected: part.rejected, blockIndex: index }
    admitted.push(part.ok)
  }
  return { ok: admitted }
}

/** Whether a part may stand at `index` in a message of this role. */
function placed(role: LogMessageRole, part: MessagePart, index: number): boolean {
  if (role === 'tool') return index === 0 ? part.kind === 'tool_result' : !isToolPart(part)
  if (part.kind === 'tool_result') return false
  return role === 'assistant' || !isCallPart(part)
}

function judgeRoles(role: LogMessageRole, parts: readonly MessagePart[]): Rejected | undefined {
  const index = parts.findIndex((part, at) => !placed(role, part, at))
  return index < 0 ? undefined : { rejected: 'tool-blocks', blockIndex: index }
}

function judgeUniqueIds(parts: readonly MessagePart[]): Rejected | undefined {
  const seen = new Set<string>()
  for (const [index, part] of parts.entries()) {
    if (seen.has(part.id)) return { rejected: 'duplicate-id', blockIndex: index }
    seen.add(part.id)
  }
  return undefined
}

/** Narrows an admitted message to the compaction variant. It does not judge the shape again. */
export function isCompactionMessage(message: Message): message is CompactionMessage {
  return message.role === 'compaction' && COMPACTION_KEYS.every(key => Object.hasOwn(message, key))
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
  const compaction = fields.ok.role === 'compaction' ? judgeCompactionKeys(value) : undefined
  if (compaction !== undefined && 'rejected' in compaction) return compaction
  const blocks = judgeBlocks(fields.ok.blocks)
  if ('rejected' in blocks) return blocks
  const misplaced = judgeRoles(fields.ok.role, blocks.ok) ?? judgeUniqueIds(blocks.ok)
  if (misplaced !== undefined) return misplaced
  const admitted = { id: fields.ok.id, role: fields.ok.role, blocks: blocks.ok }
  return { ok: compaction === undefined ? admitted : { ...admitted, ...compaction.ok } }
}
