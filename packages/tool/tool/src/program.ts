// The program orchestration seam between Code and Tool.
import type { ContentBlock } from '@omne-harness/content-block'
import type { JsonValue } from '@omne-harness/json-text'
import type { ContentPage, RawOutput } from './custody.ts'
import type { FixedToolRequest } from './definitions.ts'
import type { ToolExecutionRef } from './execution.ts'
import type {
  CallAccess,
  DurableEvidence,
  Mutation,
  ToolCallId,
  ToolDeliveryId,
  ToolOperationId,
  ToolResultVersion,
} from './identity.ts'
import type {
  Attachment,
  Effect,
  Reply,
  ResultPage,
  StopReason,
  ToolLookup,
  ToolResult,
  ToolState,
  ToolTerminal,
} from './results.ts'

export type ChildPosition = Readonly<{ program: DurableEvidence; ordinal: string }>
export type ChildReservation = Readonly<{
  parent: ToolCallId
  position: ChildPosition
  child: ToolCallId
  admission: ToolOperationId
  request: FixedToolRequest
  source: DurableEvidence
}>
export type ChildState = Readonly<{ reservation: ChildReservation }> &
  (
    | Readonly<{ kind: 'reserved' | 'unknown' }>
    | Readonly<{ kind: 'excluded'; evidence: DurableEvidence }>
    | Readonly<{ kind: 'admitted'; state: ToolState }>
    | Readonly<{
        kind: 'retained'
        state: ToolState
        result: ToolResultVersion
        custody: DurableEvidence
        release: DurableEvidence
      }>
  )
export type ProgramEnd =
  | Readonly<{ kind: 'returned'; output: RawOutput }>
  | Readonly<{ kind: 'stopped'; reason: StopReason }>
  | Readonly<{
      kind: 'failed'
      cause: 'exception' | 'resource-limit' | 'continuity-lost'
      evidence: DurableEvidence
    }>
export type ProgramClosure = Readonly<{
  operation: ToolOperationId
  end: ProgramEnd
  pending: readonly ToolCallId[]
}> &
  (
    | Readonly<{ kind: 'closing'; barrier: null }>
    | Readonly<{ kind: 'closed'; barrier: DurableEvidence }>
  )
export interface ToolChildren<P> {
  reserve(
    input: Mutation<P> &
      Readonly<{ execution: ToolExecutionRef; position: ChildPosition; request: FixedToolRequest }>,
  ): Reply<ChildReservation>
  admitted(
    input: Mutation<P> & Readonly<{ reservation: ChildReservation; outcome: ToolLookup }>,
  ): Reply<ChildState>
  retain(
    input: Mutation<P> &
      Readonly<{
        child: ToolCallId
        result: ToolResultVersion
        delivery: ToolDeliveryId
        custody: DurableEvidence
        release: DurableEvidence
      }>,
  ): Reply<ChildState>
  list(
    input: CallAccess<P> & Readonly<{ after: string | null; limit: number }>,
  ): Reply<Readonly<{ children: readonly ChildState[]; next: string | null }>>
  close(input: Mutation<P> & Readonly<{ end: ProgramEnd }>): Reply<ProgramClosure>
  closure(input: CallAccess<P>): Reply<ProgramClosure | null>
  confirmBarrier(
    input: Mutation<P> & Readonly<{ close: ToolOperationId; evidence: DurableEvidence }>,
  ): Reply<ProgramClosure>
  finish(input: Mutation<P> & Readonly<{ output: RawOutput }>): Reply<DurableEvidence>
}
export type ProgramToolResult<B extends ContentBlock> = Readonly<{
  child: ToolCallId
  result: ToolResultVersion
  terminal: ToolTerminal
  effect: Effect
  value: ToolResult<B>
}>
export interface ProgramTools<B extends ContentBlock> {
  call(
    input: Readonly<{ name: string; command: string | null; arguments: JsonValue }>,
  ): Reply<ProgramToolResult<B>>
  read(
    input: Readonly<{ child: ToolCallId; result: ToolResultVersion; after: string | null }>,
  ): Reply<ResultPage<B>>
  attachment(
    input: Readonly<{
      child: ToolCallId
      result: ToolResultVersion
      attachment: Attachment
      after: string | null
      maxBytes: number
    }>,
  ): Reply<ContentPage>
}
