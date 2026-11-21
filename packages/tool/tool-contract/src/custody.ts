import type { CallAccount } from '@omne-harness/call-account'
import type { CallOutput, ToolBodyReader, ToolOutputReadRequest } from './body-reads.ts'
import type { ContentBlock } from '@omne-harness/content-block'
import type {
  Access,
  Adoption,
  CallAccess,
  ConsumerRef,
  DurableEvidence,
  Mutation,
  ToolCallId,
  ToolCursor,
  ToolOperationId,
  ToolResultVersion,
  ToolWaitId,
} from './identity.ts'
import type { ProcessBlock } from './operations.ts'
import type { WaitRecord } from './records.ts'
import type {
  Attachment,
  InterruptionCause,
  OperationResolution,
  Reply,
  ResultPage,
  ToolLookup,
  ToolResult,
  ToolState,
  ToolTerminal,
} from './results.ts'

export type RawOutput = Readonly<{
  codec: Adoption
  content: Attachment
  custody: DurableEvidence
}>
export type ProcessSnapshot = Readonly<{
  cursor: ToolCursor
  state: ToolState
  blocks: readonly ProcessBlock[]
}>
export type DiagnosticPage = Readonly<{
  entries: readonly Readonly<{
    operation: ToolOperationId
    phase: string
    code: string
    evidence: DurableEvidence
  }>[]
  next: string | null
}>
export type ContentPage = Readonly<{
  result: ToolResultVersion
  attachment: Attachment
  offset: string
  bytes: Uint8Array
  next: string | null
}>
export interface ToolContentReader<P> {
  read(
    input: CallAccess<P> &
      Readonly<{
        result: ToolResultVersion
        attachment: Attachment
        after: string | null
        maxBytes: number
      }>,
  ): Reply<ContentPage>
}
export interface ToolReads<P, B extends ContentBlock> {
  readonly body: ToolBodyReader<P>
  lookup(input: CallAccess<P> & Readonly<{ admission: ToolOperationId }>): Reply<ToolLookup>
  /** The state under that admission, read without a write: an admission not accepted is `invalid`. */
  state(input: CallAccess<P> & Readonly<{ admission: ToolOperationId }>): Reply<ToolState>
  operation(
    input: CallAccess<P> & Readonly<{ operation: ToolOperationId }>,
  ): Reply<OperationResolution>
  result(
    input: CallAccess<P> & Readonly<{ result: ToolResultVersion; after: string | null }>,
  ): Reply<ResultPage<B>>
  process(input: CallAccess<P> & Readonly<{ at: ToolCursor | null }>): Reply<ProcessSnapshot>
  wait(input: CallAccess<P> & Readonly<{ wait: ToolWaitId }>): Reply<WaitRecord>
  diagnostics(input: CallAccess<P> & Readonly<{ after: string | null }>): Reply<DiagnosticPage>
  account(input: CallAccess<P>): Reply<CallAccount>
  readonly content: ToolContentReader<P>
  /** The output body of the call under that admission; reading it changes nothing about the call. */
  output(
    input: CallAccess<P> & Readonly<{ admission: ToolOperationId }> & ToolOutputReadRequest,
  ): Reply<CallOutput>
}
/** How an execution ended, as the usage of a call keeps it: the kind and its cause, no diagnostic. */
export type ToolUsageOutcome =
  | Readonly<{ kind: 'completed' }>
  | Readonly<{ kind: 'failed'; cause: Extract<ToolTerminal, { kind: 'failed' }>['cause'] }>
  | Readonly<{ kind: 'unavailable' }>
  | Readonly<{ kind: 'interrupted'; cause: InterruptionCause }>
  | Readonly<{ kind: 'no-response' }>
/** One settled call as usage counts it; it has no argument, output or body and outlives the sweep. */
export type ToolUsageFact = Readonly<{
  call: ToolCallId
  consumer: ConsumerRef
  tool: string
  start: string | null
  outcome: ToolUsageOutcome
  account: CallAccount
}>
export type ToolUsageQuery = Readonly<{
  /** By the start, both ends included; null takes every dated call. */
  range: Readonly<{ from: string; to: string }> | null
  consumer: Readonly<{ owner: string; works: readonly string[] }> | null
  order: 'ascending' | 'descending'
  after: string | null
  limit: number
}>
export type ToolUsagePage = Readonly<{
  entries: readonly ToolUsageFact[]
  /** Calls in the consumer scope that have no start and so are in no range. */
  undated: number
  next: string | null
}>
export interface ToolAccounts<P> {
  list(input: Access<P> & ToolUsageQuery): Reply<ToolUsagePage>
}
export interface ToolOffloader<P, B extends ContentBlock> {
  offload(
    input: Mutation<P> &
      Readonly<{
        result: ToolResultVersion
        maxBytes: number
        headBytes: number
        tailBytes: number
      }>,
  ): Reply<Readonly<{ source: DurableEvidence; value: ToolResult<B>; originalBytes: string }>>
}
