import {
  judgeContentBlock,
  readJsonStrict,
  type ContentBlockJudgment,
  type ContentBlockRejection,
  type JsonObject,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import { isObject, snapshot } from './json.ts'
import { rawBlockTree } from './blocks.ts'
import {
  brandMessage,
  brandRecord,
  isWireMessage,
  isWireRecord,
  isWireCreatedPayload,
  brandCreatedPayload,
  type Wire,
} from './values.ts'
import { dispatchedParametersValid, jsonEqual } from './parameters.ts'
import type {
  MessageJudgment,
  Message,
  MessageRejection,
  LogPrefixView,
  ModelInvocationJudgment,
  ModelCallCreatedPayloadJudgment,
  ModelReplyMessageJudgment,
} from './types.ts'

const MESSAGE_TYPES: readonly string[] = Object.freeze([
  'system',
  'user',
  'assistant',
  'tool',
  'tool_internal',
  'system_reminder',
  'compaction',
])
const BLOCK_REJECTIONS: readonly ContentBlockRejection[] = Object.freeze([
  'kind_unknown',
  'visibility_missing',
  'incomplete_call_visible',
  'call_in_result',
  'modality_mismatch',
])
const STATE_SOURCES = ['runtime_context_changed', 'runtime_context_snapshot']
const EVENT_SOURCES = [
  'background_execution_finished',
  'background_execution_interrupted',
  'interrupted',
  'system_wait_answered',
  'loop_guard',
  'peer_session_note',
  'scheduled_trigger',
]

function unknownMessageType(value: JsonObject): boolean {
  return (
    Object.hasOwn(value, 'type') &&
    (typeof value.type !== 'string' || !MESSAGE_TYPES.includes(value.type))
  )
}
function namedBlockRejection(
  checked: readonly ContentBlockJudgment[],
): MessageRejection | undefined {
  for (const reason of BLOCK_REJECTIONS) {
    if (checked.some(result => 'rejected' in result && result.rejected === reason)) return reason
  }
  return undefined
}
function duplicateBlockIds(roots: readonly JsonValue[]): boolean {
  const ids = new Set<string>()
  for (const block of rawBlockTree(roots)) {
    if (typeof block.id === 'string') {
      if (ids.has(block.id)) return true
      ids.add(block.id)
    }
  }
  return false
}
function toolMessageBlockCountValid(value: JsonObject): boolean {
  if (value.type !== 'tool' || !Array.isArray(value.blocks)) return true
  const block = value.blocks[0]
  return !(
    value.blocks.length !== 1 ||
    !isObject(block) ||
    block.kind !== 'tool_result' ||
    (Object.hasOwn(value, 'callId') &&
      Object.hasOwn(block, 'callId') &&
      value.callId !== block.callId)
  )
}
function internalBlockVisible(copied: JsonObject, roots: readonly JsonValue[]): boolean {
  return (
    copied.type === 'tool_internal' &&
    roots.some(
      block => isObject(block) && isObject(block.visibility) && block.visibility.toModel === true,
    )
  )
}
function reminderNatureMismatch(copied: JsonObject, source: JsonObject): boolean {
  return (
    (copied.nature === 'event' || copied.nature === 'state') &&
    typeof source.kind === 'string' &&
    ((STATE_SOURCES.includes(source.kind) && copied.nature !== 'state') ||
      (EVENT_SOURCES.includes(source.kind) && copied.nature !== 'event'))
  )
}
function reminderRejection(copied: JsonObject): MessageRejection | undefined {
  const source = isObject(copied.source) ? copied.source : undefined
  if (copied.type !== 'system_reminder' || source === undefined) return undefined
  if (reminderNatureMismatch(copied, source)) return 'reminder_nature_mismatch'
  if (source.kind === 'runtime_context_changed' && !Object.hasOwn(source, 'previous'))
    return 'reminder_state_without_previous'
  return undefined
}
function compactionSelfReferences(copied: JsonObject): boolean {
  return (
    copied.type === 'compaction' &&
    Array.isArray(copied.silenced) &&
    typeof copied.id === 'string' &&
    copied.silenced.some(ref => isObject(ref) && ref.messageId === copied.id)
  )
}
function messageRelationsRejection(
  copied: JsonObject,
  roots: readonly JsonValue[],
): MessageRejection | undefined {
  if (duplicateBlockIds(roots)) return 'block_id_duplicate'
  if (!toolMessageBlockCountValid(copied)) return 'tool_message_block_count'
  if (internalBlockVisible(copied, roots)) return 'tool_internal_block_visible_to_model'
  const reminder = reminderRejection(copied)
  if (reminder !== undefined) return reminder
  if (compactionSelfReferences(copied)) return 'compaction_self_reference'
  return undefined
}
function backgroundResultMatches(copied: Wire<Message>): boolean {
  if (
    copied.type !== 'system_reminder' ||
    (copied.source.kind !== 'background_execution_finished' &&
      copied.source.kind !== 'background_execution_interrupted')
  )
    return true
  const result = copied.blocks.find(block => block.kind === 'tool_result')
  return (
    result?.kind === 'tool_result' &&
    result.callId === copied.source.callId &&
    (copied.source.kind !== 'background_execution_finished' ||
      result.outcome === copied.source.outcome)
  )
}

/** S-39 first stage: all named predicates precede the remaining shape check. */
export function judgeMessage(value: unknown): MessageJudgment {
  const copied = snapshot(value)
  if (copied === undefined || !isObject(copied))
    return Object.freeze({ rejected: 'malformed' } as const)
  if (unknownMessageType(copied)) return Object.freeze({ rejected: 'type_unknown' } as const)
  const roots = Array.isArray(copied.blocks) ? copied.blocks : []
  const checked = roots.map(judgeContentBlock)
  const named = namedBlockRejection(checked) ?? messageRelationsRejection(copied, roots)
  if (named !== undefined) return Object.freeze({ rejected: named })
  if (checked.some(result => 'rejected' in result) || !isWireMessage(copied))
    return Object.freeze({ rejected: 'malformed' } as const)
  if (!backgroundResultMatches(copied)) return Object.freeze({ rejected: 'malformed' } as const)
  return Object.freeze({ ok: brandMessage(copied) })
}

/** S-39 second stage. The complete consistent prefix is a caller-owned precondition. */
export function judgeMessageInLog(value: unknown, prefix: LogPrefixView): MessageJudgment {
  const first = judgeMessage(value)
  if ('rejected' in first) return first
  if (
    first.ok.type === 'compaction' &&
    first.ok.silenced.some(ref => !prefix.some(message => message.id === ref.messageId))
  )
    return Object.freeze({ rejected: 'compaction_forward_reference' } as const)
  return first
}
export function judgeMessageText(text: string): MessageJudgment {
  const read = readJsonStrict(text)
  return 'failed' in read
    ? Object.freeze({ rejected: 'malformed' } as const)
    : judgeMessage(read.ok)
}
/** S-49/S-50 complete single-record validity, separate from validate's shape-only result. */
export function judgeModelInvocationRecord(value: unknown): ModelInvocationJudgment {
  const copied = snapshot(value)
  if (
    copied === undefined ||
    !isObject(copied) ||
    !isWireRecord(copied) ||
    (copied.kind === 'model_call_dispatched' && !dispatchedValid(copied)) ||
    (copied.kind === 'model_call_acknowledged' &&
      copied.accountingWitness !== undefined &&
      (copied.target.kind !== 'response' ||
        copied.target.response !== copied.accountingWitness.response))
  )
    return Object.freeze({ rejected: 'malformed' } as const)
  return Object.freeze({ ok: brandRecord(copied) })
}
export function judgeModelInvocationRecordText(text: string): ModelInvocationJudgment {
  const read = readJsonStrict(text)
  return 'failed' in read
    ? Object.freeze({ rejected: 'malformed' } as const)
    : judgeModelInvocationRecord(read.ok)
}

function dispatchedValid(value: JsonObject): boolean {
  if (
    !dispatchedParametersValid(value) ||
    !isObject(value.adaptation) ||
    !isObject(value.profileSnapshot) ||
    !isObject(value.profile) ||
    !isObject(value.adaptation.definition)
  )
    return false
  return (
    value.profileSnapshot.adaptation !== undefined &&
    jsonEqual(value.adaptation, value.profileSnapshot.adaptation) &&
    value.adaptation.definition.modelId === value.profile.routeName
  )
}

/** MS8 S-53 intrinsic value checks; never a source, permission or publication check. */
export function judgeModelCallCreatedPayload(value: unknown): ModelCallCreatedPayloadJudgment {
  const copied = snapshot(value)
  if (
    copied === undefined ||
    !isWireCreatedPayload(copied) ||
    copied.ref.session !== copied.origin.session ||
    copied.input.messages.some(message => 'rejected' in judgeMessage(message)) ||
    (copied.status === 'accepted' &&
      (!jsonEqual(copied.adopted.adaptation, copied.adopted.profileSnapshot.adaptation) ||
        copied.adopted.adaptation.definition.modelId !== copied.adopted.profile.routeName ||
        copied.adopted.messages.some(message => 'rejected' in judgeMessage(message))))
  )
    return Object.freeze({ rejected: 'malformed' } as const)
  return Object.freeze({ ok: brandCreatedPayload(copied) })
}
export function judgeModelCallCreatedPayloadText(text: string): ModelCallCreatedPayloadJudgment {
  const read = readJsonStrict(text)
  return 'failed' in read
    ? Object.freeze({ rejected: 'malformed' } as const)
    : judgeModelCallCreatedPayload(read.ok)
}
/** MS8 S-9: original first, persisted second, then the permitted first-publication relation. */
export function judgeModelReplyMessage(
  originalReply: unknown,
  persistedMessage: unknown,
): ModelReplyMessageJudgment {
  const original = judgeMessage(originalReply)
  if ('rejected' in original) return original
  if (original.ok.type !== 'assistant') return Object.freeze({ rejected: 'malformed' } as const)
  const persisted = judgeMessage(persistedMessage)
  if ('rejected' in persisted) return persisted
  if (persisted.ok.type !== 'assistant') return Object.freeze({ rejected: 'malformed' } as const)
  const a = snapshot(original.ok),
    b = snapshot(persisted.ok)
  if (!replyRepresentationsEqual(a, b)) return Object.freeze({ rejected: 'malformed' } as const)
  return Object.freeze({ ok: persisted.ok })
}
function replyRepresentationsEqual(a: JsonValue | undefined, b: JsonValue | undefined): boolean {
  if (
    a === undefined ||
    b === undefined ||
    !isObject(a) ||
    !isObject(b) ||
    !Array.isArray(a.blocks) ||
    !Array.isArray(b.blocks)
  )
    return false
  const originalBlocks = a.blocks,
    persistedBlocks = b.blocks
  return (
    membersEqual(a, b, ['blocks']) &&
    originalBlocks.length === persistedBlocks.length &&
    originalBlocks.every((block, index) => persistedBlockMatches(block, persistedBlocks[index]))
  )
}
function persistedBlockMatches(block: JsonValue, other: JsonValue | undefined): boolean {
  if (!isObject(block) || !isObject(other)) return false
  if (
    (block.kind === 'voice' || block.kind === 'image' || block.kind === 'file') &&
    !Object.hasOwn(block, 'renderings') &&
    !Object.hasOwn(block, 'transcript') &&
    Object.hasOwn(other, 'renderings') &&
    Object.hasOwn(other, 'transcript')
  )
    return membersEqual(block, other, ['renderings', 'transcript'])
  return jsonEqual(block, other)
}
/** All original members are retained; only the named top-level additions are permitted. */
function membersEqual(
  original: JsonObject,
  persisted: JsonObject,
  allowed: readonly string[],
): boolean {
  return (
    Object.keys(original).every(key => {
      const a = original[key],
        b = persisted[key]
      return (
        allowed.includes(key) ||
        (a !== undefined && b !== undefined && Object.hasOwn(persisted, key) && jsonEqual(a, b))
      )
    }) && Object.keys(persisted).every(key => allowed.includes(key) || Object.hasOwn(original, key))
  )
}
