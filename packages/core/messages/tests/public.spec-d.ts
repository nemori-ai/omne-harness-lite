import { expectTypeOf, it } from 'vitest'
import type { JsonNumber, ToolResultBlock } from '@omne-harness-lite/content-blocks'
import type { AttemptId, ModelCallId } from '@omne-harness-lite/call-accounts'
import type {
  Message,
  OutboundMessage,
  ToolInternalMessage,
  SystemReminderMessage,
  ModelInvocationRecord,
  ModelCallEndedRecord,
  ModelCallDispatchedRecord,
  ModelCallAcknowledgedRecord,
  ModelCallAccountingWitness,
  AssistantMessage,
  ToolMessage,
  InterruptedSource,
  MessageId,
  LogPrefixView,
} from '@omne-harness-lite/messages'
import { judgePairing, isReadable, judgeCompactionList } from '@omne-harness-lite/messages'
declare const message: Message
declare const internal: ToolInternalMessage
declare const messageId: MessageId
declare const result: Extract<ToolResultBlock, { readonly outcome: 'interrupted' }>
it('public unions are complete, branded, immutable and keep owned numeric identities', () => {
  expectTypeOf<Message['type']>().toEqualTypeOf<
    'system' | 'user' | 'assistant' | 'tool' | 'tool_internal' | 'system_reminder' | 'compaction'
  >()
  expectTypeOf<ModelInvocationRecord['kind']>().toEqualTypeOf<
    | 'model_call_created'
    | 'model_call_reply_ready'
    | 'model_call_dispatched'
    | 'model_call_opened'
    | 'model_call_interrupt_intent'
    | 'model_call_ended'
    | 'model_selection_changed'
    | 'model_call_acknowledged'
  >()
  expectTypeOf<Extract<InterruptedSource, { what: 'model_call' }>['about']>().toEqualTypeOf<
    | { readonly kind: 'model'; readonly call: ModelCallId; readonly dispatch: JsonNumber }
    | undefined
  >()
  // @ts-expect-error tool internal messages cannot reach an outbound consumer
  const outbound: OutboundMessage = internal
  // @ts-expect-error plain strings have not passed MessageId's owner parser
  const identity: MessageId = 'unvalidated'
  // @ts-expect-error frozen public messages cannot be edited
  message.id = messageId
  const system = { ...internal, type: 'system' } as const
  // @ts-expect-error system is outside an ordered log prefix
  const prefix: LogPrefixView = [system]
  void outbound
  void identity
  void prefix
})
it('closed variants exclude unsupported ending/cause and interruption combinations', () => {
  const badEnding = { kind: 'model_call_ended', call: 'mc', ending: 'complete' } as const
  const badRelease = {
    kind: 'model_call_ended',
    call: 'mc',
    ending: 'released',
    cause: 'withdrawn',
  } as const
  const bothFields = {
    kind: 'model_call_ended',
    call: 'mc',
    ending: 'interrupted',
    initiator: 'user',
    cause: 'credential_unavailable',
  } as const
  const modelAboutRun = {
    kind: 'interrupted',
    what: 'run',
    by: 'user',
    hadContent: false,
    about: { kind: 'model', call: 'mc', dispatch: 1 },
  } as const
  // @ts-expect-error an ending declared complete cannot be used for this record
  const invalid: ModelCallEndedRecord = badEnding
  // @ts-expect-error released only accepts credential_unavailable
  const withdrawn: ModelCallEndedRecord = badRelease
  // @ts-expect-error interrupted carries an initiator and no cause
  const both: ModelCallEndedRecord = bothFields
  // @ts-expect-error run interruptions cannot name one model dispatch
  const run: InterruptedSource = modelAboutRun
  void invalid
  void withdrawn
  void both
  void run
})
it('semantic discrimination rejects wrong nature, incomplete complete replies, and foreground terminated reason', () => {
  const badNature = {
    id: messageId,
    type: 'system_reminder',
    createdAt: 'x',
    blocks: [],
    nature: 'event',
    source: { kind: 'runtime_context_snapshot', reason: 'session_start', blocks: {} },
  } as const
  const halfComplete = {
    id: messageId,
    type: 'assistant',
    createdAt: 'x',
    response: 'rsp',
    ending: 'complete',
    blocks: [
      {
        id: result.id,
        kind: 'tool_call',
        complete: false,
        visibility: { toHuman: false, toModel: false },
        rawArguments: '{',
      },
    ],
  } as const
  const backgroundReason = {
    id: messageId,
    type: 'tool',
    createdAt: 'x',
    callId: result.callId,
    blocks: [{ ...result, reason: { code: 'terminated_by_agent', text: 'stop' } }],
  } as const
  const contextLike = {
    get() {
      return undefined
    },
  }
  // @ts-expect-error state sources cannot be declared event reminders
  const reminder: SystemReminderMessage = badNature
  // @ts-expect-error complete assistants cannot contain an incomplete call
  const complete: AssistantMessage = halfComplete
  // @ts-expect-error foreground ToolMessage disallows the background-only terminated code
  const tool: ToolMessage = backgroundReason
  // @ts-expect-error explicit prefix is required
  isReadable({ messageId, blockId: result.id })
  // @ts-expect-error compaction owner inputs must be explicit, even when empty
  judgeCompactionList(
    { id: messageId, type: 'compaction', createdAt: 'x', blocks: [], silenced: [] },
    [],
  )
  // @ts-expect-error the ordered prefix cannot be replaced by a Context-shaped object
  judgePairing(message, contextLike)
  void reminder
  void complete
  void tool
})

