import type { MessageId } from '@omne-harness-lite/messages'
import type { AttemptId, RunId } from '@omne-harness-lite/call-accounts'
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
  PlanFailure,
  ModelInvocationHandle,
} from './types.ts'
import type {
  SettlementCoordinatorInput,
  SettlementOwner,
  SettlementResult,
} from './settlement-types.ts'
import type { ModelLogSettlementTarget } from './log-codec-settlement.ts'

export interface AnchoredInvocationInput<P extends PlannedSemantics, R> {
  /** Actual operation fence; this original dispatch identity is never inferred from recovery. */
  readonly run?: RunId
  readonly attempt?: AttemptId
  readonly planInput: PlanInput
  readonly transport: TransportAdapter<P, R>
  readonly reuseScope?: object
  /** Dynamic consumers retain their exact lease for the entire planning task. */
  readonly trackPlan?: <T>(task: Promise<T>) => Promise<T>
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
  readonly diagnosticEmitterFactory?: InvocationInput<P, R>['diagnosticEmitterFactory']
  /** Return the actual borrowed transport/credential references, only after stopped and settled. */
  readonly releaseBorrowed?: () => Promise<void>
}
export type ResponseConstructionResult =
  | { readonly response: ModelResponse; readonly captured: CapturedModelLogValue }
  | { readonly rejected: 'invalidInput' }
export type AnchoredInvocationOutcome =
  | { readonly replyPending: PendingModelResponse }
  | { readonly settled: Extract<SettlementResult, { readonly settled: unknown }> }
  | PlanFailure
  | { readonly cancelledBeforeDispatch: true }
  | { readonly unavailable: true }
export interface AnchoredInvocationHandle {
  readonly outcome: Promise<AnchoredInvocationOutcome>
  readonly snapshot: ModelInvocationHandle['snapshot']
  /** Original same-target facts are readable only after all owned work actually stops. */
  readonly observedFacts: (
    target: ModelLogSettlementTarget,
  ) => ReturnType<ModelInvocationHandle['observedFacts']>
  /** System stop (S-36); user interruption requires the separate durable intent protocol. */
  readonly abort: () => void
  /** Called only after S-31's original intent was durably confirmed. */
  readonly interrupt: (initiator: 'user' | 'run_cancelled') => void
  /** Borrow the original in-flight registration for S-31's ordered read and intent append. */
  readonly borrowControl: () =>
    | { readonly owner: SettlementOwner; readonly release: () => void }
    | { readonly unavailable: true }
  /** Caller-owned settlement through the same whole-batch coordinator, including persisted [M,R]. */
  readonly settleReply: (disposition: ReplyDisposition) => Promise<SettlementResult>
  /** S-86: ready is already durable; drain work and borrowed resources without a final/cancel. */
  readonly finishReady: () => Promise<{ readonly released: true } | { readonly unavailable: true }>
  /** Closes admission; unresolved durable responsibility retains borrowed references. */
  readonly close: () => Promise<{ readonly released: true } | { readonly unavailable: true }>
}
