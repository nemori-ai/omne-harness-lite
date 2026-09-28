import type { CapabilityName } from '@omne-harness-lite/asset-model'
import type {
  CallId,
  ExecutionOutcome,
  JsonNumber,
  JsonObject,
  JsonValue,
  ToolCallBlock,
  ToolResultBlock,
} from '@omne-harness-lite/content-blocks'
import type { OpaqueIdentifier } from '@omne-harness-lite/identity-values'
import type { AttemptId, Cost, ModelCallId, RunId, Usage } from '@omne-harness-lite/call-accounts'
import type {
  AssistantMessage,
  CompactionMessage,
  Message,
  ModelCallDispatchedRecord,
  SystemReminderMessage,
} from '@omne-harness-lite/messages'
import type {
  ModelProfileSnapshot,
  ModelRequestParameters,
  ProviderName,
  RouteName,
} from '@omne-harness-lite/model-profile'
import type { DependencyName, Duration, ModelToolName } from '@omne-harness-lite/tool-definition'

export type Position =
  | 'attempt_started'
  | 'before_persist_message'
  | 'after_persist_message'
  | 'before_compaction'
  | 'after_compaction'
  | 'before_model_call'
  | 'after_model_call'
  | 'before_action'
  | 'after_action'
  | 'before_terminal'
  | 'after_terminal'
export type Dimension =
  | { readonly ending: 'complete_reply' | 'failure'; readonly scope?: never }
  | { readonly scope: 'each' | 'batch'; readonly ending?: never }
export type Power = 'observe' | 'rewrite' | 'veto'
export type ErrorPolicy = 'ignore' | 'record' | 'treat_as_veto'
export type UnavailabilityPolicy = 'skip' | 'veto' | 'fallback'
export type LogHandle = OpaqueIdentifier<'LogHandle'>
export type EnvironmentHandle = OpaqueIdentifier<'EnvironmentHandle'>
export type FailureCause =
  | 'withdrawn'
  | 'scope_disallowed'
  | 'modality_mismatch'
  | 'credential_unavailable'
  | 'request_rejected'
  | 'upstream_unavailable'
  | 'interrupted_mid_reply'
  | 'unrecognized'
export type TerminalFact = { readonly reason?: string } & (
  | { readonly state: 'completed' | 'failed'; readonly initiator?: never }
  | { readonly state: 'cancelled'; readonly initiator: string }
)
/** G-1: the compaction owner defines the contents. */
export type CompactionPlan = JsonObject
export interface ModelRequest {
  readonly target: RouteName
  readonly parameters: ModelRequestParameters
  readonly messages: readonly Message[]
  readonly tools: readonly ModelToolName[]
}
export interface ToolDefinitionRef {
  readonly name: ModelToolName
}
export type ExtensionImplementation =
  | { readonly kind: 'builtin'; readonly builtinName: string }
  | {
      readonly kind: 'command'
      readonly host: 'claude_code' | 'codex'
      readonly dialect: string
      readonly event: string
      readonly command: string
      readonly matcher?: string
      readonly timeout?: Duration
    }
export type PositionDimension =
  | {
      readonly position: Exclude<Position, 'after_model_call' | 'after_action'>
      readonly dimension?: never
    }
  | {
      readonly position: 'after_model_call'
      readonly dimension: Extract<Dimension, { ending: string }>
    }
  | { readonly position: 'after_action'; readonly dimension: Extract<Dimension, { scope: string }> }
type DefinitionPower =
  | { readonly power: 'observe'; readonly onError?: 'ignore'; readonly unavailability?: 'skip' }
  | {
      readonly power: 'rewrite'
      readonly onError?: 'ignore' | 'record'
      readonly unavailability?: 'skip'
    }
  | { readonly power: 'veto'; readonly onError?: ErrorPolicy; readonly unavailability?: 'skip' }
  | {
      readonly power: 'veto'
      readonly onError?: ErrorPolicy
      readonly unavailability: 'veto'
      readonly position:
        | 'before_persist_message'
        | 'before_compaction'
        | 'before_model_call'
        | 'before_action'
        | 'before_terminal'
    }
export type LoopExtensionDefinition = PositionDimension &
  DefinitionPower & {
    readonly name: CapabilityName
    readonly needs?: readonly [DependencyName, ...DependencyName[]]
    readonly implementation: ExtensionImplementation
  }
