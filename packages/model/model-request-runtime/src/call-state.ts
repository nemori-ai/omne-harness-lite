import type { ModelCallId } from '@omne-harness-lite/call-accounts'
import type { SessionRef } from '@omne-harness-lite/messages'
import {
  rejectAcknowledgedHistory,
  type CallHistoryResult,
  type CallHistoryKnown,
} from './call-history.ts'
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
  if (!durablePhaseAvailable(history.known)) return { unavailable: true }
  if (localReplyPending(history.known, local, sameLocal))
    return { phase: 'reply_pending', source: 'local_responsibility' }
  return { phase: history.known.phase, source: 'durable' }
}

function durablePhaseAvailable(
  known: CallHistoryKnown,
): known is CallHistoryKnown & { readonly phase: DispatchGuardPhase } {
  return !(
    known.phase === null ||
    (known.intent !== null &&
      known.ending === null &&
      known.phase !== 'complete' &&
      known.phase !== 'interrupted' &&
      // S-86: a durable ready marker is already the complete/interrupted terminal fact.
      known.phase !== 'reply_pending')
  )
}

function localReplyPending(
  known: CallHistoryKnown,
  local: LocalCallResponsibility | undefined,
  sameLocal: boolean,
): boolean {
  const last = known.dispatches.at(-1)
  return (
    sameLocal &&
    local?.phase === 'reply_pending' &&
    known.phase === 'speaking' &&
    last?.opened !== null &&
    last?.response === null &&
    last?.record.response === local.responseId
  )
}
