import {
  CONTENT_BLOCK_KINDS,
  judgeContentBlock,
  type ContentBlock,
  type ContentBlockRejection,
} from '@omne-harness/content-block'

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

/** Parse a wire message id. Equality is exact. A missing `msg_` prefix is rejected. */
export function parseMessageId(raw: string): MessageIdParse {
  if (raw.length === 0) return { ok: false, error: 'empty' }
  if (!raw.startsWith('msg_')) return { ok: false, error: 'prefix' }
  if (!BODY.test(raw.slice(4))) return { ok: false, error: 'body' }
  return { ok: true, value: raw as MessageId }
}

export function messageIdEquals(left: MessageId, right: MessageId): boolean {
  return left === right
}

/**
 * A tool part. The tool domain owns the payload, so every key besides `kind` and `callId`
 * passes through untouched. The judge only requires a non-empty `callId`.
 */
export interface ToolPart {
  readonly kind: 'tool_call' | 'tool_result'
  readonly callId: string
  readonly [payload: string]: unknown
}

export type MessagePart = ContentBlock | ToolPart

/** The log message field. JSON data only. No tenant, standing, or causality. */
export interface Message {
  readonly id: MessageId
  readonly role: LogMessageRole
  readonly blocks: readonly MessagePart[]
}

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
  | ContentBlockRejection

export type MessageJudgment =
  | { readonly ok: Message }
  | { readonly rejected: MessageRejection; readonly blockIndex?: number }

const MESSAGE_KEYS = ['id', 'role', 'blocks'] as const
const TOOL_KINDS = ['tool_call', 'tool_result'] as const

type ToolKind = (typeof TOOL_KINDS)[number]
type PartRejection = Exclude<MessageRejection, 'missing' | 'null' | 'shape'>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isLogRole(role: string): role is LogMessageRole {
  return (LOG_MESSAGE_ROLES as readonly string[]).includes(role)
}

function isToolKind(kind: string): kind is ToolKind {
  return (TOOL_KINDS as readonly string[]).includes(kind)
}

function isKnownPartKind(kind: string): boolean {
  return (CONTENT_BLOCK_KINDS as readonly string[]).includes(kind) || isToolKind(kind)
}

function copyRecord(value: Record<string, unknown>): Record<string, unknown> {
  const copy: Record<string, unknown> = {}
  for (const key of Object.keys(value)) copy[key] = value[key]
  return copy
}

/**
 * One part. A string kind outside the seven closed names is `unknown`.
 * A missing or non-string kind falls through to `judgeContentBlock` and is `kind`.
 */
export function judgePart(
  value: unknown,
): { readonly ok: MessagePart } | { readonly rejected: PartRejection } {
  const kind = isRecord(value) ? value.kind : undefined
  if (typeof kind === 'string' && !isKnownPartKind(kind)) return { rejected: 'unknown' }
  if (isRecord(value) && typeof kind === 'string' && isToolKind(kind)) {
    if (typeof value.callId !== 'string' || value.callId.length === 0) {
      return { rejected: 'callId' }
    }
    return { ok: copyRecord(value) as ToolPart }
  }
  const judged = judgeContentBlock(value)
  if ('rejected' in judged) return { rejected: judged.rejected }
  return { ok: judged.ok }
}

/** Admit one log message field. This package does not mint ids. */
export function judgeMessage(value: unknown): MessageJudgment {
  if (!isRecord(value)) return { rejected: 'shape' }
  const legal = new Set<string>(MESSAGE_KEYS)
  if (Object.keys(value).some(key => !legal.has(key))) return { rejected: 'extra' }
  if (!('id' in value) || !('role' in value) || !('blocks' in value)) return { rejected: 'missing' }
  if (value.id === null || value.role === null || value.blocks === null) return { rejected: 'null' }
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
  const blocks: MessagePart[] = []
  for (let index = 0; index < value.blocks.length; index += 1) {
    const part = judgePart(value.blocks[index])
    if ('rejected' in part) return { rejected: part.rejected, blockIndex: index }
    blocks.push(part.ok)
  }
  return { ok: { id: id.value, role: value.role, blocks } }
}
