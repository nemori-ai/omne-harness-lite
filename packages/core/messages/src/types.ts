import type {
  BlockId,
  CallId,
  ContentBlock,
  FileBlock,
  ImageBlock,
  JsonNumber,
  JsonValue,
  OpaqueJson,
  OriginTag,
  TextBlock,
  ThinkingBlock,
  ToolCallBlock,
  IncompleteToolCallBlock,
  ToolResultBlock,
  ToolResultReason,
  VoiceBlock,
} from '@omne-harness-lite/content-blocks'
import type { AttemptId, ModelCallId } from '@omne-harness-lite/call-accounts'
import type { OpaqueIdentifier, ScopeLayerIdentity } from '@omne-harness-lite/identity-values'
import type {
  ModelProfileRef,
  ModelProfileSnapshot,
  ModelRequestParameters,
  ProviderName,
  RouteName,
} from '@omne-harness-lite/model-profile'

export type MessageId = OpaqueIdentifier<'MessageId'>
// ResponseId is owned by model-response; the copy here avoids a dependency cycle.
export type ResponseId = string
export type CardId = OpaqueIdentifier<'CardId'>
export type SessionRef = OpaqueIdentifier<'SessionRef'>
export type AgentRef = OpaqueIdentifier<'AgentRef'>
export type ScheduleRef = OpaqueIdentifier<'ScheduleRef'>
export type RuntimeContextBlockId = OpaqueIdentifier<'RuntimeContextBlockId'>
export type LoopExtensionName = string
export type AssistantEnding = 'complete' | 'interrupted_by_user' | 'truncated_at_limit'
export type ToolInternalEnding = 'complete' | 'interrupted' | 'lost'
export type ReminderNature = 'event' | 'state'
export type SelectedBy = 'session' | 'layer_lock' | { readonly extension: LoopExtensionName }
export type CredentialScope =
  { readonly layer: 'factory' } | Extract<ScopeLayerIdentity, { layer: 'tenant' }>
export interface ParameterAdjustment {
  readonly name: string
  readonly requested: JsonValue
  readonly sent: JsonValue
}
export interface MessageBase {
  readonly id: MessageId
  readonly type: Message['type']
  readonly blocks: readonly ContentBlock[]
  /** Exchange timestamp; never the log ordering key. */
  readonly createdAt: string
}
export type UnmarkedTextBlock = Omit<TextBlock, 'origin'> & { readonly origin?: never }
export type PlainMessageBlock = UnmarkedTextBlock | VoiceBlock | ImageBlock | FileBlock
export interface SystemMessage extends MessageBase {
  readonly type: 'system'
  readonly blocks: readonly UnmarkedTextBlock[]
}
export interface UserMessage extends MessageBase {
  readonly type: 'user'
  readonly blocks: readonly (TextBlock | VoiceBlock | ImageBlock | FileBlock)[]
}
export type AssistantMessage = Omit<MessageBase, 'type' | 'blocks'> & {
  readonly type: 'assistant'
  readonly response: ResponseId
} & (
    | {
        readonly ending: 'complete'
        readonly blocks: readonly (PlainMessageBlock | ThinkingBlock | ToolCallBlock)[]
      }
    | {
        readonly ending: 'interrupted_by_user' | 'truncated_at_limit'
        readonly blocks: readonly (
          PlainMessageBlock | ThinkingBlock | ToolCallBlock | IncompleteToolCallBlock
        )[]
      }
  )
export type ToolMessageResult =
  | Exclude<ToolResultBlock, { readonly outcome: 'interrupted' }>
  | (Extract<ToolResultBlock, { readonly outcome: 'interrupted' }> & {
      readonly reason: ToolResultReason<
        Exclude<
          Extract<ToolResultBlock, { readonly outcome: 'interrupted' }>['reason']['code'],
          'terminated_by_agent'
        >
      >
    })
