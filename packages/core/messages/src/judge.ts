import {
  judgeContentBlock,
  readJsonStrict,
  type ContentBlockRejection,
  type JsonObject,
} from '@omne-harness-lite/content-blocks'
import { isObject, snapshot } from './json.ts'
import { rawBlockTree } from './blocks.ts'
import { brandMessage, brandRecord, isWireMessage, isWireRecord } from './values.ts'
import { dispatchedParametersValid, jsonEqual } from './parameters.ts'
import type { MessageJudgment, LogPrefixView, ModelInvocationJudgment } from './types.ts'

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
  'attempt_started',
  'interrupted',
  'system_wait_answered',
  'loop_guard',
  'peer_session_note',
  'scheduled_trigger',
]

/** S-39 first stage: all named predicates precede the remaining shape check. */
export function judgeMessage(value: unknown): MessageJudgment {
  const copied = snapshot(value)
  if (copied === undefined || !isObject(copied))
    return Object.freeze({ rejected: 'malformed' } as const)
  if (
    Object.hasOwn(copied, 'type') &&
    (typeof copied.type !== 'string' || !MESSAGE_TYPES.includes(copied.type))
  )
    return Object.freeze({ rejected: 'type_unknown' } as const)
  const roots = Array.isArray(copied.blocks) ? copied.blocks : []
  const checked = roots.map(judgeContentBlock)
  for (const reason of BLOCK_REJECTIONS) {
    if (checked.some(result => 'rejected' in result && result.rejected === reason))
      return Object.freeze({ rejected: reason })
  }
  const ids = new Set<string>()
  for (const block of rawBlockTree(roots)) {
    if (typeof block.id === 'string') {
      if (ids.has(block.id)) return Object.freeze({ rejected: 'block_id_duplicate' } as const)
      ids.add(block.id)
    }
  }
  if (copied.type === 'tool' && Array.isArray(copied.blocks)) {
    const block = copied.blocks[0]
    if (
      copied.blocks.length !== 1 ||
      !isObject(block) ||
      block.kind !== 'tool_result' ||
      (Object.hasOwn(copied, 'callId') &&
        Object.hasOwn(block, 'callId') &&
        copied.callId !== block.callId)
    )
      return Object.freeze({ rejected: 'tool_message_block_count' } as const)
  }
  if (
    copied.type === 'tool_internal' &&
    roots.some(
      block => isObject(block) && isObject(block.visibility) && block.visibility.toModel === true,
    )
  )
    return Object.freeze({ rejected: 'tool_internal_block_visible_to_model' } as const)
  const source = isObject(copied.source) ? copied.source : undefined
  if (copied.type === 'system_reminder' && source !== undefined) {
    if (
      (copied.nature === 'event' || copied.nature === 'state') &&
      typeof source.kind === 'string' &&
      ((STATE_SOURCES.includes(source.kind) && copied.nature !== 'state') ||
        (EVENT_SOURCES.includes(source.kind) && copied.nature !== 'event'))
    )
      return Object.freeze({ rejected: 'reminder_nature_mismatch' } as const)
    if (source.kind === 'runtime_context_changed' && !Object.hasOwn(source, 'previous'))
      return Object.freeze({ rejected: 'reminder_state_without_previous' } as const)
  }
  if (
    copied.type === 'compaction' &&
    Array.isArray(copied.silenced) &&
    typeof copied.id === 'string' &&
    copied.silenced.some(ref => isObject(ref) && ref.messageId === copied.id)
  )
    return Object.freeze({ rejected: 'compaction_self_reference' } as const)
  if (checked.some(result => 'rejected' in result) || !isWireMessage(copied))
    return Object.freeze({ rejected: 'malformed' } as const)
  if (
    copied.type === 'system_reminder' &&
    (copied.source.kind === 'background_execution_finished' ||
      copied.source.kind === 'background_execution_interrupted')
  ) {
    const result = copied.blocks.find(block => block.kind === 'tool_result')
    if (
      result?.kind !== 'tool_result' ||
      result.callId !== copied.source.callId ||
      (copied.source.kind === 'background_execution_finished' &&
        result.outcome !== copied.source.outcome)
    )
      return Object.freeze({ rejected: 'malformed' } as const)
  }
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
    (copied.kind === 'model_call_dispatched' && !dispatchedValid(copied))
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
