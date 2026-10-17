// The trusted guard snapshot of the ledger (G1 `guards`): qualification, source verification,
// the text result factory, the result policy and the admission budgets. The host fixes these at
// construction; the decider consumes only their conclusions.
import type { ContentBlock } from '@omne-harness/content-block'
import type {
  ConsumerRef,
  ResourceScope,
  ResultPolicy,
  TextResultFactory,
  ToolCallId,
  ToolInvocation,
  judgeToolArguments,
} from '@omne-harness/tool-contract'
import type { TenantId } from './ledger-store.ts'

/** The json-text budgets as the contract's arguments judgment takes them. */
export type JsonLimits = Parameters<typeof judgeToolArguments>[1]

/** The resource action a principal asks for. Content, cost, control and release are separate. */
export type ToolLedgerAction =
  | 'admit'
  | 'lookup'
  | 'query-operation'
  | 'control'
  | 'accept-decision'
  | 'accept-resource'
  | 'read-process'
  | 'read-wait'
  | 'read-diagnostics'
  | 'read-result'
  | 'read-content'
  | 'release-delivery'
  | 'account'
  | 'recover'
  | 'write'

export type AccessVerdict =
  | Readonly<{ kind: 'allowed' }>
  | Readonly<{ kind: 'denied'; reason: string }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

/**
 * Answers whether the principal may perform `action` on the call of the tenant. The guard also
 * proves that `tenant` is a genuine tenant identity; the ledger checks only its shape. A missing
 * answer is `unavailable`, never `allowed`.
 */
export interface ToolAccessGuard<P> {
  qualify(
    input: Readonly<{ principal: P; tenant: TenantId; call: ToolCallId; action: ToolLedgerAction }>,
  ): Promise<AccessVerdict>
}

export type SourceVerdict =
  | Readonly<{ kind: 'trusted' }>
  | Readonly<{ kind: 'forged'; reason: string }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

/**
 * Verifies that the invocation source of a request came from a trusted entry and agrees with the
 * consumer and the scope (342 values: a script cannot claim a direct call).
 */
export interface ToolSourceGuard<P> {
  verify(
    input: Readonly<{
      principal: P
      tenant: TenantId
      call: ToolCallId
      invocation: ToolInvocation
      consumer: ConsumerRef
      scope: ResourceScope
    }>,
  ): Promise<SourceVerdict>
}

export type ToolLedgerBudgets = Readonly<{
  /** The json-text budgets of the admission-time argument parse (P02). */
  arguments: JsonLimits
  /** The most bytes of content blocks on one result page (P08). */
  resultPageBytes: number
}>

export type ToolLedgerGuards<P, B extends ContentBlock> = Readonly<{
  access: ToolAccessGuard<P>
  sources: ToolSourceGuard<P>
  /** Makes the text result of a logical terminal (dummy, argument failure). */
  results: TextResultFactory<B>
  /** Judges every result the ledger preserves, including the ones `results` makes. */
  policy: ResultPolicy<B>
  budgets: ToolLedgerBudgets
}>
