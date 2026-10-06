import type { AvailabilityReport } from '@omne-harness-lite/asset-registry'
import type { RunId, AttemptId } from '@omne-harness-lite/call-accounts'
import type { CallId, ToolCallBlock, ActionDenialReason } from '@omne-harness-lite/content-blocks'
import type { CheckedPrefix } from '@omne-harness-lite/session-log'
import type { ToolDefinition } from '@omne-harness-lite/tool-definition'

export type NonEmpty<T> = readonly [T, ...T[]]
export interface ActionOrigin {
  readonly run: RunId
  readonly attempt: AttemptId
  readonly assistantMessage: string
}
export type ActionDecision =
  | { readonly kind: 'allow'; readonly conclusion: string }
  | { readonly kind: 'denied'; readonly reason: ActionDenialReason; readonly conclusion: string }
  | {
      readonly kind: 'notExecutable'
      readonly reason: 'unparseable' | 'no_such_entry'
      readonly conclusion?: string
    }
export type FinalAction = {
  readonly callId: CallId
  readonly effectiveCall: ToolCallBlock
  readonly anchor?: string
  readonly conclusions: readonly string[]
  readonly decision: ActionDecision
}
export interface ActionBatchCompletion {
  readonly key: string
  readonly gate: OfficialActionGate
  readonly items: NonEmpty<FinalAction>
}
/** An adopted runner fact; it is neither an authorization token nor a live presence lease. */
export type OfficialActionGate =
  | { readonly kind: 'available' }
  | { readonly kind: 'missing'; readonly reason: 'chain' | 'contribution' }
export interface AdoptedTool {
  readonly name: string
  readonly capability: string
  readonly asset: string
  readonly version: string
  readonly definition: ToolDefinition
}
export interface ToolActionFacts {
  readonly origin: ActionOrigin
  readonly latestAttempt: AttemptId
  readonly runState: 'open' | 'ended'
  readonly adoption: {
    readonly key: string
    readonly report: AvailabilityReport
    readonly tools: readonly AdoptedTool[]
  }
  /** Original model order, including unparseable calls. */
  readonly calls: NonEmpty<ToolCallBlock>
  readonly batch:
    | { readonly kind: 'pending' }
    | { readonly kind: 'complete'; readonly completion: ActionBatchCompletion }
  readonly route:
    | { readonly kind: 'none' }
    | { readonly kind: 'execution'; readonly intentKey: string }
    | { readonly kind: 'denial'; readonly intentKey: string }
}
export interface ToolActionHistoryOperations {
  /** Pure projection of this exact prefix. It performs no IO and grants no authorization. */
  readonly inspect: (
    prefix: CheckedPrefix,
    call: CallId,
  ) =>
    | { readonly kind: 'known'; readonly facts: ToolActionFacts }
    | { readonly kind: 'notFound' }
    | { readonly kind: 'unavailable' }
}
