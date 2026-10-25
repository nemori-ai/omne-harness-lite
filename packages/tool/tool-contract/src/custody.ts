// Output custody, durable reads, content pages and accounts.
import type { CallAccount } from '@omne-harness/call-account'
import type { ContentBlock } from '@omne-harness/content-block'
import type { OrganizationId, TenantId } from '@omne-harness/legal-identity'
import type {
  Adoption,
  CallAccess,
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
  OperationResolution,
  Reply,
  ResultPage,
  ToolLookup,
  ToolResult,
  ToolState,
} from './results.ts'

export type RawOutput = Readonly<{
  codec: Adoption
  content: Attachment
  custody: DurableEvidence
}>
export interface ToolOutputCustody<P> {
  preserve(
    input: Mutation<P> & Readonly<{ codec: Adoption; bytes: Uint8Array; source: DurableEvidence }>,
  ): Reply<RawOutput>
  inspect(
    input: Mutation<P>,
  ): Reply<
    | Readonly<{ kind: 'retained'; raw: RawOutput }>
    | Readonly<{ kind: 'unknown' }>
    | Readonly<{ kind: 'excluded'; evidence: DurableEvidence }>
  >
  retainResult(
    input: Mutation<P> & Readonly<{ raw: RawOutput; value: ToolResult<ContentBlock> }>,
  ): Reply<DurableEvidence>
}
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
  raw(input: CallAccess<P> & Readonly<{ result: ToolResultVersion }>): Reply<RawOutput>
}
export interface ToolReads<P, B extends ContentBlock> {
  lookup(input: CallAccess<P> & Readonly<{ admission: ToolOperationId }>): Reply<ToolLookup>
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
}
export type AccountScope =
  | Readonly<{ kind: 'tenant'; tenant: TenantId }>
  | Readonly<{ kind: 'organization'; organization: OrganizationId }>
export interface ToolAccounts<P> {
  list(
    input: Readonly<{ principal: P; scope: AccountScope; after: string | null; limit: number }>,
  ): Reply<
    Readonly<{
      entries: readonly Readonly<{
        tenant: TenantId
        call: ToolCallId
        start: ToolOperationId | null
        source: DurableEvidence
        account: CallAccount
      }>[]
      next: string | null
    }>
  >
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
