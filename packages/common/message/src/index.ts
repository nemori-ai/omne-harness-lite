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
 * A tool part. The tool domain owns the payload. Every other own key is kept when the value
 * is JSON. The judge requires a non-empty own `callId`.
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
  | 'json'
  | ContentBlockRejection

export type MessageJudgment =
  { readonly ok: Message } | { readonly rejected: MessageRejection; readonly blockIndex?: number }

const MESSAGE_KEYS = ['id', 'role', 'blocks'] as const
const TOOL_KINDS = ['tool_call', 'tool_result'] as const

type ToolKind = (typeof TOOL_KINDS)[number]
type PartRejection = Exclude<MessageRejection, 'missing' | 'null' | 'shape'>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/** JSON is null, a boolean, a string, a finite number, or an array or plain object of those. */
function isJsonValue(value: unknown, seen: WeakSet<object> = new WeakSet()): boolean {
  if (value === null) return true
  switch (typeof value) {
    case 'boolean':
    case 'string':
      return true
    case 'number':
      return Number.isFinite(value)
    case 'object':
      return jsonContainer(value, seen)
    default:
      return false
  }
}

function jsonContainer(value: object, seen: WeakSet<object>): boolean {
  if (seen.has(value)) return false
  if (Array.isArray(value)) return jsonItems(value, seen)
  if (!isPlainRecord(value)) return false
  seen.add(value)
  for (const key of Object.keys(value)) {
    if (!isJsonValue(value[key], seen)) {
      seen.delete(value)
      return false
    }
  }
  seen.delete(value)
  return true
}

function jsonItems(value: readonly unknown[], seen: WeakSet<object>): boolean {
  seen.add(value)
  for (const item of value) {
    if (!isJsonValue(item, seen)) {
      seen.delete(value)
      return false
    }
  }
  seen.delete(value)
  return true
}

/** Own enumerable keys only. `__proto__` is a data property, not a prototype assignment. */
function copyJson(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(item => copyJson(item))
  const copy: Record<string, unknown> = {}
  for (const key of Object.keys(value)) {
    Object.defineProperty(copy, key, {
      value: copyJson((value as Record<string, unknown>)[key]),
      writable: true,
      enumerable: true,
      configurable: true,
    })
  }
  return copy
}

function own(value: Record<string, unknown>, key: string): unknown {
  return Object.hasOwn(value, key) ? value[key] : undefined
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

/**
 * One part. A string kind outside the seven closed names is `unknown`.
 * A missing or non-string kind falls through to `judgeContentBlock` and is `kind`.
 * A value that is not JSON is `json`. Kind and `callId` must be own keys.
 */
export function judgePart(
  value: unknown,
): { readonly ok: MessagePart } | { readonly rejected: PartRejection } {
  if (!isJsonValue(value)) return { rejected: 'json' }
  const kind = isPlainRecord(value) ? own(value, 'kind') : undefined
  if (typeof kind === 'string' && !isKnownPartKind(kind)) return { rejected: 'unknown' }
  if (isPlainRecord(value) && typeof kind === 'string' && isToolKind(kind)) {
    const callId = own(value, 'callId')
    if (typeof callId !== 'string' || callId.length === 0) return { rejected: 'callId' }
    return { ok: copyJson(value) as ToolPart }
  }
  const judged = judgeContentBlock(value)
  if ('rejected' in judged) return { rejected: judged.rejected }
  return { ok: judged.ok }
}

interface MessageFields {
  readonly id: MessageId
  readonly role: LogMessageRole
  readonly blocks: readonly unknown[]
}

function messageFields(
  value: Record<string, unknown>,
): { readonly ok: MessageFields } | { readonly rejected: MessageRejection } {
  const legal = new Set<string>(MESSAGE_KEYS)
  if (Object.keys(value).some(key => !legal.has(key))) return { rejected: 'extra' }
  if (MESSAGE_KEYS.some(key => !(key in value))) return { rejected: 'missing' }
  if (MESSAGE_KEYS.some(key => value[key] === null)) return { rejected: 'null' }
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
):
  | { readonly ok: readonly MessagePart[] }
  | { readonly rejected: MessageRejection; readonly blockIndex: number } {
  const admitted: MessagePart[] = []
  for (let index = 0; index < blocks.length; index += 1) {
    const part = judgePart(blocks[index])
    if ('rejected' in part) return { rejected: part.rejected, blockIndex: index }
    admitted.push(part.ok)
  }
  return { ok: admitted }
}

/** Admit one log message field. This package does not mint ids. */
export function judgeMessage(value: unknown): MessageJudgment {
  if (!isRecord(value)) return { rejected: 'shape' }
  const fields = messageFields(value)
  if ('rejected' in fields) return { rejected: fields.rejected }
  const blocks = judgeBlocks(fields.ok.blocks)
  if ('rejected' in blocks) return blocks
  return { ok: { id: fields.ok.id, role: fields.ok.role, blocks: blocks.ok } }
}
