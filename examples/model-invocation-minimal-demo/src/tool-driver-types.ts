// Application-owned wire data. Pure public consumers see ToolActionHistoryOperations instead.
import type {
  JsonNumber,
  CallId,
  ActionDenialReason,
  ToolCallBlock,
} from '@omne-harness-lite/content-blocks'
import type { RunId, AttemptId } from '@omne-harness-lite/call-accounts'
import type { ContextValue } from '@omne-harness-lite/runtime-context'
import type { RunnerPiece } from '@omne-harness-lite/loop-extension-runner'
import type { ToolMessage } from '@omne-harness-lite/messages'
import type { AvailabilityReport } from '@omne-harness-lite/asset-registry'
import type {
  ActionOrigin,
  AdoptedTool,
  ActionBatchCompletion,
} from '@omne-harness-lite/tool-admission'

export type DriverValue =
  | {
      readonly kind: 'run_started'
      readonly run: RunId
      readonly inboundKey: string
      readonly at: string
    }
  | {
      readonly kind: 'attempt_adopted'
      readonly run: RunId
      readonly attempt: AttemptId
      readonly adoption: string
      readonly report: AvailabilityReport
      readonly tools: readonly AdoptedTool[]
      readonly context: readonly ContextValue[]
      /** Key of the attempt_started system reminder in this same append. */
      readonly startedMessageKey: string
    }
  | {
      readonly kind: 'actions_completed'
      readonly origin: ActionOrigin
      readonly adoption: string
      /** The exact effective chain used to reconstruct each parsed action's conclusions. */
      readonly chain: readonly RunnerPiece[]
      readonly completion: ActionBatchCompletion
    }
  | {
      readonly kind: 'action_denial_intended'
      readonly origin: ActionOrigin
      readonly adoption: string
      readonly call: ToolCallBlock
      readonly reason: ActionDenialReason
    }
  | {
      readonly kind: 'action_denied'
      readonly origin: ActionOrigin
      readonly callId: CallId
      readonly reason: ActionDenialReason
      readonly message: ToolMessage
    }
  | {
      readonly kind: 'continuation_requested'
      readonly origin: ActionOrigin
      readonly requestKey: string
      readonly batch: {
        readonly pass: string
        readonly chain: readonly RunnerPiece[]
        readonly conclusions: readonly string[]
      }
    }
  | {
      readonly kind: 'run_ended'
      readonly run: RunId
      readonly reason: 'completed' | 'failed' | 'cancelled'
      readonly basis: readonly string[]
      readonly at: string
    }

export interface DriverPayload {
  readonly format: 'tool-driver/1'
  readonly category: 'driver'
  readonly value: DriverValue
}
export interface DriverBatchBoundary {
  readonly ownerGeneration: string
  readonly tail: JsonNumber
}