export interface AttemptStartedSubject {
  readonly attempt: AttemptId
}
export interface BeforePersistMessageSubject {
  readonly message: Message
  readonly producer: 'user' | 'model' | 'tool' | 'system'
}
export interface AfterPersistMessageSubject {
  readonly message: Message
}
export interface BeforeCompactionSubject {
  readonly plan: CompactionPlan
}
export interface AfterCompactionSubject {
  readonly compaction: CompactionMessage
}
export interface BeforeModelCallSubject {
  readonly request: ModelRequest
}
export interface AfterModelCallCompleteReplySubject {
  readonly reply: AssistantMessage
  readonly usage: Usage
  readonly cost: Cost
}
export type AfterModelCallFailureSubject = {
  readonly failure: FailureCause
  readonly profile: ModelProfileSnapshot
  readonly dispatches: readonly [ModelCallDispatchedRecord, ...ModelCallDispatchedRecord[]]
  readonly retryConclusions: readonly ModelRetryConclusion[]
} & (
  | { readonly statusCode?: JsonNumber; readonly inBand?: never }
  | { readonly statusCode: JsonNumber; readonly inBand: true }
)
export interface BeforeActionSubject {
  readonly call: ToolCallBlock
  readonly definition: ToolDefinitionRef
  readonly batch: readonly [CallId, ...CallId[]]
}
export interface AfterActionEachSubject {
  readonly callId: CallId
  readonly outcome: ExecutionOutcome
  readonly result?: ToolResultBlock
}
export interface AfterActionBatchSubject {
  readonly outcomes: readonly [
    { readonly callId: CallId; readonly outcome: ExecutionOutcome },
    ...{ readonly callId: CallId; readonly outcome: ExecutionOutcome }[],
  ]
}
export interface BeforeTerminalSubject {
  readonly proposed: TerminalFact
}
export interface AfterTerminalSubject {
  readonly terminal: TerminalFact
}
export type Subject =
  | AttemptStartedSubject
  | BeforePersistMessageSubject
  | AfterPersistMessageSubject
  | BeforeCompactionSubject
  | AfterCompactionSubject
  | BeforeModelCallSubject
  | AfterModelCallCompleteReplySubject
  | AfterModelCallFailureSubject
  | BeforeActionSubject
  | AfterActionEachSubject
  | AfterActionBatchSubject
  | BeforeTerminalSubject
  | AfterTerminalSubject
export type PositionedSubject =
  | {
      readonly position: 'attempt_started'
      readonly dimension?: never
      readonly subject: AttemptStartedSubject
    }
  | {
      readonly position: 'before_persist_message'
      readonly dimension?: never
      readonly subject: BeforePersistMessageSubject
    }
  | {
      readonly position: 'after_persist_message'
      readonly dimension?: never
      readonly subject: AfterPersistMessageSubject
    }
  | {
      readonly position: 'before_compaction'
      readonly dimension?: never
      readonly subject: BeforeCompactionSubject
    }
  | {
      readonly position: 'after_compaction'
      readonly dimension?: never
      readonly subject: AfterCompactionSubject
    }
  | {
      readonly position: 'before_model_call'
      readonly dimension?: never
      readonly subject: BeforeModelCallSubject
    }
  | {
      readonly position: 'after_model_call'
      readonly dimension: { readonly ending: 'complete_reply' }
      readonly subject: AfterModelCallCompleteReplySubject
    }
  | {
      readonly position: 'after_model_call'
      readonly dimension: { readonly ending: 'failure' }
      readonly subject: AfterModelCallFailureSubject
    }
  | {
      readonly position: 'before_action'
      readonly dimension?: never
      readonly subject: BeforeActionSubject
    }
  | {
      readonly position: 'after_action'
      readonly dimension: { readonly scope: 'each' }
      readonly subject: AfterActionEachSubject
    }
  | {
      readonly position: 'after_action'
      readonly dimension: { readonly scope: 'batch' }
      readonly subject: AfterActionBatchSubject
    }
  | {
      readonly position: 'before_terminal'
      readonly dimension?: never
      readonly subject: BeforeTerminalSubject
    }
  | {
      readonly position: 'after_terminal'
      readonly dimension?: never
      readonly subject: AfterTerminalSubject
    }
export type ExtensionInput = PositionedSubject & {
  readonly earlier: readonly Conclusion[]
  readonly log: LogHandle
  readonly environment: EnvironmentHandle
} & (
    | {
        readonly position: 'before_persist_message'
        readonly run?: never
        readonly attempt?: never
      }
    | {
        readonly position: Exclude<Position, 'before_persist_message'>
        readonly run: RunId
        readonly attempt: AttemptId
      }
  )