// @ts-expect-error MR owns PendingModelResponse; messages must not copy or re-export it
import type { PendingModelResponse } from '@omne-harness-lite/messages'
import type {
  CallKey,
  CreationKey,
  ModelCallCreatedPayload,
  ModelCallCreationInput,
  ModelCallPayloadRef,
  ModelCallCreatedRecord,
  ModelCallCreatedPayloadJudgment,
  ModelReplyMessageJudgment,
} from '@omne-harness-lite/messages'
import type { CapabilityId } from '@omne-harness-lite/content-blocks'
import { judgeModelCallCreatedPayload, judgeModelReplyMessage } from '@omne-harness-lite/messages'
declare const key: CreationKey
declare const payloadRef: ModelCallPayloadRef & { readonly kind: 'created' }
it('MS7 public owner types preserve paired creation and original-first reply signatures', () => {
  expectTypeOf<CallKey['callId']>().toEqualTypeOf<ModelCallId>()
  expectTypeOf<ModelCallCreationInput['targetChangedBy']>().toEqualTypeOf<
    CapabilityId | undefined
  >()
  expectTypeOf(
    judgeModelCallCreatedPayload,
  ).returns.toEqualTypeOf<ModelCallCreatedPayloadJudgment>()
  expectTypeOf(judgeModelReplyMessage).returns.toEqualTypeOf<ModelReplyMessageJudgment>()
  expectTypeOf<ModelCallCreatedRecord>().not.toExtend<Message>()
  const single = {
    kind: 'model_call_ended',
    call: 'call',
    ending: 'undispatched',
    cause: 'withdrawn',
    creationKey: key,
  } as const
  // @ts-expect-error creationKey requires a created payload ref
  const badPair: ModelCallEndedRecord = single
  const wrongEnding = {
    ...single,
    ending: 'released',
    cause: 'credential_unavailable',
    payload: payloadRef,
  } as const
  // @ts-expect-error only undispatched permits creation members
  const badEnding: ModelCallEndedRecord = wrongEnding
  type Accepted = Extract<ModelCallCreatedPayload, { status: 'accepted' }>
  expectTypeOf<Accepted['adopted']['profileSnapshot']>().toEqualTypeOf<
    ModelCallDispatchedRecord['profileSnapshot']
  >()
  void badPair
  void badEnding
})

it('MS8 public ACK types enforce paired evidence and ended state', () => {
  type InterruptedWitness = Extract<ModelCallAccountingWitness, { outcome: 'interrupted' }>
  expectTypeOf<InterruptedWitness['initiator']>().toEqualTypeOf<
    'user' | 'run_cancelled' | 'runtime_lost'
  >()
  const base = {
    kind: 'model_call_acknowledged',
    call: 'call',
    creationKey: key,
    creationInput: { role: 'model-call-creation-semantic-sha256/v1', hex: 'a'.repeat(64) },
    acknowledgedAt: '2026-09-29T12:00:00Z',
    releasablePayloads: [],
  } as const
  const unpaired = {
    ...base,
    target: { kind: 'response', response: 'response' },
    terminalState: 'complete',
    retainedResultDigest: {
      role: 'model-call-retained-result-semantic-sha256/v1',
      hex: 'b'.repeat(64),
    },
  } as const
  // @ts-expect-error a retained result digest requires the accounting witness
  const badPair: ModelCallAcknowledgedRecord = unpaired
  const falseEnding = {
    ...base,
    target: { kind: 'ended', ending: 'released' },
    terminalState: 'complete',
  } as const
  // @ts-expect-error released ends handed up, never complete
  const badEnding: ModelCallAcknowledgedRecord = falseEnding
  void badPair
  void badEnding
})
