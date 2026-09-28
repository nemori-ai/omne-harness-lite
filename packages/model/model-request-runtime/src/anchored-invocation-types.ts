import type { MessageId } from '@omne-harness-lite/messages'
import type { ModelProfileRef } from '@omne-harness-lite/model-profile'
import type {
  CredentialScope,
  SelectedBy,
  ReplyDisposition,
  ModelResponse,
  PendingModelResponse,
} from '@omne-harness-lite/model-response'
import type { CapturedModelLogValue } from './log-codec.ts'
import type {
  InvocationInput,
  PlanInput,
  PlannedSemantics,
  TransportAdapter,
  InvocationPolicy,
  PlanRejection,
  ModelInvocationHandle,
} from './types.ts'
import type { SettlementCoordinatorInput, SettlementResult } from './settlement-types.ts'

export interface AnchoredInvocationInput<P extends PlannedSemantics, R> {
  readonly planInput: PlanInput
  readonly transport: TransportAdapter<P, R>
  readonly credential: string
  readonly policy: InvocationPolicy
  readonly signal: AbortSignal
  readonly responseId: string
  readonly messageId: MessageId
  readonly profile: ModelProfileRef
  readonly selectedBy: SelectedBy
  readonly credentialScope: CredentialScope
  /** The host establishes actual authorization, log ownership and generation. */
  readonly settlement: SettlementCoordinatorInput
  readonly onAccepted?: InvocationInput<P, R>['onAccepted']
  /** Return the actual borrowed transport/credential references, only after stopped and settled. */
  readonly releaseBorrowed?: () => Promise<void>
}
export type ResponseConstructionResult =
  | { readonly response: ModelResponse; readonly captured: CapturedModelLogValue }
  | { readonly rejected: 'invalidInput' }
export type AnchoredInvocationOutcome =
  | { readonly replyPending: PendingModelResponse }
  | { readonly settled: Extract<SettlementResult, { readonly settled: unknown }> }
  | { readonly rejected: PlanRejection }
  | { readonly cancelledBeforeDispatch: true }
  | { readonly unavailable: true }
export interface AnchoredInvocationHandle {
  readonly outcome: Promise<AnchoredInvocationOutcome>
  readonly snapshot: ModelInvocationHandle['snapshot']
  /** System stop (S-36); user interruption requires the separate durable intent protocol. */
  readonly abort: () => void
  /** Caller-owned settlement through the same whole-batch coordinator, including persisted [M,R]. */
  readonly settleReply: (disposition: ReplyDisposition) => Promise<SettlementResult>
  /** Closes admission; unresolved durable responsibility retains borrowed references. */
  readonly close: () => Promise<{ readonly released: true } | { readonly unavailable: true }>
}
