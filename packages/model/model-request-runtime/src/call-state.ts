import type { ModelCallId } from '@omne-harness-lite/call-accounts'
import type { SessionRef } from '@omne-harness-lite/messages'
import { rejectAcknowledgedHistory, type CallHistoryResult } from './call-history.ts'
import type { DispatchGuardPhase } from './dispatch-guard.ts'

/** Process-owned responsibility, never a replacement for a durable log fact. */
export type LocalCallResponsibility =
  | {
      readonly session: SessionRef
      readonly callId: ModelCallId
      readonly phase: 'open'
    }
  | {
      readonly session: SessionRef
      readonly callId: ModelCallId
      readonly phase: 'reply_pending'
      readonly responseId: string
    }

export type CallStateResult =
  | { readonly unavailable: true }
  | { readonly callNotFound: true }
  | { readonly phase: DispatchGuardPhase; readonly source: 'durable' | 'local_responsibility' }

/**
 * RT5 S-6/S-34: the durable prefix wins over a pending local write.
 * A local open has no durable record; a pending reply may be shown only for its
 * opened dispatch while the complete response is still absent in this prefix.
 * The caller must separately retain unknown writers and recapture before action.
 */
export function projectCallState(input: {
  readonly session: SessionRef
  readonly callId: ModelCallId
  readonly history: CallHistoryResult
  readonly local?: LocalCallResponsibility
}): CallStateResult {
  const { session, callId, local } = input
  // RT12 S-97: this projection has no acknowledged small view; an ACK fails closed here.
  const history = rejectAcknowledgedHistory(input.history)
  if ('unavailable' in history) return { unavailable: true }
  const sameLocal = local?.session === session && local.callId === callId
  if ('absent' in history)
    return sameLocal && local?.phase === 'open'
      ? { phase: 'open', source: 'local_responsibility' }
      : { callNotFound: true }
  if (history.known.session !== session || history.known.callId !== callId)
    return { unavailable: true }
  if (
    history.known.phase === null ||
    (history.known.intent !== null &&
      history.known.ending === null &&
      history.known.phase !== 'complete' &&
      history.known.phase !== 'interrupted' &&
      // S-86: a durable ready marker is already the complete/interrupted terminal fact.
      history.known.phase !== 'reply_pending')
  )
    return { unavailable: true }
  const last = history.known.dispatches.at(-1)
  if (
    sameLocal &&
    local?.phase === 'reply_pending' &&
    history.known.phase === 'speaking' &&
    last?.opened !== null &&
    last?.response === null &&
    last?.record.response === local.responseId
  )
    return { phase: 'reply_pending', source: 'local_responsibility' }
  return { phase: history.known.phase, source: 'durable' }
}
