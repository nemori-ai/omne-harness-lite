// The author execution context: process output, internal waits and wait schemas.
import type { ContentBlock } from '@omne-harness/content-block'
import type { JsonValue } from '@omne-harness/json-text'
import type { Outcome } from '@omne-harness/kernel-basis'
import type { SchemaIssue } from '@omne-harness/schema-provider'
import type { ToolSchemaIdentity, ToolValueSchema } from './definitions.ts'
import type {
  Adoption,
  CallAccess,
  DurableEvidence,
  ToolOperationId,
  ToolWaitId,
} from './identity.ts'
import type { Reply } from './results.ts'

export type ToolProcessUpdate =
  | Readonly<{ kind: 'append-text'; index: string; text: string; close: boolean }>
  | Readonly<{ kind: 'replace'; index: string; content: ContentBlock; close: boolean }>
export type ToolEmitReceipt = Readonly<{ sequence: string }> &
  (Readonly<{ kind: 'local' }> | Readonly<{ kind: 'retained'; evidence: DurableEvidence }>)
export type ToolPrimitiveFailure = Readonly<{ reason: string }> &
  (
    | Readonly<{
        kind:
          | 'invalid'
          | 'unsupported'
          | 'capacity'
          | 'too-large'
          | 'busy'
          | 'conflict'
          | 'closed'
          | 'cancelled'
      }>
    | Readonly<{ kind: 'unavailable' | 'unknown'; operation: string }>
  )
declare const toolWaitContract: unique symbol
export type ToolWaitProtocolDefinition<A, K extends 'ask' | 'resource'> = Readonly<{
  kind: K
  adoption: Adoption
  request: ToolValueSchema<unknown>
  response: ToolValueSchema<A>
  expiry: K extends 'ask' ? 'forbidden' : 'forbidden' | 'supported'
}>
export type ToolWaitContract<A, K extends 'ask' | 'resource'> = ToolWaitProtocolDefinition<A, K> &
  Readonly<{ [toolWaitContract]: true }>
export type ToolDecision<A> =
  | Readonly<{ kind: 'answer'; value: A }>
  | Readonly<{ kind: 'no-answer' }>
  | Readonly<{ kind: 'declined' }>
export type ToolAskRequest<A = JsonValue> = Readonly<{
  kind: 'ask'
  key: string
  contract: ToolWaitContract<A, 'ask'>
  request: JsonValue
}>
export type ToolResourceWaitRequest<A = JsonValue> = Readonly<{
  kind: 'resource'
  key: string
  contract: ToolWaitContract<A, 'resource'>
  request: JsonValue
  deadline: string | null
}>
export type ToolResourceReply<A = JsonValue> =
  | Readonly<{ kind: 'response'; value: A }>
  | Readonly<{ kind: 'expired' }>
export interface ToolProcessEmitter {
  emit(update: ToolProcessUpdate): Promise<Outcome<ToolEmitReceipt, ToolPrimitiveFailure>>
}
export interface ToolWaiter {
  wait<A>(request: ToolAskRequest<A>): Promise<Outcome<ToolDecision<A>, ToolPrimitiveFailure>>
  wait<A>(
    request: ToolResourceWaitRequest<A>,
  ): Promise<Outcome<ToolResourceReply<A>, ToolPrimitiveFailure>>
}
export interface ToolExecutionContext extends ToolProcessEmitter, ToolWaiter {
  readonly mode: 'independent' | 'managed'
  readonly signal: AbortSignal
}
export type ToolAuthorLimits = Readonly<{
  authorBufferBytes: number
  authorBufferItems: number
  authorWaitHistoryBytes: number
  authorWaitHistoryItems: number
}>
export interface ToolExecutionScope {
  readonly context: ToolExecutionContext
  readonly limits: ToolAuthorLimits
  finish(exit: 'returned' | 'failed'): Promise<Outcome<void, ToolPrimitiveFailure>>
}
export type ToolWaitSchemaSnapshot = Readonly<{
  contract: Adoption
  request: ToolSchemaIdentity
  response: ToolSchemaIdentity
  requestMaxBytes: number
  responseMaxBytes: number
  expiry: 'forbidden' | 'supported'
  source: DurableEvidence
}>
export type ToolResponseCandidate =
  | Readonly<{ kind: 'answer' | 'resource'; value: JsonValue }>
  | Readonly<{ kind: 'no-answer' | 'declined' }>
export type ToolWaitValidation =
  | Readonly<{ kind: 'valid'; candidate: ToolResponseCandidate; qualification: DurableEvidence }>
  | Readonly<{ kind: 'invalid'; issues: readonly SchemaIssue[] }>
  | Readonly<{ kind: 'denied' | 'stale' | 'conflict'; reason: string }>
export interface ToolWaitResponseValidator<P> {
  validate(
    input: CallAccess<P> &
      Readonly<{
        wait: ToolWaitId
        submission: ToolOperationId
        source: DurableEvidence
        candidate: ToolResponseCandidate
      }>,
  ): Reply<ToolWaitValidation>
}

/**
 * The local receiver of an independent execution scope (G2, P11). A success means only that the
 * receiver took the update. It does not promise durability across processes.
 */
export interface ToolProcessReceiver {
  receive(
    input: Readonly<{ sequence: string; update: ToolProcessUpdate }>,
  ): Promise<Outcome<void, ToolPrimitiveFailure>>
}

/**
 * The input of `createIndependentToolScope` (G2, P11). The scope keeps its wait history in
 * memory inside `limits`, and its emit receipts are `local`. A null `process` makes `emit`
 * return `unsupported`. A null `waits` makes `wait` return `unsupported`. The scope applies the
 * P11 rules for order, wait keys, cancellation and the return barrier before it calls `waits`.
 */
export type IndependentToolScopeInput = Readonly<{
  limits: ToolAuthorLimits
  signal: AbortSignal
  process: ToolProcessReceiver | null
  waits: ToolWaiter | null
}>
