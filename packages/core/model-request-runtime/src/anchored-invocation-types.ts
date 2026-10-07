import type {
  ReplyDisposition,
  ModelResponse,
  PendingModelResponse,
} from '@omne-harness-lite/model-response'
import type { CapturedModelLogValue } from '@omne-harness-lite/model-request-runtime'
import type { PlanFailure, ModelInvocationHandle } from '@omne-harness-lite/model-request-runtime'
import type { SettlementOwner, SettlementResult } from './settlement-types.ts'
import type { ModelLogSettlementTarget } from '@omne-harness-lite/model-request-runtime'

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
