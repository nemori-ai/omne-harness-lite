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

export type MessageIdParse = { readonly ok: true; readonly value: MessageId } | { readonly ok: false; readonly error: MessageIdParseError }

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
