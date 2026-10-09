import type { ToolCallBlock } from '@omne-harness-lite/content-blocks'
import { compareInteger, type CheckedPrefix, type LogEntry } from '@omne-harness-lite/session-log'
import { readDriverRunState } from './run-history.ts'
import { inspectSessionToolAdoption, type SessionToolAdoption } from './driver-tool-adoption.ts'
import {
  readDriverModelHistory,
  DriverHistoryInvalid,
  requireHistory,
  type DriverModelReply,
} from './driver-model-history.ts'

export interface DriverToolBatch {
  readonly origin: {
    readonly run: string
    readonly attempt: NonNullable<LogEntry['attempt']>
    readonly assistantMessage: string
  }
  readonly reply: DriverModelReply
  readonly latestAttempt: NonNullable<LogEntry['attempt']>
  readonly runState: 'open' | 'ended'
  readonly adoption: {
    readonly entry: LogEntry
    readonly key: string
    readonly adoption: SessionToolAdoption
  }
  readonly calls: readonly [ToolCallBlock, ...ToolCallBlock[]]
}

/** Read only this exact original prefix. Neither a batch nor a report is an execution grant. */
export function readDriverToolBatch(
  prefix: CheckedPrefix,
  message: string,
):
  | { readonly kind: 'batch'; readonly batch: DriverToolBatch }
  | { readonly kind: 'notFound' | 'unavailable' } {
  try {
    const models = readDriverModelHistory(prefix)
    const reply = models.replies.get(message)
    if (!reply) return { kind: 'notFound' }
    const calls = completedCalls(reply)
    if (!calls.length) return { kind: 'notFound' }
    uniqueCalls(models.replies.values())
    const adoption = adopted(prefix, reply)
    const { run, attempt } = reply.entry
    requireHistory(
      run !== undefined && attempt !== undefined,
      'tool reply has no original Run/attempt',
    )
    const state = readDriverRunState(prefix.entries, run, attempt)
    requireHistory(
      state?.original && state.latest !== undefined,
      'tool reply has no actual original attempt',
    )
    return {
      kind: 'batch',
      batch: {
        origin: { run, attempt, assistantMessage: message },
        reply,
        latestAttempt: state.latest,
        runState: state.ended ? 'ended' : 'open',
        adoption,
        calls: [calls[0]!, ...calls.slice(1)],
      },
    }
  } catch (error) {
    if (error instanceof DriverHistoryInvalid) return { kind: 'unavailable' }
    throw error
  }
}
function uniqueCalls(replies: Iterable<DriverModelReply>) {
  const ids = new Set<string>()
  for (const reply of replies) {
    for (const block of completedCalls(reply)) {
      requireHistory(!ids.has(block.callId), 'tool call identity repeats in the original session')
      ids.add(block.callId)
    }
  }
}
function adopted(prefix: CheckedPrefix, reply: DriverModelReply): DriverToolBatch['adoption'] {
  const values: DriverToolBatch['adoption'][] = []
  const call = reply.response.response!.call.callId
  for (const entry of prefix.entries) {
    const parsed = inspectSessionToolAdoption(prefix.scope, entry)
    requireHistory(!('failure' in parsed), 'uninterpretable original tool adoption')
    if (parsed.kind !== 'adoption' || parsed.adoption.call !== call) continue
    values.push({ entry, key: entry.dedupeKey!, adoption: parsed.adoption })
  }
  const original = values[0]
  requireHistory(values.length === 1 && original !== undefined, 'tool reply has no unique adoption')
  const value = original.adoption
  requireHistory(
    value.run === reply.entry.run &&
      reply.entry.attempt !== undefined &&
      compareInteger(value.attempt, reply.entry.attempt) === 0 &&
      compareInteger(original.entry.position, reply.created.position) < 0,
    'tool adoption changes the original Run, attempt or order',
  )
  return original
}

function completedCalls(reply: DriverModelReply): ToolCallBlock[] {
  const result: ToolCallBlock[] = []
  for (const block of reply.message.blocks) {
    if (block.kind !== 'tool_call') continue
    requireHistory(block.complete === true, 'unfinished tool fragment cannot complete a batch')
    result.push(block)
  }
  return result
}
