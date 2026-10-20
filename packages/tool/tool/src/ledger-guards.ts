// The trusted guard snapshot of the ledger (G1 `guards`): qualification, source verification,
// the scope grant, the text result factory, the result policy and the admission budgets. The host fixes these at
// construction; the decider consumes only their conclusions.
import type { ContentBlock } from '@omne-harness/content-block'
import type {
  Access,
  CallAccess,
  DurableEvidence,
  FactReceipt,
  ToolStartRecord,
  ConsumerRef,
  FixedToolRequest,
  Mutation,
  ResourceScope,
  ResultPolicy,
  TextResultFactory,
  ToolCallId,
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
 * Answers whether the principal may perform `action` on the call of the tenant. The guard must
 * also prove that `tenant` is a tenant identity minted by legal-identity, not an object of the
 * same shape: the ledger checks only the shape and keys its records by the identity texts. A
 * forged tenant is `denied`. A missing answer is `unavailable`, never `allowed`.
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
 * whole admission input: the principal, the tenant, the call, the admission operation, and the
 * fixed request with its target, consumer and scope (342 values: a script cannot claim a direct
 * call). The guard reads the binding the trusted issuer persisted; a source it cannot find, or
 * one whose binding disagrees with the admission input, is forged.
 */
export interface ToolSourceGuard<P> {
  verify(input: Mutation<P> & Readonly<{ request: FixedToolRequest }>): Promise<SourceVerdict>
}

/** Verifies a source confirmation through the assembly's original recovery binding. */
export interface ToolFactAcknowledgementGuard<P> {
  verify(
    input: CallAccess<P> &
      Readonly<{
        start: ToolStartRecord
        source: DurableEvidence
        receipt: FactReceipt
        sourceReceipt: DurableEvidence
      }>,
  ): Promise<SourceVerdict>
}

export type GrantVerdict =
  | Readonly<{ kind: 'granted' }>
  | Readonly<{ kind: 'refused'; reason: string }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

/**
 * Verifies the grant evidence of the concurrency scopes of one scope owner: the owner granted
 * `scope.key` to this tenant and this caller, as `scope.grant` evidences. A grant that is
 * missing, forged or issued to another tenant or caller is `refused`, so a caller cannot change
 * the key to escape a limit. A grant source that cannot be read is `unavailable`, never
 * `granted`. The assembly declares one verifier for each accepted scope owner.
 */
export interface ToolGrantVerifier<P> {
  verifyGrant(
    input: Readonly<{ principal: P; tenant: TenantId; call: ToolCallId; scope: ResourceScope }>,
  ): Promise<GrantVerdict>
}

export type StartVerdict =
  | Readonly<{ kind: 'allowed' }>
  | Readonly<{ kind: 'refused'; reason: string }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

/**
 * Answers whether the fixed request may start now (P02 prepareStart: the current invocation
 * permission and the current qualification). The host builds it from the current definition
 * and permission facts; a script call whose target lost its `programmable` permission after the
 * admission is `refused`. A missing answer is `unavailable`, never `allowed`.
 */
export interface ToolStartGuard<P> {
  qualifyStart(
    input: Readonly<{
      principal: P
      tenant: TenantId
      call: ToolCallId
      request: FixedToolRequest
    }>,
  ): Promise<StartVerdict>
}

/**
 * The admission budgets of the guard snapshot. The result page size is deployment configuration
 * (`ToolConfiguration.resultPageBytes`), so it is not here.
 */
export type ToolLedgerBudgets = Readonly<{
  /** The json-text budgets of the admission-time argument parse (P02). */
  arguments: JsonLimits
}>

export type ToolLedgerGuards<P, B extends ContentBlock> = Readonly<{
  access: ToolAccessGuard<P>
  sources: ToolSourceGuard<P>
  factAcknowledgements: ToolFactAcknowledgementGuard<P>
  /**
   * The verifier of each accepted scope owner, by owner name. A scope whose owner has no
   * verifier here is denied at admission, as a missing grant is.
   */
  grants: ReadonlyMap<string, ToolGrantVerifier<P>>
  /** Answers the current start qualification of an admitted request (prepareStart). */
  starts: ToolStartGuard<P>
  /** Makes the text result of a logical terminal (dummy, argument failure). */
  results: TextResultFactory<B>
  /** Judges every result the ledger preserves, including the ones `results` makes. */
  policy: ResultPolicy<B>
  budgets: ToolLedgerBudgets
}>

/** Current consumer qualification and stable subject comparison for a paired source provider. */
export interface ToolInvokeAuthority<P> {
  qualify(input: Access<P> & Readonly<{ consumer: ConsumerRef }>): Promise<AccessVerdict>
  samePrincipal(input: Readonly<{ current: P; original: P }>): Promise<AccessVerdict>
}
