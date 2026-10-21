import {
  CONTENT_BLOCK_KINDS,
  judgeBlockIdentity,
  judgeContentBlock,
  type BlockId,
  type ContentBlock,
  type ContentBlockRejection,
  type ThinkingContentBlock,
  type Visibility,
} from '@omne-harness/content-block'
import { judgeJsonValue, type JsonValue } from '@omne-harness/json-text'
import {
  REASONING_STATE_FIELDS,
  judgeReasoningState,
  type ReasoningStatePart,
} from './reasoning.ts'
import { hasUnreadableOwn, isPlainRecord, isRecord, nonEmpty } from './values.ts'

/** A call whose arguments arrived whole and decode to a value tree. */
export type ToolCallPart = Readonly<{
  kind: 'tool_call'
  id: BlockId
  visibility: Visibility
  callId: string
  name: string
  arguments: JsonValue
}>

/** A call whose arguments did not all arrive. `partial` is the text so far, not decoded. */
export type IncompleteToolCallPart = Readonly<{
  kind: 'tool_call_incomplete'
  id: BlockId
  visibility: Visibility
  callId: string
  name: string
  partial: string
}>

/** A call whose arguments all arrived but do not decode. `raw` is the text, not decoded. */
export type UnparsedToolCallPart = Readonly<{
  kind: 'tool_call_unparsed'
  id: BlockId
  visibility: Visibility
  callId: string
  name: string
  raw: string
}>

/** The marker of a tool result. The content blocks that follow it in the message are the body. */
export type ToolResultPart = Readonly<{
  kind: 'tool_result'
  id: BlockId
  visibility: Visibility
  callId: string
}>

/** A content block that any role may have: every one except the thinking block, which only an assistant has. */
export type MessageContentBlock = Exclude<ContentBlock, ThinkingContentBlock>

/** The three parts of a call. Only an `assistant` message has them. */
export type CallPart = ToolCallPart | IncompleteToolCallPart | UnparsedToolCallPart

export type ToolPart = CallPart | ToolResultPart

export type MessagePart = ContentBlock | ToolPart | ReasoningStatePart

type ToolKind = ToolPart['kind']
const REASONING_STATE_KIND = 'reasoning_state'
type ToolField = 'id' | 'visibility' | 'callId' | 'name' | 'arguments' | 'partial' | 'raw'

export type PartRejection =
  | 'extra'
  | 'unknown'
  | 'json'
  | 'payload'
  | 'pairs'
  | ToolField
  | ContentBlockRejection

export type PartJudgment = { readonly ok: MessagePart } | { readonly rejected: PartRejection }

/** Every tool kind with the fields it must have besides `kind`. One table: no second key list. */
const TOOL_FIELDS: Readonly<Record<ToolKind, readonly ToolField[]>> = {
  tool_call: ['id', 'visibility', 'callId', 'name', 'arguments'],
  tool_call_incomplete: ['id', 'visibility', 'callId', 'name', 'partial'],
  tool_call_unparsed: ['id', 'visibility', 'callId', 'name', 'raw'],
  tool_result: ['id', 'visibility', 'callId'],
}

function isToolKind(kind: string): kind is ToolKind {
  return Object.hasOwn(TOOL_FIELDS, kind)
}

function isKnownPartKind(kind: string): boolean {
  return (
    CONTENT_BLOCK_KINDS.some(known => known === kind) ||
    isToolKind(kind) ||
    kind === REASONING_STATE_KIND
  )
}

export function isToolPart(part: MessagePart): part is ToolPart {
  return isToolKind(part.kind)
}

function reject(rejected: PartRejection): PartJudgment {
  return { rejected }
}

/** Closed keys come first. A value with any other key is refused before a field is read. */
function keyRejection(
  fields: readonly PartRejection[],
  value: Record<string, unknown>,
): PartRejection | undefined {
  if (Object.keys(value).some(key => key !== 'kind' && !fields.some(field => field === key))) {
    return 'extra'
  }
  return fields.find(field => !Object.hasOwn(value, field))
}

function judgeCall(value: Record<string, unknown>, base: Base): PartJudgment {
  if (!nonEmpty(value.name)) return reject('name')
  const judged = judgeJsonValue(value.arguments)
  if ('rejected' in judged) return reject('arguments')
  return { ok: { kind: 'tool_call', ...base, name: value.name, arguments: judged.ok } }
}

function judgeIncomplete(value: Record<string, unknown>, base: Base): PartJudgment {
  if (base.visibility.toHuman || base.visibility.toModel) return reject('visibility')
  if (typeof value.name !== 'string') return reject('name')
  if (typeof value.partial !== 'string') return reject('partial')
  return {
    ok: { kind: 'tool_call_incomplete', ...base, name: value.name, partial: value.partial },
  }
}

function judgeUnparsed(value: Record<string, unknown>, base: Base): PartJudgment {
  if (typeof value.name !== 'string') return reject('name')
  if (typeof value.raw !== 'string') return reject('raw')
  return { ok: { kind: 'tool_call_unparsed', ...base, name: value.name, raw: value.raw } }
}

type Base = Readonly<{ id: BlockId; visibility: Visibility; callId: string }>

function judgeToolPart(kind: ToolKind, value: Record<string, unknown>): PartJudgment {
  const closed = keyRejection(TOOL_FIELDS[kind], value)
  if (closed !== undefined) return reject(closed)
  const identity = judgeBlockIdentity(value)
  if ('rejected' in identity) return reject(identity.rejected)
  if (!nonEmpty(value.callId)) return reject('callId')
  const base: Base = { ...identity.ok, callId: value.callId }
  switch (kind) {
    case 'tool_call':
      return judgeCall(value, base)
    case 'tool_call_incomplete':
      return judgeIncomplete(value, base)
    case 'tool_call_unparsed':
      return judgeUnparsed(value, base)
    case 'tool_result':
      return { ok: { kind, ...base } }
  }
}

/** Its keys are closed like a tool part's, then `id`, `visibility`, `payload`, `pairs` in order. */
function judgeReasoningPart(value: Record<string, unknown>): PartJudgment {
  const closed = keyRejection(REASONING_STATE_FIELDS, value)
  if (closed !== undefined) return reject(closed)
  const judged = judgeReasoningState(value)
  return 'rejected' in judged ? reject(judged.rejected) : { ok: judged.ok }
}

function isReadable(value: Record<string, unknown>): boolean {
  return isPlainRecord(value) && !hasUnreadableOwn(value)
}

/** The judgment of a plain object whose kind is a string, or `undefined` for a content block. */
function judgeByKind(value: unknown): PartJudgment | undefined {
  if (!isPlainRecord(value) || typeof value.kind !== 'string') return undefined
  if (isToolKind(value.kind)) return judgeToolPart(value.kind, value)
  if (value.kind === REASONING_STATE_KIND) return judgeReasoningPart(value)
  return isKnownPartKind(value.kind) ? undefined : reject('unknown')
}

/**
 * One part. A string kind outside the ten closed names is `unknown`. A missing or non-string
 * kind falls through to `judgeContentBlock` and is `kind`. An object with an accessor, a
 * non-enumerable key, or a prototype other than a plain one is `json`. For a tool part the
 * closed keys are checked before any field is read, and only `arguments` is walked, by
 * `judgeJsonValue`.
 */
export function judgePart(value: unknown): PartJudgment {
  if (isRecord(value) && !isReadable(value)) return reject('json')
  const byKind = judgeByKind(value)
  if (byKind !== undefined) return byKind
  const judged = judgeContentBlock(value)
  if ('rejected' in judged) return reject(judged.rejected)
  return { ok: judged.ok }
}