export interface ToolMessage extends MessageBase {
  readonly type: 'tool'
  readonly callId: CallId
  readonly blocks: readonly [ToolMessageResult]
}
export interface ToolInternalMessage extends MessageBase {
  readonly type: 'tool_internal'
  readonly callId: CallId
  readonly ending: ToolInternalEnding
  readonly blocks: readonly (PlainMessageBlock & {
    readonly visibility: { readonly toHuman: boolean; readonly toModel: false }
  })[]
}
export interface BackgroundExecutionFinishedSource {
  readonly kind: 'background_execution_finished'
  readonly callId: CallId
  readonly outcome: 'completed' | 'failed' | 'interrupted' | 'no_answer'
}
export interface BackgroundExecutionInterruptedSource {
  readonly kind: 'background_execution_interrupted'
  readonly callId: CallId
}
export interface AttemptStartedSource {
  readonly kind: 'attempt_started'
  readonly attempt: AttemptId
  readonly reason: 'first' | 'resumed_after_interruption' | 'resumed_after_wait'
  readonly at: string
}
export type InterruptedSource = {
  readonly kind: 'interrupted'
  readonly by: 'user' | 'system'
  readonly hadContent: boolean
} & (
  | {
      readonly what: 'model_call'
      readonly about?: {
        readonly kind: 'model'
        readonly call: ModelCallId
        readonly dispatch: JsonNumber
      }
    }
  | { readonly what: 'run'; readonly about?: never }
)
export interface CardAnswer {
  readonly optionId: string
  readonly at: string
}
export interface SystemWaitAnsweredSource {
  readonly kind: 'system_wait_answered'
  readonly cardId: CardId
  readonly extension: LoopExtensionName
  readonly answers: readonly CardAnswer[]
}
export interface LoopGuardSource {
  readonly kind: 'loop_guard'
  readonly level: 'level_1' | 'level_2'
  readonly finding: string
}
export interface PeerSessionNoteSource {
  readonly kind: 'peer_session_note'
  readonly fromSession: SessionRef
  readonly fromAgent?: AgentRef
}
export interface ScheduledTriggerSource {
  readonly kind: 'scheduled_trigger'
  readonly schedule: ScheduleRef
  readonly dueAt: string
}
export interface RuntimeContextChangedSource {
  readonly kind: 'runtime_context_changed'
  readonly block: RuntimeContextBlockId
  readonly previous: JsonValue
  readonly current: Exclude<JsonValue, null>
}
export interface RuntimeContextSnapshotSource {
  readonly kind: 'runtime_context_snapshot'
  readonly blocks: Readonly<Record<string, Exclude<JsonValue, null>>>
  readonly reason: 'session_start' | 'after_compaction'
}
export interface ExtensionSource {
  readonly kind: 'extension'
  readonly extension: LoopExtensionName
  readonly payload?: JsonValue
}
export type EventReminderSource =
  | BackgroundExecutionFinishedSource
  | BackgroundExecutionInterruptedSource
  | AttemptStartedSource
  | InterruptedSource
  | SystemWaitAnsweredSource
  | LoopGuardSource
  | PeerSessionNoteSource
  | ScheduledTriggerSource
export type ReminderSource =
  EventReminderSource | RuntimeContextChangedSource | RuntimeContextSnapshotSource | ExtensionSource
export type SystemReminderMessage = Omit<MessageBase, 'type' | 'blocks'> & {
  readonly type: 'system_reminder'
  readonly blocks: readonly (PlainMessageBlock | ToolResultBlock)[]
} & (
    | { readonly nature: 'event'; readonly source: EventReminderSource }
    | {
        readonly nature: 'state'
        readonly source: RuntimeContextChangedSource | RuntimeContextSnapshotSource
      }
    | { readonly nature: ReminderNature; readonly source: ExtensionSource }
  )
export interface SilencedBlockRef {
  readonly messageId: MessageId
  readonly blockId: BlockId
}
export interface CompactionMessage extends MessageBase {
  readonly type: 'compaction'
  readonly blocks: readonly PlainMessageBlock[]
  readonly silenced: readonly SilencedBlockRef[]
}
export type Message =
  | SystemMessage
  | UserMessage
  | AssistantMessage
  | ToolMessage
  | ToolInternalMessage
  | SystemReminderMessage
  | CompactionMessage
