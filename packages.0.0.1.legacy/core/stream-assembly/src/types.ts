import type {
  ArrivalError,
  ArrivalRejection,
  FinishReason,
  OpenEvent,
  WholeFillBlock,
} from '@omne-harness-lite/arrival-events'
import type { ContentBlock, JsonNumber } from '@omne-harness-lite/content-blocks'
import type { Cost, FrameAccount, TrimSummary, Usage } from '@omne-harness-lite/call-accounts'

export type AssemblyFailure =
  | 'index_reused'
  | 'index_not_monotonic'
  | 'block_not_open'
  | 'block_already_closed'
  | 'payload_kind_mismatch'
  | 'account_duplicate'
  | 'event_after_finish'
  | 'stream_not_finished'

export type AssemblyRejection = AssemblyFailure | ArrivalRejection
export type AcceptRejection = Exclude<AssemblyRejection, 'stream_not_finished'>
export type AssemblyResult<Value, Rejection extends string = AssemblyRejection> =
  { readonly ok: Value } | { readonly rejected: Rejection }

type Opened<Event> = Event extends OpenEvent ? Omit<Event, 't' | 'index'> : never
export type OpenedBlock = Opened<OpenEvent>
export type ReducedContent = string | WholeFillBlock
export type SnapshotBlock =
  | { readonly index: JsonNumber; readonly closed: true; readonly block: ContentBlock }
  | {
      readonly index: JsonNumber
      readonly closed: false
      readonly opened: OpenedBlock
      readonly content?: ReducedContent
    }

export interface AssemblySnapshot {
  readonly blocks: readonly SnapshotBlock[]
  readonly position: JsonNumber
  readonly firstContentAt?: JsonNumber
}

export type AssemblyEnding = {
  readonly firstContentAt?: JsonNumber
} & (
  | { readonly reason: Exclude<FinishReason, 'lost'>; readonly error?: never }
  | { readonly reason: 'lost'; readonly error?: ArrivalError }
)

export interface ModelAssemblyAccount {
  readonly usage: Usage
  readonly cost: Cost
  readonly trims: TrimSummary
}
export interface ToolAssemblyAccount {
  readonly frames: FrameAccount
}
export interface AssemblySettlement {
  readonly blocks: readonly ContentBlock[]
  readonly account: ModelAssemblyAccount | ToolAssemblyAccount
  readonly ending: AssemblyEnding
}
