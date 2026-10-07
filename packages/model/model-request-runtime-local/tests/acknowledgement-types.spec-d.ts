import { expectTypeOf } from 'vitest'
import type { CallKey } from '@omne-harness-lite/messages'
import type { PendingModelResponse, ResponseId } from '@omne-harness-lite/model-response'
import type { CallAccessAction } from '../src/reference-types.ts'
import type {
  AckTarget,
  AcknowledgedCallView,
  AcquireCallResult,
  CallAcknowledgement,
  CallConsumer,
  CallReadView,
  RetainedCallReadView,
} from '@omne-harness-lite/model-request-runtime'
import type {
  AcknowledgeCallInput,
  AcknowledgeCallOperation,
  AcknowledgeCallResult,
  OpenCallResult,
  ReadAttemptsResult,
  ReconciledCall,
  SettleReplyInput,
} from '@omne-harness-lite/model-request-runtime'

declare const ref: CallKey
declare const response: ResponseId
declare const view: CallReadView
declare const acknowledgedView: AcknowledgedCallView
declare const consumer: CallConsumer
declare const pending: PendingModelResponse

// RT12 S-95: AckTarget is the MS8 record projection; fields never mix.
const responseTarget: AckTarget = { kind: 'response', response }
const endedTarget: AckTarget = { kind: 'ended', ending: 'released' }
// @ts-expect-error A response target cannot also name an ending.
const mixedTarget: AckTarget = { kind: 'response', response, ending: 'released' }
void [responseTarget, endedTarget, mixedTarget]

// RT12 S-96⑤: pending requires at least one closed reason; released forbids them.
const released: CallAcknowledgement = {
  ref,
  target: responseTarget,
  acknowledgedAt: '2026-09-30T00:00:00Z',
  cleanup: 'released',
}
const pendingCleanup: CallAcknowledgement = {
  ref,
  target: responseTarget,
  acknowledgedAt: '2026-09-30T00:00:00Z',
  cleanup: 'pending',
  pendingReasons: ['writer_in_flight', 'read_in_flight'],
}
const emptyPending: CallAcknowledgement = {
  ref,
  target: responseTarget,
  acknowledgedAt: '2026-09-30T00:00:00Z',
  cleanup: 'pending',
  // @ts-expect-error Pending cleanup must name a real obstacle.
  pendingReasons: [],
}
const releasedWithReason: CallAcknowledgement = {
  ref,
  target: responseTarget,
  acknowledgedAt: '2026-09-30T00:00:00Z',
  cleanup: 'released',
  // @ts-expect-error Released cleanup has no pending reason.
  pendingReasons: ['storage_unavailable'],
}
const unknownReason: CallAcknowledgement = {
  ref,
  target: responseTarget,
  acknowledgedAt: '2026-09-30T00:00:00Z',
  cleanup: 'pending',
  // @ts-expect-error The reason set is closed.
  pendingReasons: ['not_scheduled'],
}
void [released, pendingCleanup, emptyPending, releasedWithReason, unknownReason]

// RT12 S-97: the acknowledged branch is discriminated and never carries full content.
if (view.acknowledged !== undefined) {
  expectTypeOf(view).toEqualTypeOf<AcknowledgedCallView>()
  expectTypeOf(view.result).toEqualTypeOf<undefined>()
} else {
  expectTypeOf(view).toEqualTypeOf<RetainedCallReadView>()
}
// @ts-expect-error An acknowledged view hands out no consumer handle.
const acquiredWithHandle: AcquireCallResult = { view: acknowledgedView, consumer }
void acquiredWithHandle
expectTypeOf<CallAccessAction>().toEqualTypeOf<'read' | 'wait' | 'settle' | 'cancel' | 'ack'>()

// RT12 S-96: the fifteenth operation's input and closed failure set.
expectTypeOf<AcknowledgeCallInput>().toEqualTypeOf<{
  readonly ref: CallKey
  readonly expectedResult: AckTarget
}>()
expectTypeOf<AcknowledgeCallOperation>().toEqualTypeOf<
  (input: AcknowledgeCallInput) => Promise<AcknowledgeCallResult>
>()
const noStopped: AcknowledgeCallResult = {
  // @ts-expect-error Host stop does not add runtimeStopped to the ACK failure set.
  runtimeStopped: true,
}
void noStopped

// RT12 S-100: acknowledged branches of openCall, readAttempts and reconcile.
const recognized: OpenCallResult = { ref, callId: ref.callId, acknowledged: acknowledgedView }
const attempts: ReadAttemptsResult = { acknowledged: acknowledgedView }
const reconciled: ReconciledCall = { callId: ref.callId, acknowledged: acknowledgedView }
// @ts-expect-error The acknowledged branch is not also a lifecycle state.
const mixedOpen: OpenCallResult = {
  ref,
  callId: ref.callId,
  state: 'complete',
  acknowledged: acknowledgedView,
}
void [recognized, attempts, reconciled, mixedOpen]

// RT12 S-99: retainedResult is optional; persisted stays outside ordinary settleReply.
const settle: SettleReplyInput = {
  ...ref,
  disposition: { consumed: { by: 'compaction' } },
  retainedResult: pending,
}
const persisted: SettleReplyInput = {
  ...ref,
  // @ts-expect-error persisted is not an ordinary disposition.
  disposition: 'persisted',
}
void [settle, persisted]