export type OutboundMessage = Exclude<Message, ToolInternalMessage>
export type LoggedMessage = Exclude<Message, SystemMessage>
export interface ModelCallDispatchedRecord {
  readonly kind: 'model_call_dispatched'
  readonly call: ModelCallId
  readonly dispatch: JsonNumber
  readonly provider: ProviderName
  readonly response: ResponseId
  readonly profile: ModelProfileRef
  readonly profileSnapshot: ModelProfileSnapshot
  readonly parameters: ModelRequestParameters
  readonly selectedBy: SelectedBy
  readonly credentialScope: CredentialScope
  readonly parameterAdjustments?: readonly ParameterAdjustment[]
  readonly droppedParameters?: readonly string[]
}
export interface ModelCallOpenedRecord {
  readonly kind: 'model_call_opened'
  readonly call: ModelCallId
  readonly dispatch: JsonNumber
  readonly firstTokenAt: string
}
export interface ModelCallInterruptIntentRecord {
  readonly kind: 'model_call_interrupt_intent'
  readonly call: ModelCallId
  readonly initiator: 'user' | 'run_cancelled'
}
export type UndispatchedCause =
  'withdrawn' | 'scope_disallowed' | 'modality_mismatch' | 'credential_unavailable'
export type ModelCallEndedRecord = {
  readonly kind: 'model_call_ended'
  readonly call: ModelCallId
} & (
  | {
      readonly ending: 'undispatched'
      readonly cause: UndispatchedCause
      readonly initiator?: never
    }
  | {
      readonly ending: 'released'
      readonly cause?: 'credential_unavailable'
      readonly initiator?: never
    }
  | {
      readonly ending: 'interrupted'
      readonly initiator: 'user' | 'run_cancelled'
      readonly cause?: never
    }
)
export interface ModelSelectionChangedRecord {
  readonly kind: 'model_selection_changed'
  readonly routeName: RouteName
  readonly at: string
}
export type ModelInvocationRecord =
  | ModelCallDispatchedRecord
  | ModelCallOpenedRecord
  | ModelCallInterruptIntentRecord
  | ModelCallEndedRecord
  | ModelSelectionChangedRecord
export type MessageRejection =
  | 'type_unknown'
  | 'kind_unknown'
  | 'visibility_missing'
  | 'incomplete_call_visible'
  | 'call_in_result'
  | 'modality_mismatch'
  | 'block_id_duplicate'
  | 'tool_message_block_count'
  | 'tool_internal_block_visible_to_model'
  | 'reminder_nature_mismatch'
  | 'reminder_state_without_previous'
  | 'compaction_self_reference'
  | 'malformed'
  | 'compaction_forward_reference'
export type MessageJudgment = { readonly ok: Message } | { readonly rejected: MessageRejection }
export type ModelInvocationJudgment =
  { readonly ok: ModelInvocationRecord } | { readonly rejected: 'malformed' }
/** Ordered, complete, validated message prefix. The caller owns its consistency and ordering. */
export type LogPrefixView = readonly LoggedMessage[]
export interface CompactionInputs {
  /** Complete owner-supplied list at this exact prefix. Missing does not mean empty. */
  readonly pendingCardBlocks?: readonly SilencedBlockRef[]
  /** Number of prefix messages present at the latest request; null means no request. */
  readonly lastModelRequestPrefixLength?: number | null
}
export type CompactionListJudgment =
  | { readonly valid: true }
  | { readonly valid: false; readonly rule: 3 | 5 | 6 }
  | { readonly undetermined: readonly ('pending_card_blocks' | 'last_model_request')[] }
export type PairingJudgment =
  | { readonly valid: true }
  | { readonly valid: false; readonly rule: 1 | 2 | 3 | 4 | 5 | 7 }
  | { readonly undetermined: 'compaction_list' }