export interface ObservedOutput {
  readonly kind: 'observed'
}
export interface InjectOutput {
  readonly kind: 'inject'
  readonly message: SystemReminderMessage
}
export interface RewriteOutput {
  readonly kind: 'rewrite'
  readonly subject: Subject
}
export interface SelectModelOutput {
  readonly kind: 'select_model'
  readonly profile: RouteName
  readonly reason?: string
}
export interface VetoOutput {
  readonly kind: 'veto'
  readonly reason: string
}
export interface StopOutput {
  readonly kind: 'stop'
  readonly terminal?: 'cancelled' | 'failed'
  readonly reason: string
}
export interface RetryPlan {
  readonly provider: ProviderName
  readonly after?: Duration
}
export interface RetryOutput {
  readonly kind: 'retry'
  readonly plan: RetryPlan
}
export interface CardOption {
  readonly id: string
  readonly label: string
  readonly effect?: JsonValue
}
export interface DecisionCardDraft {
  readonly explanation: string
  readonly options: readonly [CardOption, ...CardOption[]]
  readonly about: { readonly position: Position; readonly callId?: CallId }
  readonly proposedRewrite?: { readonly arguments: Exclude<ToolCallBlock['arguments'], undefined> }
}
export interface AskOutput {
  readonly kind: 'ask'
  readonly card: DecisionCardDraft
}
export type ExtensionOutput =
  | ObservedOutput
  | InjectOutput
  | RewriteOutput
  | SelectModelOutput
  | VetoOutput
  | StopOutput
  | RetryOutput
  | AskOutput
export type OutputKind = ExtensionOutput['kind']
type ActionIdentity =
  | {
      readonly position: 'before_action'
      readonly dimension?: never
      readonly callId: CallId
      readonly modelCallId?: never
    }
  | {
      readonly position: 'after_action'
      readonly dimension: { readonly scope: 'each' }
      readonly callId: CallId
      readonly modelCallId?: never
    }
  | {
      readonly position: 'after_action'
      readonly dimension: { readonly scope: 'batch' }
      readonly callId?: never
      readonly modelCallId?: never
    }
  | {
      readonly position: 'after_model_call'
      readonly dimension: { readonly ending: 'complete_reply' }
      readonly callId?: never
      readonly modelCallId?: never
    }
  | {
      readonly position: 'after_model_call'
      readonly dimension: { readonly ending: 'failure' }
      readonly callId?: never
      readonly modelCallId: ModelCallId
    }
  | {
      readonly position: Exclude<Position, 'before_action' | 'after_action' | 'after_model_call'>
      readonly dimension?: never
      readonly callId?: never
      readonly modelCallId?: never
    }
export type Conclusion = ActionIdentity & {
  readonly extension: CapabilityName
  readonly power: Power
  readonly at: string
} & (
    | {
        readonly output: ExtensionOutput
        readonly skipped?: never
        readonly error?: never
        readonly unavailability?: never
      }
    | {
        readonly skipped: 'unavailable'
        readonly unavailability: UnavailabilityPolicy
        readonly output?: never
        readonly error?: never
      }
    | {
        readonly skipped: 'errored'
        readonly error: string
        readonly output:
          | ObservedOutput
          | InjectOutput
          | VetoOutput
          | (StopOutput & { readonly terminal: 'failed' })
        readonly unavailability?: never
      }
  )
export type ModelRetryConclusion = Extract<
  Conclusion,
  { readonly position: 'after_model_call'; readonly dimension: { readonly ending: 'failure' } }
> & {
  readonly output: RetryOutput
  readonly skipped?: never
  readonly error?: never
  readonly unavailability?: never
}
export type Rejection =
  | 'malformed'
  | 'position_unknown'
  | 'power_unknown'
  | 'dimension_missing'
  | 'dimension_not_allowed'
  | 'output_not_allowed_for_power'
  | 'ask_at_forbidden_position'
  | 'output_not_allowed_at_position'
  | 'rewrite_touches_immutable'
  | 'inject_source_mismatch'
export type Judgment<T> = { readonly ok: T } | { readonly rejected: Rejection }
/** Caller-admitted facts from this exact invocation; never resolved or defaulted here. */
export interface ConclusionInputs {
  readonly input: ExtensionInput
  readonly extensionName: CapabilityName
}
