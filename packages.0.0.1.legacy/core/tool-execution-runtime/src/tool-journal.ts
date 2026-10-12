import type { JsonValue, ToolResultBlock, AttachmentRef } from '@omne-harness-lite/content-blocks'
import type { ToolCallAccount } from '@omne-harness-lite/call-accounts'
import type {
  ToolMessage,
  SystemReminderMessage,
  ToolInternalMessage,
} from '@omne-harness-lite/messages'
import type {
  ExecutionRef,
  ExecutionOrigin,
  ExecutionTerminal,
  SelectedTool,
  WaitRequest,
  Answerer,
} from './tool-execution.ts'
import type {
  ManagedResource,
  EnvironmentAdoption,
} from '@omne-harness-lite/execution-environments'
import type { ContextValue } from '@omne-harness-lite/runtime-context'

export type RawResultReference = AttachmentRef
export interface DeliveryBasis {
  readonly result: ToolResultBlock
  readonly raw?: RawResultReference
  readonly internal?: ToolInternalMessage
  readonly pass: string
  readonly selectedChain: JsonValue
}
export type ToolJournalPayload = {
  readonly ref: ExecutionRef
  readonly revision: 1
} & (
  | {
      readonly kind: 'execution_intended'
      readonly origin: ExecutionOrigin
      readonly selected?: SelectedTool
      readonly input: JsonValue
    }
  | { readonly kind: 'execution_started'; readonly at: string }
  | { readonly kind: 'execution_environment_adopted'; readonly adoption: EnvironmentAdoption }
  | {
      readonly kind: 'execution_context_read'
      readonly readIndex: number
      readonly values: readonly ContextValue[]
    }
  | { readonly kind: 'resource_planned'; readonly resource: ManagedResource }
  | { readonly kind: 'resource_permitted'; readonly key: string }
  | { readonly kind: 'resource_adopted'; readonly key: string }
  | {
      readonly kind: 'execution_waiting'
      readonly waitIndex: number
      readonly request: WaitRequest
    }
  | {
      readonly kind: 'execution_answered'
      readonly waitIndex: number
      readonly answer: JsonValue
      readonly by: Answerer
    }
  | {
      readonly kind: 'execution_ended'
      readonly terminal: ExecutionTerminal
      readonly account: ToolCallAccount
      readonly delivery: DeliveryBasis
    }
  | {
      readonly kind: 'delivery_ready'
      readonly result: ToolResultBlock
      readonly basis:
        | { readonly kind: 'conclusions'; readonly keys: readonly string[] }
        | { readonly kind: 'recovered_without_after_action'; readonly pass: string }
    }
  | { readonly kind: 'delivery_confirmed'; readonly message: ToolMessage | SystemReminderMessage }
  | {
      readonly kind: 'physical_stop_observed'
      readonly key: string
      readonly status: 'confirmed' | 'unconfirmed'
      readonly at: string
      readonly evidence?: JsonValue
    }
)
