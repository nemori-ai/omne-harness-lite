import {
  CONTENT_BLOCK_KINDS,
  judgeBlockIdentity,
  judgeContentBlock,
  type BlockId,
  type ContentBlock,
  type ContentBlockRejection,
  type Visibility,
} from '@omne-harness/content-block'
import { judgeJsonValue, type JsonValue } from '@omne-harness/json-text'

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

export type ToolPart = ToolCallPart | IncompleteToolCallPart | UnparsedToolCallPart | ToolResultPart

export type MessagePart = ContentBlock | ToolPart

type ToolKind = ToolPart['kind']
type ToolField = 'id' | 'visibility' | 'callId' | 'name' | 'arguments' | 'partial' | 'raw'

export type PartRejection = 'extra' | 'unknown' | 'json' | ToolField | ContentBlockRejection

export type PartJudgment = { readonly ok: MessagePart } | { readonly rejected: PartRejection }

/** Every tool kind with the fields it must have besides `kind`. One table: no second key list. */
const TOOL_FIELDS: Readonly<Record<ToolKind, readonly ToolField[]>> = {
  tool_call: ['id', 'visibility', 'callId', 'name', 'arguments'],
  tool_call_incomplete: ['id', 'visibility', 'callId', 'name', 'partial'],
  tool_call_unparsed: ['id', 'visibility', 'callId', 'name', 'raw'],
  tool_result: ['id', 'visibility', 'callId'],
}

const CALL_KINDS: readonly string[] = ['tool_call', 'tool_call_incomplete', 'tool_call_unparsed']

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/** True when a getter, a setter, or a non-enumerable key would hide what a read does. */
export function hasUnreadableOwn(value: object): boolean {
  return Object.getOwnPropertyNames(value).some(key => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    return descriptor === undefined || descriptor.enumerable !== true || !('value' in descriptor)
  })
}

function isToolKind(kind: string): kind is ToolKind {
  return Object.hasOwn(TOOL_FIELDS, kind)
}

function isKnownPartKind(kind: string): boolean {
  return CONTENT_BLOCK_KINDS.some(known => known === kind) || isToolKind(kind)
}

export function isToolPart(part: MessagePart): part is ToolPart {
  return isToolKind(part.kind)
}

/** A call part of any of the three kinds. The marker is not one. */
export function isCallPart(part: MessagePart): boolean {
  return CALL_KINDS.includes(part.kind)
}

export function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function reject(rejected: PartRejection): PartJudgment {
  return { rejected }
}

/** Closed keys come first. A value with any other key is refused before a field is read. */
function keyRejection(kind: ToolKind, value: Record<string, unknown>): PartRejection | undefined {
  const fields = TOOL_FIELDS[kind]
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
  const closed = keyRejection(kind, value)
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

function isReadable(value: Record<string, unknown>): boolean {
  return isPlainRecord(value) && !hasUnreadableOwn(value)
}

/** The judgment of a plain object whose kind is a string, or `undefined` for a content block. */
function judgeByKind(value: unknown): PartJudgment | undefined {
  if (!isPlainRecord(value) || typeof value.kind !== 'string') return undefined
  if (isToolKind(value.kind)) return judgeToolPart(value.kind, value)
  return isKnownPartKind(value.kind) ? undefined : reject('unknown')
}

/**
 * One part. A string kind outside the nine closed names is `unknown`. A missing or non-string
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
